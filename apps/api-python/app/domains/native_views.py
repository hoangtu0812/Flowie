from __future__ import annotations

import json
from datetime import UTC, datetime, timezone
from typing import Any, Literal

from fastapi import Depends, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..core.utc_responses import UtcAPIRouter as APIRouter
from ..db.session import get_session
from ..modules.access.projects import _team_access
from ..modules.work_items.saved_view_config import issue_view_config
from .auth import _cuid, _utcnow, current_user
from .native_projects import _workspace_access

router = APIRouter(prefix="/api/v1/views", tags=["views"])


class CreateViewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    entityType: Literal["issue", "project"]
    filters: dict[str, Any] = Field(default_factory=dict)
    isShared: bool = False

    @field_validator("name")
    @classmethod
    def trimmed_name(cls, value: str) -> str:
        if len(value.strip()) < 2:
            raise ValueError("View names require at least two non-space characters.")
        return value.strip()


class UpdateViewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    filters: dict[str, Any]
    isShared: bool
    expectedUpdatedAt: datetime

    _trimmed_name = field_validator("name")(CreateViewInput.trimmed_name.__func__)


def _revision(value: datetime) -> datetime:
    return (
        value.astimezone(UTC).replace(tzinfo=None) if value.tzinfo else value
    )


async def _config_references(db: AsyncSession, config: dict, workspace: str) -> None:
    # Keep stale references visible as errors, including negative filters that could otherwise widen results.
    # VI: Báo lỗi tham chiếu cũ, kể cả bộ lọc phủ định có thể vô tình mở rộng kết quả.
    query = config["query"]
    references: dict[str, set[str]] = {}
    user_ids = {query[key] for key in ["assigneeId", "creatorId"] if query.get(key)}
    columns = {
        "status": "issue_statuses",
        "labels": "labels",
        "project": "projects",
        "cycle": "cycles",
    }
    for item in query["filters"]:
        if item["columnId"] == "assignee":
            user_ids.update(value for value in item["values"] if value != "unassigned")
        table = columns.get(item["columnId"])
        if table:
            references.setdefault(table, set()).update(
                value for value in item["values"] if value not in {"", "no-cycle"}
            )
    for key, table in [
        ("teamId", "teams"),
        ("projectId", "projects"),
        ("cycleId", "cycles"),
    ]:
        value = config.get(key) if key == "teamId" else query.get(key)
        if value:
            references.setdefault(table, set()).add(value)
    for table, ids in references.items():
        if not ids:
            continue
        active = " AND archived_at IS NULL" if table in {"teams", "projects"} else ""
        # Table names come only from the fixed mapping above; user values remain bound parameters.
        # VI: Tên bảng chỉ lấy từ ánh xạ cố định phía trên; giá trị người dùng luôn là tham số bind.
        count = (
            await db.execute(
                text(
                    f"SELECT COUNT(*) FROM {table} WHERE workspace_id=:workspace AND id=ANY(CAST(:ids AS text[])){active}"
                ),
                {"workspace": workspace, "ids": list(ids)},
            )
        ).scalar_one()
        if count != len(ids):
            raise ApiError(
                400,
                "A saved filter references data that is no longer available. Edit the view before saving.",
                "Bad Request",
            )
    if user_ids:
        count = (
            await db.execute(
                text(
                    "SELECT COUNT(*) FROM workspace_members WHERE workspace_id=:workspace AND status='ACTIVE' AND user_id=ANY(CAST(:ids AS text[]))"
                ),
                {"workspace": workspace, "ids": list(user_ids)},
            )
        ).scalar_one()
        if count != len(user_ids):
            raise ApiError(
                400,
                "A saved filter references a member who is no longer available.",
                "Bad Request",
            )


async def _view(
    db: AsyncSession, view_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    result = await db.execute(
        text(
            """SELECT view.id, view.workspace_id, view.created_by, view.name, view.description,
                      view.entity_type, view.filters, view.is_shared, view.created_at, view.updated_at,
                      creator.id AS creator_id, creator.name AS creator_name,
                      creator.avatar_url AS creator_avatar_url
               FROM saved_views view
               JOIN users creator ON creator.id = view.created_by
               WHERE view.id = :view_id AND view.workspace_id = :workspace_id
                 AND (view.is_shared = TRUE OR view.created_by = :user_id)
               LIMIT 1"""
        ),
        {"view_id": view_id, "workspace_id": workspace_id, "user_id": user_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, "Saved view not found.", "Not Found")
    filters = row["filters"] or {}
    configuration_error = None
    if row["entity_type"] == "issue":
        try:
            filters = issue_view_config(filters)
            await _config_references(db, filters, workspace_id)
        except ApiError as error:
            configuration_error = error.message
    return {
        "id": row["id"],
        "workspaceId": row["workspace_id"],
        "createdById": row["created_by"],
        "name": row["name"],
        "description": row["description"],
        "entityType": row["entity_type"],
        "filters": filters,
        "configurationError": configuration_error,
        "isShared": row["is_shared"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "createdBy": {
            "id": row["creator_id"],
            "name": row["creator_name"],
            "avatarUrl": row["creator_avatar_url"],
        },
    }


@router.get("")
async def list_views(
    workspaceId: str = Query(min_length=1),
    teamId: str | None = Query(default=None),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user["id"])
    if teamId:
        await _team_access(db, workspaceId, teamId, user["id"])
    result = await db.execute(
        text(
            """SELECT id FROM saved_views
               WHERE workspace_id = :workspace_id
                 AND (is_shared = TRUE OR created_by = :user_id)
               ORDER BY is_shared DESC, updated_at DESC"""
        ),
        {"workspace_id": workspaceId, "user_id": user["id"]},
    )
    views = [
        await _view(db, row["id"], workspaceId, user["id"])
        for row in result.mappings().all()
    ]
    return {
        "data": [
            view
            for view in views
            if not teamId
            or (
                isinstance(view["filters"], dict)
                and view["filters"].get("teamId") == teamId
            )
        ]
    }


@router.get("/{view_id}")
async def get_view(
    view_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, workspaceId, user["id"])
    return {"data": await _view(db, view_id, workspaceId, user["id"])}


@router.post("")
async def create_view(
    payload: CreateViewInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user["id"])
    filters = (
        issue_view_config(payload.filters)
        if payload.entityType == "issue"
        else payload.filters
    )
    if payload.entityType == "issue":
        await _config_references(db, filters, payload.workspaceId)
        if filters.get("teamId"):
            await _team_access(db, payload.workspaceId, filters["teamId"], user["id"])
    view_id = _cuid()
    await db.execute(
        text(
            """INSERT INTO saved_views
               (id, workspace_id, created_by, name, description, entity_type, filters, is_shared, created_at, updated_at)
               VALUES (:id, :workspace_id, :created_by, :name, :description, :entity_type,
                       CAST(:filters AS jsonb), :is_shared, :now, :now)"""
        ),
        {
            "id": view_id,
            "workspace_id": payload.workspaceId,
            "created_by": user["id"],
            "name": payload.name.strip(),
            "description": payload.description.strip() if payload.description else None,
            "entity_type": payload.entityType,
            "filters": json.dumps(filters),
            "is_shared": payload.isShared,
            "now": _utcnow(),
        },
    )
    await db.commit()
    return {"data": await _view(db, view_id, payload.workspaceId, user["id"])}


@router.patch("/{view_id}")
async def update_view(
    view_id: str,
    payload: UpdateViewInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, workspaceId, user["id"])
    view = await _view(db, view_id, workspaceId, user["id"])
    if view["createdById"] != user["id"]:
        raise ApiError(403, "Only the creator can edit this saved view.", "Forbidden")
    if view["entityType"] != "issue":
        raise ApiError(400, "Project view editing is not supported.", "Bad Request")
    filters = issue_view_config(payload.filters)
    await _config_references(db, filters, workspaceId)
    if filters.get("teamId"):
        await _team_access(db, workspaceId, filters["teamId"], user["id"])
    # Millisecond timestamps must advance even when two successful writes share the same clock tick.
    # VI: Timestamp mili giây phải tăng ngay cả khi hai lần ghi thành công nằm trong cùng một nhịp đồng hồ.
    result = await db.execute(
        text("""UPDATE saved_views SET name=:name, description=:description,
        filters=CAST(:filters AS jsonb), is_shared=:shared,
        updated_at=GREATEST(:now, updated_at + interval '1 millisecond')
        WHERE id=:id AND workspace_id=:workspace AND created_by=:user AND updated_at=:expected RETURNING id"""),
        {
            "id": view_id,
            "workspace": workspaceId,
            "user": user["id"],
            "name": payload.name,
            "description": payload.description.strip() if payload.description else None,
            "filters": json.dumps(filters),
            "shared": payload.isShared,
            "now": _utcnow(),
            "expected": _revision(payload.expectedUpdatedAt),
        },
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(
            409,
            "This view changed in another session. Reload before saving.",
            "Conflict",
        )
    await db.commit()
    return {"data": await _view(db, view_id, workspaceId, user["id"])}


@router.delete("/{view_id}")
async def delete_view(
    view_id: str,
    workspaceId: str = Query(min_length=1),
    expectedUpdatedAt: datetime | None = Query(default=None),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _workspace_access(db, workspaceId, user["id"])
    result = await db.execute(
        text(
            """DELETE FROM saved_views
               WHERE id = :view_id AND workspace_id = :workspace_id AND created_by = :user_id
                 AND (CAST(:expected AS timestamp) IS NULL OR updated_at=CAST(:expected AS timestamp))
               RETURNING id"""
        ),
        {
            "view_id": view_id,
            "workspace_id": workspaceId,
            "user_id": user["id"],
            "expected": _revision(expectedUpdatedAt) if expectedUpdatedAt else None,
        },
    )
    if result.scalar_one_or_none() is None:
        view = await _view(db, view_id, workspaceId, user["id"])
        if view["createdById"] == user["id"] and expectedUpdatedAt:
            raise ApiError(
                409,
                "This view changed in another session. Reload before deleting.",
                "Conflict",
            )
        raise ApiError(403, "Only the creator can delete this saved view.", "Forbidden")
    await db.commit()
    return {"data": {"id": view_id, "deleted": True}}
