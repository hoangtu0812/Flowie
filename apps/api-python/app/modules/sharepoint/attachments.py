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

from ...core.clock import utcnow
from ...core.config import Settings
from ...core.errors import ApiError
from ...storage.minio import MinioStorage
from .commands import (
    PUBLISH_ATTACHMENTS_DUE_LOCK,
    RECORD_INSERT_ATTACHMENT_PUBLICATIONS,
)
from .graph import GraphClient, SharePointError, safe_name
from .queries import ATTACHMENT_DUE
from .service import (
    BATCH,
    MAX_BACKOFF_MINUTES,
    _folder_names,
    connection_row,
    graph_client,
)


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
        RECORD_INSERT_ATTACHMENT_PUBLICATIONS,
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
            await db.execute(PUBLISH_ATTACHMENTS_DUE_LOCK)
        ).scalar_one()
        if not locked:
            return 0
        now = utcnow()
        due = (
            await db.execute(ATTACHMENT_DUE, {"now": now, "cap": MAX_BACKOFF_MINUTES, "limit": BATCH})
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
