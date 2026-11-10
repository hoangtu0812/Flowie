from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from ..access.membership import workspace_role
from .queries import (
    DOCUMENT_TEAM_ACCESS_SELECT_TEAMS,
    FOLDER_SELECT_DOCUMENT_FOLDERS,
    documents_select_document_releases_sql,
)


async def document_team_access(
    db: AsyncSession, workspace_id: str, team_id: str | None, user_id: str
) -> None:
    await workspace_role(db, workspace_id, user_id)
    if not team_id:
        return
    member = await db.execute(
        DOCUMENT_TEAM_ACCESS_SELECT_TEAMS,
        {"team_id": team_id, "workspace_id": workspace_id, "user_id": user_id},
    )
    if member.scalar_one_or_none() is None:
        raise ApiError(403, "You do not have access to this team.", "Forbidden")


def _document(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "workspaceId": row["workspace_id"],
        "teamId": row["team_id"],
        "folderId": row["folder_id"],
        "title": row["title"],
        "content": row["content"],
        "icon": row["icon"],
        # `flowie` was the old internal name for native documents. Keep existing rows
        # readable while exposing the clear product name to the client.
        "sourceType": "markdown"
        if row["source_type"] == "flowie"
        else row["source_type"],
        "sourceUrl": row["source_url"],
        "docType": row.get("doc_type", "OTHER"),
        "status": row.get("status", "DRAFT"),
        # Latest approved release (vN), or None before the first approval.
        # VI: Phiên bản đã duyệt mới nhất (vN), hoặc None khi chưa duyệt lần nào.
        "release": row.get("latest_release"),
        "sourceAttachment": (
            {
                "id": row["source_attachment_id"],
                "filename": row["source_attachment_filename"],
                "mimeType": row["source_attachment_mime_type"],
                "size": row["source_attachment_size"],
            }
            if row["source_attachment_id"]
            else None
        ),
        "pinned": row["pinned"],
        "position": row["position"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "version": row.get("version", 1),
        "createdBy": {
            "id": row["created_by_id"],
            "name": row["created_by_name"],
            "avatarUrl": row["created_by_avatar_url"],
        },
        "updatedBy": {
            "id": row["updated_by_id"],
            "name": row["updated_by_name"],
            "avatarUrl": row["updated_by_avatar_url"],
        },
    }


async def _documents(
    db: AsyncSession,
    workspace_id: str,
    team_id: str | None = None,
    folder_id: str | None = None,
    *,
    document_id: str | None = None,
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    filters = ["d.workspace_id = :workspace_id", "d.archived_at IS NULL"]
    params: dict[str, Any] = {"workspace_id": workspace_id}
    if document_id:
        filters.append("d.id = :document_id")
        params["document_id"] = document_id
    if user_id:
        filters.append(
            "(d.team_id IS NULL OR EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.team_id=d.team_id AND tm.user_id=:user_id AND t.archived_at IS NULL))"
        )
        params["user_id"] = user_id
    if team_id:
        filters.append("d.team_id = :team_id")
        params["team_id"] = team_id
    if folder_id:
        filters.append("d.folder_id = :folder_id")
        params["folder_id"] = folder_id
    result = await db.execute(
        documents_select_document_releases_sql(filters),
        params,
    )
    return [_document(row) for row in result.mappings().all()]


async def _document_by_id(
    db: AsyncSession, document_id: str, workspace_id: str
) -> dict[str, Any] | None:
    rows = await _documents(db, workspace_id, document_id=document_id)
    return next((document for document in rows if document["id"] == document_id), None)


async def _folder(db: AsyncSession, folder_id: str, workspace_id: str) -> Any:
    result = await db.execute(
        FOLDER_SELECT_DOCUMENT_FOLDERS,
        {"id": folder_id, "workspace_id": workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, "Document folder not found.", "Not Found")
    return row


async def _resolve_folder(
    db: AsyncSession, workspace_id: str, team_id: str | None, folder_id: str | None
) -> Any | None:
    if not team_id:
        if folder_id:
            raise ApiError(
                400, "Workspace documents cannot use a team folder.", "Bad Request"
            )
        return None
    if folder_id:
        folder = await _folder(db, folder_id, workspace_id)
        if folder["team_id"] != team_id:
            raise ApiError(
                400, "Document folder belongs to another team.", "Bad Request"
            )
        return folder
    from .document_tree import default_folder

    return await default_folder(db, workspace_id, team_id)


def _source_url(source_type: str, source_url: str | None) -> str | None:
    value = source_url.strip() if source_url else None
    if source_type == "link":
        if not value or urlparse(value).scheme not in {"http", "https"}:
            raise ApiError(400, "A valid HTTP(S) link is required.", "Bad Request")
    elif value:
        raise ApiError(
            400, "Only linked documents may include a source URL.", "Bad Request"
        )
    return value
