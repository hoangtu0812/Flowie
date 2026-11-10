from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..audit.write import record_change
from .commands import (
    ARCHIVE_DOCUMENT_UPDATE_DOCUMENTS,
    CREATE_DOCUMENT_INSERT_DOCUMENTS,
    UPDATE_DOCUMENT_UPDATE_DOCUMENT_PUBLICATIONS,
    update_document_update_documents_sql,
)
from .contracts import CreateDocumentInput, UpdateDocumentInput
from .document_repository import (
    _document_by_id,
    _resolve_folder,
    _source_url,
    document_team_access,
)
from .document_review import announce_status_change, check_status_change
from .queries import (
    ARCHIVE_DOCUMENT_SELECT_DOCUMENTS,
    CREATE_DOCUMENT_SELECT_DOCUMENTS,
    ROW_SELECT_DOCUMENTS,
    UPDATE_DOCUMENT_SELECT_DOCUMENTS,
    UPDATE_DOCUMENT_SELECT_DOCUMENTS_2,
)


async def create_document(
    payload: CreateDocumentInput, user: Any, db: AsyncSession
) -> dict[str, dict[str, Any]]:
    await document_team_access(db, payload.workspaceId, payload.teamId, user["id"])
    if payload.teamId:
        from .document_tree import _lock_team_folders

        await _lock_team_folders(db, payload.teamId)
    # Approval needs a review round, so a document never starts Approved.
    # VI: Duyệt cần một vòng review, nên tài liệu không bao giờ được tạo ở trạng thái Đã duyệt.
    if payload.status == "APPROVED":
        raise ApiError(400, "Create the document as a draft and submit it for review.", "Bad Request")
    if payload.status == "IN_REVIEW":
        await check_status_change(
            db, {"status": "DRAFT", "workspace_id": payload.workspaceId, "team_id": payload.teamId}, "IN_REVIEW", user
        )
    folder = await _resolve_folder(
        db, payload.workspaceId, payload.teamId, payload.folderId
    )
    position = payload.position
    if position is None and folder:
        position = (
            await db.execute(
                CREATE_DOCUMENT_SELECT_DOCUMENTS,
                {"folder_id": folder["id"]},
            )
        ).scalar_one()
    document_id, now = cuid(), utcnow()
    await db.execute(
        CREATE_DOCUMENT_INSERT_DOCUMENTS,
        {
            "id": document_id,
            "workspace_id": payload.workspaceId,
            "team_id": payload.teamId,
            "folder_id": folder["id"] if folder else None,
            "title": payload.title.strip(),
            "content": payload.content,
            "icon": payload.icon or "📄",
            "source_type": payload.sourceType,
            "source_url": _source_url(payload.sourceType, payload.sourceUrl),
            "doc_type": payload.docType,
            "status": payload.status,
            "pinned": payload.pinned,
            "position": position or 0,
            "user_id": user["id"],
            "now": now,
        },
    )
    await record_change(
        db, payload.workspaceId, user["id"], "document.created", "document", document_id
    )
    if payload.status == "IN_REVIEW":
        await announce_status_change(db, None, await _row(db, document_id), user)
    document = await _document_by_id(db, document_id, payload.workspaceId)
    if not document:
        raise ApiError(
            500, "Document could not be loaded after creation.", "Internal Server Error"
        )
    return {"data": document}


async def update_document(
    document_id: str,
    payload: UpdateDocumentInput,
    workspaceId: str,
    user: Any,
    db: AsyncSession,
) -> dict[str, dict[str, Any]]:
    from .document_tree import _folder_row, _lock_team_folders

    if "folderId" in payload.model_fields_set:
        owner = (await db.execute(UPDATE_DOCUMENT_SELECT_DOCUMENTS_2, {"id": document_id, "workspace": workspaceId})).mappings().first()
        if not owner:
            raise ApiError(404, "Document not found.", "Not Found")
        await document_team_access(db, workspaceId, owner["team_id"], user["id"])
        # Relocation locks the tree before the document row, matching folder deletion.
        # Ordinary autosaves need no tree lock because their active document blocks deletion.
        # VI: Di chuyển khóa cây trước dòng tài liệu, cùng thứ tự với xóa thư mục. Lưu tự động
        # VI: thông thường không cần khóa cây vì tài liệu đang hoạt động đã chặn xóa thư mục.
        if owner["team_id"]:
            await _lock_team_folders(db, owner["team_id"])
    current = (
        (
            await db.execute(
                UPDATE_DOCUMENT_SELECT_DOCUMENTS,
                {"id": document_id, "workspace_id": workspaceId},
            )
        )
        .mappings()
        .first()
    )
    if not current:
        raise ApiError(404, "Document not found.", "Not Found")
    await document_team_access(db, workspaceId, current["team_id"], user["id"])
    if (
        payload.expectedVersion is not None
        and current["version"] != payload.expectedVersion
    ):
        raise ApiError(
            409,
            "This document changed. Compare the latest revision before saving your retained draft.",
            "Conflict",
        )
    values = payload.model_dump(exclude_unset=True, exclude={"expectedVersion"})
    if values.get("status"):
        await check_status_change(db, dict(current), values["status"], user)
    document = await _document_by_id(db, document_id, workspaceId)
    folder = (
        await _resolve_folder(db, workspaceId, current["team_id"], values["folderId"])
        if "folderId" in values and values["folderId"]
        else None
    )
    if "folderId" in values and values["folderId"] != current["folder_id"]:
        source = await _folder_row(db, workspaceId, current["folder_id"]) if current["folder_id"] else None
        if source and source["project_id"] and (not folder or source["project_id"] != folder["project_id"]):
            raise ApiError(400, "Documents can only move within their project.", "Bad Request")
    columns = {
        "folderId": "folder_id",
        "title": "title",
        "content": "content",
        "icon": "icon",
        "sourceType": "source_type",
        "sourceUrl": "source_url",
        "docType": "doc_type",
        "status": "status",
        "pinned": "pinned",
        "position": "position",
    }
    if values:
        source_type = values.get("sourceType", current["source_type"])
        if "sourceType" in values or "sourceUrl" in values:
            values["sourceUrl"] = _source_url(
                source_type,
                values.get(
                    "sourceUrl",
                    current["source_url"] if source_type == "link" else None,
                ),
            )
        params = {"id": document_id, "updated_by": user["id"], "now": utcnow()}
        sets = []
        for field, column in columns.items():
            if field in values:
                params[field] = (
                    folder["id"] if field == "folderId" and folder else values[field]
                )
                sets.append(f"{column} = :{field}")
        if "title" in params:
            params["title"] = str(params["title"]).strip()
        await db.execute(
            update_document_update_documents_sql(sets),
            params,
        )
        if "folderId" in values and values["folderId"] != current["folder_id"]:
            await db.execute(UPDATE_DOCUMENT_UPDATE_DOCUMENT_PUBLICATIONS,
                             {"id": document_id})
        document = await _document_by_id(db, document_id, workspaceId)
        await record_change(
            db,
            workspaceId,
            user["id"],
            "document.updated",
            "document",
            document_id,
            fields=values,
        )
        await announce_status_change(db, dict(current), await _row(db, document_id), user)
    if not document:
        raise ApiError(404, "Document not found.", "Not Found")
    return {"data": document}


async def archive_document(document_id, workspaceId, user, db, expected_version=None):
    current = (
        (
            await db.execute(
                ARCHIVE_DOCUMENT_SELECT_DOCUMENTS,
                {"id": document_id, "workspace": workspaceId},
            )
        )
        .mappings()
        .first()
    )
    if not current:
        raise ApiError(404, "Document not found.", "Not Found")
    await document_team_access(db, workspaceId, current["team_id"], user["id"])
    if expected_version is not None and current["version"] != expected_version:
        raise ApiError(409, "This document changed. Reload it before deleting.", "Conflict")
    await db.execute(
        ARCHIVE_DOCUMENT_UPDATE_DOCUMENTS,
        {"id": document_id, "actor": user["id"], "now": utcnow()},
    )
    await record_change(
        db, workspaceId, user["id"], "document.archived", "document", document_id
    )
    return {"data": {"id": document_id, "archived": True}}


async def _row(db: AsyncSession, document_id: str) -> dict:
    """The stored document row, after triggers (an edit can turn Approved back into Draft).
    VI: Dòng tài liệu đã lưu, sau trigger (sửa có thể đưa Đã duyệt về Nháp).
    """
    return dict(
        (await db.execute(ROW_SELECT_DOCUMENTS, {"id": document_id}))
        .mappings()
        .one()
    )
