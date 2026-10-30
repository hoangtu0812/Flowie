"""SharePoint publishing: workspace connection, per-project folder and the publish job.

Flowie stays the source of truth. A document is published when it has an approved release,
is filed in a project's Docs tree, the project has a SharePoint folder and the workspace
connection is enabled. Each new release (v1, v2 …) is uploaded as the latest copy
`<folder>/<module>/<feature>/<title>.md` and as the kept copy `…/_versions/<title>_vN.md`,
both with the content frozen at approval, never the draft being edited.
Nothing is read back from SharePoint (one-way, as agreed for the first phase).
VI: Phát hành SharePoint: kết nối của workspace, thư mục cho từng dự án và job phát hành.
VI: Flowie vẫn là nguồn chính. Tài liệu được phát hành khi có phiên bản đã duyệt, nằm trong
VI: cây Docs của dự án, dự án có thư mục SharePoint và kết nối workspace đang bật. Mỗi phiên
VI: bản mới (v1, v2 …) được tải lên thành bản mới nhất `<thư mục>/<module>/<tính năng>/<tiêu đề>.md`
VI: và bản lưu `…/_versions/<tiêu đề>_vN.md`, cả hai mang nội dung chụp lúc duyệt, không bao giờ
VI: là bản nháp đang sửa. Không đọc ngược từ SharePoint (một chiều, theo thống nhất cho giai đoạn đầu).
"""

from __future__ import annotations

import json
import logging
from datetime import timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.config import Settings
from ...core.errors import ApiError
from ...domains.scm.security import decrypt_secret_bundle, encrypt_secret_bundle
from ..work_items.document_tree import folder_label
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
        "publishAttachments": row["publish_attachments"],
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
    client_secret: str | None, enabled: bool, publish_attachments: bool = False,
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
               (workspace_id, tenant_id, client_id, secret_encrypted, enabled, publish_attachments, updated_by, created_at, updated_at)
               VALUES (:workspace, :tenant, :client, :secret, :enabled, :attachments, :user, :now, :now)
               ON CONFLICT (workspace_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
                 client_id = EXCLUDED.client_id, secret_encrypted = EXCLUDED.secret_encrypted,
                 enabled = EXCLUDED.enabled, publish_attachments = EXCLUDED.publish_attachments, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at"""
        ),
        {
            "workspace": workspace_id, "tenant": tenant_id, "client": client_id, "secret": secret,
            "enabled": enabled, "attachments": publish_attachments, "user": user_id, "now": now,
        },
    )
    return connection_payload(await connection_row(db, workspace_id))


def graph_client(http: httpx.AsyncClient, settings: Settings, row: Any) -> GraphClient:
    secret = decrypt_secret_bundle(settings, row["secret_encrypted"]).get("clientSecret", "")
    return GraphClient(http, row["tenant_id"], row["client_id"], secret)


async def _folder_names(db, folder_id: str) -> list[str]:
    """Folder labels (`NN · name` when numbered) from below the project root down to `folder_id`,
    so SharePoint mirrors the numbered Docs tree.
    VI: Nhãn thư mục (`NN · tên` khi có số) từ dưới thư mục gốc dự án xuống tới `folder_id`, để
    VI: SharePoint giống cây Docs có đánh số."""
    rows = (
        await db.execute(
            text(
                """WITH RECURSIVE chain AS (
                     SELECT id, parent_id, name, number, kind, 0 AS depth FROM document_folders WHERE id = :id
                     UNION ALL
                     SELECT f.id, f.parent_id, f.name, f.number, f.kind, chain.depth + 1
                     FROM document_folders f JOIN chain ON f.id = chain.parent_id WHERE chain.depth < 16)
                   SELECT name, number, kind, parent_id FROM chain ORDER BY depth DESC"""
            ),
            {"id": folder_id},
        )
    ).mappings().all()
    return [
        folder_label(row["name"], row["number"])
        for row in rows
        if not (row["kind"] == "project" and row["parent_id"] is None)
    ]


def publish_path(folder_path: str, folders: list[str], title: str, release: int | None = None) -> str:
    """`<folder from URL>/<module>/<feature>/<title>.md` with SharePoint-safe names; with a
    release, the kept copy `…/<feature>/_versions/<title>_vN.md` instead.
    VI: `<thư mục từ URL>/<module>/<tính năng>/<tiêu đề>.md` với tên hợp lệ cho SharePoint; khi có
    VI: release thì là bản lưu `…/<tính năng>/_versions/<tiêu đề>_vN.md`."""
    parts = [folder_path.strip("/")] if folder_path.strip("/") else []
    parts += [safe_name(name) for name in folders]
    if release is None:
        parts.append(f"{safe_name(title)}.md")
    else:
        parts += ["_versions", f"{safe_name(title)}_v{release}.md"]
    return "/".join(parts)


VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")


def release_markdown(release: Any) -> str:
    """Release content behind a YAML front matter naming its version, approver and approval
    time (Vietnam time), so a copy read outside Flowie still says what was approved and when.
    Strings are written with `json.dumps`, which is valid double-quoted YAML.
    VI: Nội dung phiên bản kèm front matter YAML ghi version, người duyệt và thời điểm duyệt (giờ
    VI: Việt Nam), để bản đọc ngoài Flowie vẫn biết nội dung nào đã được duyệt và khi nào.
    VI: Chuỗi được ghi bằng `json.dumps`, là chuỗi YAML trong ngoặc kép hợp lệ."""
    approved = release["approved_at"].replace(tzinfo=timezone.utc).astimezone(VIETNAM)
    header = [
        "---",
        f"title: {json.dumps(release['title'], ensure_ascii=False)}",
        f"version: v{release['release']}",
        f"approved_by: {json.dumps(release['approver'] or '', ensure_ascii=False)}",
        f"approved_at: {approved:%Y-%m-%d %H:%M} +07",
        f"document_id: {release['id']}",
        "---",
    ]
    return "\n".join(header) + "\n\n" + release["content"]


# The latest release decides what is due, not the document status: a document back in Draft
# keeps its last release published until the next approval.
# VI: Phiên bản mới nhất quyết định việc đến hạn, không phải trạng thái tài liệu: tài liệu đã
# VI: về Nháp vẫn giữ phiên bản cuối đã phát hành cho tới lần duyệt kế tiếp.
DUE_QUERY = """
SELECT d.id, d.workspace_id, d.folder_id, r.release, r.revision, r.title, r.content,
       r.approved_at, u.name AS approver, p.id AS project_id, p.sharepoint_folder_url
FROM documents d
JOIN LATERAL (
  SELECT * FROM document_releases WHERE document_id = d.id ORDER BY release DESC LIMIT 1
) r ON TRUE
LEFT JOIN users u ON u.id = r.approved_by
JOIN document_folders f ON f.id = d.folder_id
JOIN projects p ON p.id = f.project_id AND p.archived_at IS NULL
JOIN sharepoint_connections c ON c.workspace_id = d.workspace_id AND c.enabled
LEFT JOIN document_publications pub ON pub.document_id = d.id
WHERE d.archived_at IS NULL AND p.sharepoint_folder_url IS NOT NULL
  AND (pub.release IS NULL OR pub.release < r.release)
  AND (pub.attempted_at IS NULL OR pub.last_error IS NULL OR pub.attempted_at <
       CAST(:now AS timestamp) - make_interval(mins => LEAST(CAST(:cap AS int), power(2, LEAST(pub.attempts, 6))::int)))
ORDER BY r.approved_at
LIMIT :limit
"""


async def _record(db, document: Any, *, now, path=None, item=None, error=None) -> None:
    await db.execute(
        text(
            """INSERT INTO document_publications
               (document_id, workspace_id, version, release, path, item_id, web_url, published_at, attempted_at, attempts, last_error)
               VALUES (:document, :workspace, :version, :release, :path, :item, :url, :published, :now, :attempts, :error)
               ON CONFLICT (document_id) DO UPDATE SET
                 version = COALESCE(EXCLUDED.version, document_publications.version),
                 release = COALESCE(EXCLUDED.release, document_publications.release),
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
            "version": None if error else document["revision"],
            "release": None if error else document["release"], "path": path,
            "item": item and item.get("id"), "url": item and item.get("webUrl"),
            "published": None if error else now, "now": now, "attempts": 1 if error else 0,
            "error": error,
        },
    )


async def publish_due(factory, settings: Settings, http: httpx.AsyncClient | None = None) -> int:
    """Upload the latest release of due documents; returns how many were published.

    One run at a time across API replicas (transaction advisory lock). A failure is stored
    on the document's publication row and retried later with backoff; it never stops the
    other documents. A folder URL is resolved once per project per run.
    VI: Tải lên phiên bản mới nhất của tài liệu đến hạn; trả về số tài liệu đã phát hành. Chỉ một lượt
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
                    names = await _folder_names(db, document["folder_id"])
                    body = release_markdown(document).encode("utf-8")
                    # The kept copy goes first: a failure between the two uploads is retried in
                    # full, and PUT overwrites, so repeating either upload is harmless.
                    # VI: Bản lưu được tải trước: lỗi giữa hai lần tải sẽ được thử lại cả hai, và
                    # VI: PUT ghi đè nên tải lại lần nào cũng an toàn.
                    await client.upload(
                        target["driveId"],
                        publish_path(target["folderPath"], names, document["title"], document["release"]),
                        body,
                    )
                    path = publish_path(target["folderPath"], names, document["title"])
                    item = await client.upload(target["driveId"], path, body)
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
