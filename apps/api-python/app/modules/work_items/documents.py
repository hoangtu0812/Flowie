from __future__ import annotations
from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ...core.clock import _utcnow
from .contracts import CreateDocumentInput, UpdateDocumentInput
from .document_repository import (
    _team_access,
    _resolve_folder,
    _source_url,
    _document_by_id,
)


async def create_document(
    payload: CreateDocumentInput, user: Any, db: AsyncSession
) -> dict[str, dict[str, Any]]:
    await _team_access(db, payload.workspaceId, payload.teamId, user["id"])
    folder = await _resolve_folder(
        db, payload.workspaceId, payload.teamId, payload.folderId
    )
    position = payload.position
    if position is None and folder:
        position = (
            await db.execute(
                text(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM documents WHERE folder_id = :folder_id"
                ),
                {"folder_id": folder["id"]},
            )
        ).scalar_one()
    document_id, now = _cuid(), _utcnow()
    await db.execute(
        text("""INSERT INTO documents (id, workspace_id, team_id, folder_id, title, content, icon, source_type, source_url, pinned, position, created_by, updated_by, created_at, updated_at)
                            VALUES (:id, :workspace_id, :team_id, :folder_id, :title, :content, :icon, :source_type, :source_url, :pinned, :position, :user_id, :user_id, :now, :now)"""),
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
            "pinned": payload.pinned,
            "position": position or 0,
            "user_id": user["id"],
            "now": now,
        },
    )
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
    current = (
        (
            await db.execute(
                text(
                    "SELECT * FROM documents WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL"
                ),
                {"id": document_id, "workspace_id": workspaceId},
            )
        )
        .mappings()
        .first()
    )
    if not current:
        raise ApiError(404, "Document not found.", "Not Found")
    await _team_access(db, workspaceId, current["team_id"], user["id"])
    values = payload.model_dump(exclude_unset=True)
    folder = (
        await _resolve_folder(db, workspaceId, current["team_id"], values["folderId"])
        if "folderId" in values and values["folderId"]
        else None
    )
    columns = {
        "folderId": "folder_id",
        "title": "title",
        "content": "content",
        "icon": "icon",
        "sourceType": "source_type",
        "sourceUrl": "source_url",
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
        params = {"id": document_id, "updated_by": user["id"], "now": _utcnow()}
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
            text(
                f"UPDATE documents SET {', '.join(sets)}, updated_by = :updated_by, updated_at = :now WHERE id = :id"
            ),
            params,
        )
        document = await _document_by_id(db, document_id, workspaceId)
    if not document:
        raise ApiError(404, "Document not found.", "Not Found")
    return {"data": document}
