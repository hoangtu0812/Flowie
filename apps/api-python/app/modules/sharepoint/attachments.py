"""One-way copy of attachments to the project's SharePoint folder.

Runs beside document publishing with the same workspace connection and project folder, and
only when the connection has `publish_attachments` on. MinIO stays the primary store; each
attachment is uploaded once (attachments never change after upload) and nothing is read back
or deleted on SharePoint. Old attachments are included, so turning the option on backfills.
Where files land under the project folder:
- issue and comment attachments: `Attachments/<issue identifier> <issue title>/<file>`;
- project and project-update attachments: `Attachments/_Project/<file>`;
- Docs files and document attachments: the numbered Docs folder path, as documents use.
Two files with the same name (ignoring case) in one place get ` (2)`, ` (3)` … in upload order.
VI: Sao chép một chiều attachment lên thư mục SharePoint của dự án. Chạy cạnh phát hành tài
VI: liệu, dùng chung kết nối workspace và thư mục dự án, chỉ khi kết nối bật
VI: `publish_attachments`. MinIO vẫn là nơi lưu chính; mỗi attachment chỉ tải lên một lần
VI: (attachment không đổi sau khi tải lên), không đọc ngược và không xóa gì trên SharePoint.
VI: Attachment cũ cũng được tính, nên bật tùy chọn là đẩy bù cả file cũ. Vị trí dưới thư mục dự án:
VI: - attachment của issue và comment: `Attachments/<mã issue> <tiêu đề issue>/<file>`;
VI: - attachment của dự án và project update: `Attachments/_Project/<file>`;
VI: - file trong Docs và attachment của tài liệu: đường dẫn thư mục Docs có số, như tài liệu.
VI: Hai file trùng tên (không phân biệt hoa thường) ở cùng chỗ được thêm ` (2)`, ` (3)` … theo thứ tự tải lên.
"""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.config import Settings
from ...core.errors import ApiError
from ...storage.minio import MinioStorage
from .graph import GraphClient, SharePointError, safe_name
from .service import BATCH, MAX_BACKOFF_MINUTES, _folder_names, connection_row, graph_client

# Every attachment of a publishing project is numbered within its SharePoint folder (`copy`),
# archived issues and deleted comments included, so a later file can never take the name of
# one already uploaded. Only active ones that are not yet uploaded are due.
# shortcut: the numbering scans all attachments of enabled workspaces each run; add a stored
# copy number if that table grows past what a one-minute scan handles.
# VI: Mọi attachment của dự án có phát hành được đánh số trong thư mục SharePoint của nó (`copy`),
# VI: kể cả issue đã archive và comment đã xóa, để file sau không bao giờ lấy tên của file đã tải.
# VI: Chỉ attachment còn hoạt động và chưa tải lên mới đến hạn.
# VI: shortcut: việc đánh số quét mọi attachment của workspace đang bật mỗi lượt; lưu sẵn số thứ
# VI: tự nếu bảng lớn tới mức một lượt mỗi phút không kịp.
DUE_QUERY = """
WITH targets AS (
  SELECT a.id, a.workspace_id, a.entity_type, a.object_key, a.filename, a.mime_type, a.created_at,
         p.id AS project_id, p.sharepoint_folder_url,
         COALESCE(i.identifier, ci.identifier) AS issue_key, COALESCE(i.title, ci.title) AS issue_title,
         COALESCE(df.id, ddf.id) AS folder_id,
         CASE WHEN a.entity_type IN ('issue', 'comment') THEN i.archived_at IS NULL AND ci.archived_at IS NULL
                AND cm.deleted_at IS NULL
              WHEN a.entity_type = 'document' THEN dd.archived_at IS NULL
              ELSE TRUE END AS active,
         ROW_NUMBER() OVER (
           PARTITION BY p.id, CASE WHEN a.entity_type IN ('issue', 'comment') THEN 'i:' || COALESCE(i.id, ci.id)
                                   WHEN a.entity_type IN ('document', 'document-folder') THEN 'f:' || COALESCE(df.id, ddf.id)
                                   ELSE 'p' END, lower(a.filename)
           ORDER BY a.created_at, a.id) AS copy
  FROM attachments a
  JOIN sharepoint_connections c ON c.workspace_id = a.workspace_id AND c.enabled AND c.publish_attachments
  LEFT JOIN issues i ON a.entity_type = 'issue' AND i.id = a.entity_id
  LEFT JOIN comments cm ON a.entity_type = 'comment' AND cm.id = a.entity_id
  LEFT JOIN issues ci ON ci.id = cm.issue_id
  LEFT JOIN project_updates pu ON a.entity_type = 'project-update' AND pu.id = a.entity_id
  LEFT JOIN document_folders df ON a.entity_type = 'document-folder' AND df.id = a.entity_id
  LEFT JOIN documents dd ON a.entity_type = 'document' AND dd.id = a.entity_id
  LEFT JOIN document_folders ddf ON ddf.id = dd.folder_id
  JOIN projects p ON p.workspace_id = a.workspace_id AND p.archived_at IS NULL
   AND p.sharepoint_folder_url IS NOT NULL
   AND p.id = COALESCE(i.project_id, ci.project_id, pu.project_id, df.project_id, ddf.project_id,
                       CASE WHEN a.entity_type = 'project' THEN a.entity_id END)
)
SELECT t.* FROM targets t
LEFT JOIN attachment_publications pub ON pub.attachment_id = t.id
WHERE t.active AND pub.published_at IS NULL
  AND (pub.attempted_at IS NULL OR pub.attempted_at <
       CAST(:now AS timestamp) - make_interval(mins => LEAST(CAST(:cap AS int), power(2, LEAST(pub.attempts, 6))::int)))
ORDER BY t.created_at, t.id
LIMIT :limit
"""


def numbered(filename: str, copy: int) -> str:
    """`report.pdf` stays as is for the first copy and becomes `report (2).pdf` for the second.
    VI: `report.pdf` giữ nguyên với bản đầu và thành `report (2).pdf` với bản thứ hai."""
    if copy <= 1:
        return filename
    stem, dot, extension = filename.rpartition(".")
    return f"{stem} ({copy}).{extension}" if dot and stem else f"{filename} ({copy})"


async def attachment_path(db, folder_path: str, attachment: Any) -> str:
    """Path of the attachment in the drive, below the folder taken from the project's URL.
    VI: Đường dẫn của attachment trong drive, bên dưới thư mục lấy từ URL của dự án."""
    parts = [folder_path.strip("/")] if folder_path.strip("/") else []
    if attachment["entity_type"] in ("issue", "comment"):
        parts += ["Attachments", safe_name(f"{attachment['issue_key']} {attachment['issue_title'][:80]}")]
    elif attachment["entity_type"] in ("document", "document-folder"):
        parts += [safe_name(name) for name in await _folder_names(db, attachment["folder_id"])]
    else:
        parts += ["Attachments", "_Project"]
    parts.append(safe_name(numbered(attachment["filename"], attachment["copy"])))
    return "/".join(parts)


async def _record(db, attachment: Any, *, now, path=None, item=None, error=None) -> None:
    await db.execute(
        text(
            """INSERT INTO attachment_publications
               (attachment_id, workspace_id, path, item_id, web_url, published_at, attempted_at, attempts, last_error)
               VALUES (:attachment, :workspace, :path, :item, :url, :published, :now, :attempts, :error)
               ON CONFLICT (attachment_id) DO UPDATE SET
                 path = COALESCE(EXCLUDED.path, attachment_publications.path),
                 item_id = COALESCE(EXCLUDED.item_id, attachment_publications.item_id),
                 web_url = COALESCE(EXCLUDED.web_url, attachment_publications.web_url),
                 published_at = COALESCE(EXCLUDED.published_at, attachment_publications.published_at),
                 attempted_at = EXCLUDED.attempted_at,
                 attempts = CASE WHEN EXCLUDED.last_error IS NULL THEN 0 ELSE attachment_publications.attempts + 1 END,
                 last_error = EXCLUDED.last_error"""
        ),
        {
            "attachment": attachment["id"], "workspace": attachment["workspace_id"], "path": path,
            "item": item and item.get("id"), "url": item and item.get("webUrl"),
            "published": None if error else now, "now": now, "attempts": 1 if error else 0, "error": error,
        },
    )


async def publish_attachments_due(
    factory, settings: Settings, http: httpx.AsyncClient | None = None, storage: Any = None
) -> int:
    """Copy due attachments to SharePoint; returns how many were uploaded.

    Same rules as document publishing: one run at a time across API replicas (its own
    advisory lock), a failure is stored on the attachment's row and retried with backoff
    without stopping the others, and a folder URL is resolved once per project per run.
    VI: Sao chép attachment đến hạn lên SharePoint; trả về số file đã tải. Cùng quy tắc với
    VI: phát hành tài liệu: chỉ một lượt chạy cùng lúc giữa các bản API (advisory lock riêng),
    VI: lỗi được lưu vào dòng của attachment và thử lại với thời gian chờ tăng dần mà không chặn
    VI: file khác, URL thư mục chỉ phân giải một lần cho mỗi dự án trong mỗi lượt.
    """
    async with factory() as db:
        locked = (
            await db.execute(text("SELECT pg_try_advisory_xact_lock(hashtextextended('sharepoint-attachments', 0))"))
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
        storage = storage or MinioStorage(settings)
        owns_http = http is None
        http = http or httpx.AsyncClient(timeout=60)
        clients: dict[str, GraphClient] = {}
        folders: dict[str, dict[str, Any]] = {}
        try:
            for attachment in due:
                try:
                    workspace = attachment["workspace_id"]
                    if workspace not in clients:
                        clients[workspace] = graph_client(http, settings, await connection_row(db, workspace))
                    client = clients[workspace]
                    if attachment["project_id"] not in folders:
                        folders[attachment["project_id"]] = await client.resolve_folder(attachment["sharepoint_folder_url"])
                    target = folders[attachment["project_id"]]
                    path = await attachment_path(db, target["folderPath"], attachment)
                    body = await storage.get(attachment["object_key"])
                    item = await client.upload(target["driveId"], path, body, attachment["mime_type"])
                    await _record(db, attachment, now=now, path=path, item=item)
                    published += 1
                except (SharePointError, ApiError, httpx.HTTPError) as error:
                    message = str(error) if isinstance(error, SharePointError) else (
                        error.message if isinstance(error, ApiError) else "SharePoint could not be reached."
                    )
                    await _record(db, attachment, now=now, error=message[:500])
        finally:
            if owns_http:
                await http.aclose()
        await db.commit()
        return published
