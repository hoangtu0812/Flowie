"""SharePoint publishing: workspace connection, per-project folder and the publish job.

Flowie stays the source of truth. A document is published when it is Approved, filed in a
project's Docs tree, the project has a SharePoint folder and the workspace connection is
enabled; each new version is uploaded again as `<folder>/<module>/<feature>/<title>.md`.
Nothing is read back from SharePoint (one-way, as agreed for the first phase).
VI: Phát hành SharePoint: kết nối của workspace, thư mục cho từng dự án và job phát hành.
VI: Flowie vẫn là nguồn chính. Tài liệu được phát hành khi ở trạng thái Đã duyệt, nằm trong
VI: cây Docs của dự án, dự án có thư mục SharePoint và kết nối workspace đang bật; mỗi version
VI: mới được tải lại thành `<thư mục>/<module>/<tính năng>/<tiêu đề>.md`. Không đọc ngược từ
VI: SharePoint (một chiều, theo thống nhất cho giai đoạn đầu).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.config import Settings
from ...core.errors import ApiError
from ...domains.scm.security import decrypt_secret_bundle, encrypt_secret_bundle
from .graph import GraphClient, SharePointError, parse_folder_url, safe_name

logger = logging.getLogger(__name__)
BATCH = 20
# Retry delay after a failure doubles per attempt (1, 2, 4 … minutes), capped at an hour.
# VI: Thời gian chờ thử lại sau lỗi tăng gấp đôi mỗi lần (1, 2, 4 … phút), tối đa một giờ.
MAX_BACKOFF_MINUTES = 60


def connection_payload(row: Any | None) -> dict[str, Any]:
    if not row:
        return {"configured": False, "enabled": False}
    return {
        "configured": True,
        "enabled": row["enabled"],
        "tenantId": row["tenant_id"],
        "clientId": row["client_id"],
        "updatedAt": row["updated_at"],
    }


async def connection_row(db, workspace_id: str) -> Any | None:
    return (
        await db.execute(
            text("SELECT * FROM sharepoint_connections WHERE workspace_id = :workspace"),
            {"workspace": workspace_id},
        )
    ).mappings().first()


async def save_connection(
    db, settings: Settings, workspace_id: str, user_id: str, *, tenant_id: str, client_id: str,
    client_secret: str | None, enabled: bool,
) -> dict[str, Any]:
    """Create or update the workspace connection; the secret is kept when left empty.
    VI: Tạo hoặc cập nhật kết nối của workspace; để trống secret thì giữ secret cũ."""
    current = await connection_row(db, workspace_id)
    if client_secret:
        secret = encrypt_secret_bundle(settings, {"clientSecret": client_secret})
    elif current:
        secret = current["secret_encrypted"]
    else:
        raise ApiError(400, "A client secret is required for the first connection.", "Bad Request")
    now = _utcnow()
    await db.execute(
        text(
            """INSERT INTO sharepoint_connections
               (workspace_id, tenant_id, client_id, secret_encrypted, enabled, updated_by, created_at, updated_at)
               VALUES (:workspace, :tenant, :client, :secret, :enabled, :user, :now, :now)
               ON CONFLICT (workspace_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
                 client_id = EXCLUDED.client_id, secret_encrypted = EXCLUDED.secret_encrypted,
                 enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at"""
        ),
        {
            "workspace": workspace_id, "tenant": tenant_id, "client": client_id, "secret": secret,
            "enabled": enabled, "user": user_id, "now": now,
        },
    )
    return connection_payload(await connection_row(db, workspace_id))


def graph_client(http: httpx.AsyncClient, settings: Settings, row: Any) -> GraphClient:
    secret = decrypt_secret_bundle(settings, row["secret_encrypted"]).get("clientSecret", "")
    return GraphClient(http, row["tenant_id"], row["client_id"], secret)


async def _folder_names(db, folder_id: str) -> list[str]:
    """Folder names from below the project root down to `folder_id`.
    VI: Tên các thư mục từ dưới thư mục gốc dự án xuống tới `folder_id`."""
    rows = (
        await db.execute(
            text(
                """WITH RECURSIVE chain AS (
                     SELECT id, parent_id, name, kind, 0 AS depth FROM document_folders WHERE id = :id
                     UNION ALL
                     SELECT f.id, f.parent_id, f.name, f.kind, chain.depth + 1
                     FROM document_folders f JOIN chain ON f.id = chain.parent_id WHERE chain.depth < 16)
                   SELECT name, kind, parent_id FROM chain ORDER BY depth DESC"""
            ),
            {"id": folder_id},
        )
    ).mappings().all()
    return [row["name"] for row in rows if not (row["kind"] == "project" and row["parent_id"] is None)]


def publish_path(folder_path: str, folders: list[str], title: str) -> str:
    """`<folder from URL>/<module>/<feature>/<title>.md` with SharePoint-safe names.
    VI: `<thư mục từ URL>/<module>/<tính năng>/<tiêu đề>.md` với tên hợp lệ cho SharePoint."""
    parts = [folder_path.strip("/")] if folder_path.strip("/") else []
    parts += [safe_name(name) for name in folders]
    parts.append(f"{safe_name(title)}.md")
    return "/".join(parts)


DUE_QUERY = """
SELECT d.id, d.workspace_id, d.title, d.content, d.version, d.folder_id,
       p.id AS project_id, p.sharepoint_folder_url
FROM documents d
JOIN document_folders f ON f.id = d.folder_id
JOIN projects p ON p.id = f.project_id AND p.archived_at IS NULL
JOIN sharepoint_connections c ON c.workspace_id = d.workspace_id AND c.enabled
LEFT JOIN document_publications pub ON pub.document_id = d.id
WHERE d.status = 'APPROVED' AND d.archived_at IS NULL AND p.sharepoint_folder_url IS NOT NULL
  AND (pub.version IS NULL OR pub.version < d.version)
  AND (pub.attempted_at IS NULL OR pub.last_error IS NULL OR pub.attempted_at <
       CAST(:now AS timestamp) - make_interval(mins => LEAST(CAST(:cap AS int), power(2, LEAST(pub.attempts, 6))::int)))
ORDER BY d.updated_at
LIMIT :limit
"""


async def _record(db, document: Any, *, now, path=None, item=None, error=None) -> None:
    await db.execute(
        text(
            """INSERT INTO document_publications
               (document_id, workspace_id, version, path, item_id, web_url, published_at, attempted_at, attempts, last_error)
               VALUES (:document, :workspace, :version, :path, :item, :url, :published, :now, :attempts, :error)
               ON CONFLICT (document_id) DO UPDATE SET
                 version = COALESCE(EXCLUDED.version, document_publications.version),
                 path = COALESCE(EXCLUDED.path, document_publications.path),
                 item_id = COALESCE(EXCLUDED.item_id, document_publications.item_id),
                 web_url = COALESCE(EXCLUDED.web_url, document_publications.web_url),
                 published_at = COALESCE(EXCLUDED.published_at, document_publications.published_at),
                 attempted_at = EXCLUDED.attempted_at,
                 attempts = CASE WHEN EXCLUDED.last_error IS NULL THEN 0 ELSE document_publications.attempts + 1 END,
                 last_error = EXCLUDED.last_error"""
        ),
        {
            "document": document["id"], "workspace": document["workspace_id"],
            "version": None if error else document["version"], "path": path,
            "item": item and item.get("id"), "url": item and item.get("webUrl"),
            "published": None if error else now, "now": now, "attempts": 1 if error else 0,
            "error": error,
        },
    )


async def publish_due(factory, settings: Settings, http: httpx.AsyncClient | None = None) -> int:
    """Upload due Approved documents; returns how many were published.

    One run at a time across API replicas (transaction advisory lock). A failure is stored
    on the document's publication row and retried later with backoff; it never stops the
    other documents. A folder URL is resolved once per project per run.
    VI: Tải lên các tài liệu Đã duyệt đến hạn; trả về số tài liệu đã phát hành. Chỉ một lượt
    VI: chạy cùng lúc giữa các bản API (advisory lock theo transaction). Lỗi được lưu vào dòng
    VI: publication của tài liệu và thử lại sau với thời gian chờ tăng dần; lỗi không chặn tài
    VI: liệu khác. URL thư mục chỉ được phân giải một lần cho mỗi dự án trong mỗi lượt.
    """
    async with factory() as db:
        locked = (
            await db.execute(text("SELECT pg_try_advisory_xact_lock(hashtextextended('sharepoint-publish', 0))"))
        ).scalar_one()
        if not locked:
            return 0
        now = _utcnow()
        due = (
            await db.execute(text(DUE_QUERY), {"now": now, "cap": MAX_BACKOFF_MINUTES, "limit": BATCH})
        ).mappings().all()
        if not due:
            return 0
        published = 0
        owns_http = http is None
        http = http or httpx.AsyncClient(timeout=30)
        clients: dict[str, GraphClient] = {}
        folders: dict[str, dict[str, Any]] = {}
        try:
            for document in due:
                try:
                    workspace = document["workspace_id"]
                    if workspace not in clients:
                        clients[workspace] = graph_client(http, settings, await connection_row(db, workspace))
                    client = clients[workspace]
                    if document["project_id"] not in folders:
                        folders[document["project_id"]] = await client.resolve_folder(document["sharepoint_folder_url"])
                    target = folders[document["project_id"]]
                    path = publish_path(
                        target["folderPath"], await _folder_names(db, document["folder_id"]), document["title"]
                    )
                    item = await client.upload(target["driveId"], path, document["content"].encode("utf-8"))
                    await _record(db, document, now=now, path=path, item=item)
                    published += 1
                except (SharePointError, ApiError, httpx.HTTPError) as error:
                    message = str(error) if isinstance(error, SharePointError) else (
                        error.message if isinstance(error, ApiError) else "SharePoint could not be reached."
                    )
                    await _record(db, document, now=now, error=message[:500])
        finally:
            if owns_http:
                await http.aclose()
        await db.commit()
        return published


async def project_publishing(db, workspace_id: str, project_id: str) -> dict[str, Any]:
    """Folder URL of a project and whether the workspace connection is enabled.
    VI: URL thư mục của dự án và kết nối workspace có đang bật hay không."""
    url = (
        await db.execute(
            text("SELECT sharepoint_folder_url FROM projects WHERE id = :id AND workspace_id = :workspace"),
            {"id": project_id, "workspace": workspace_id},
        )
    ).scalar_one_or_none()
    row = await connection_row(db, workspace_id)
    return {"folderUrl": url, "connectionEnabled": bool(row and row["enabled"])}


def checked_folder_url(url: str | None) -> str | None:
    if not url or not url.strip():
        return None
    try:
        parse_folder_url(url)
    except SharePointError as error:
        raise ApiError(400, str(error), "Bad Request") from error
    return url.strip()
