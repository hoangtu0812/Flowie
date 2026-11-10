from __future__ import annotations

from typing import Any, Literal

from fastapi import Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ..access.project_scope import project_read_scope
from ..access.projects import workspace_access
from ..identity.auth import current_user
from .commands import (
    REORDER_LOCK,
    reorder_update_sql,
    reorder_update_unnest_sql,
)
from .queries import (
    reorder_select_issues_sql,
    reorder_select_projects_sql,
    reorder_select_sql,
)

router = UtcAPIRouter(prefix="/api/v1/manual-order", tags=["manual-order"])


class ReorderInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspaceId: str = Field(min_length=1, max_length=100)
    entityType: Literal["issue", "project"]
    sourceId: str = Field(min_length=1, max_length=100)
    targetId: str = Field(min_length=1, max_length=100)
    placement: Literal["before", "after"]
    expectedOrder: str = Field(pattern=r"^\d{1,19}$")
    expectedTargetOrder: str = Field(pattern=r"^\d{1,19}$")


def encode_rank_cursor(codec, row):
    # The rank is signed alongside the stable ID, while retaining the existing cursor envelope.
    # VI: Rank được ký cùng ID ổn định, đồng thời giữ định dạng bao cursor hiện có.
    return codec.encode(row["created_at"], f"{row['id']}:{row['manual_order']}")


def decode_rank_cursor(codec, cursor):
    _, marker = codec.decode(cursor)
    try:
        identifier, rank = marker.rsplit(":", 1)
        if not identifier or not rank.isdecimal() or len(rank) > 19:
            raise ValueError
        return identifier, int(rank)
    except ValueError as error:
        raise ApiError(
            400, "Invalid manual-order cursor. Reload the list.", "Bad Request"
        ) from error


@router.post("")
async def reorder(
    payload: ReorderInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    from .issue_search import issue_scope

    await workspace_access(db, payload.workspaceId, user["id"])
    if payload.sourceId == payload.targetId:
        raise ApiError(400, "Choose a different target.", "Bad Request")
    await db.execute(
        REORDER_LOCK,
        {"key": f"manual-order:{payload.workspaceId}:{payload.entityType}"},
    )
    params = {
        "workspace": payload.workspaceId,
        "user": user["id"],
        "ids": [payload.sourceId, payload.targetId],
    }
    if payload.entityType == "issue":
        scope, bindings = issue_scope(payload.workspaceId, user["id"], {})
        query = reorder_select_issues_sql(scope)
        params.update(bindings)
    else:
        query = reorder_select_projects_sql(project_read_scope())
    rows = {
        row["id"]: row for row in (await db.execute(query, params)).mappings()
    }
    if len(rows) != 2:
        raise ApiError(
            404,
            "The source or target is no longer accessible. Reload the list.",
            "Not Found",
        )
    source, target = rows[payload.sourceId], rows[payload.targetId]
    if source["parent_issue_id"] != target["parent_issue_id"]:
        raise ApiError(
            400, "Only items with the same parent can be reordered.", "Bad Request"
        )
    if source["manual_order"] != int(payload.expectedOrder) or target[
        "manual_order"
    ] != int(payload.expectedTargetOrder):
        raise ApiError(
            409, "The order changed in another session. Reload the list.", "Conflict"
        )
    table = "issues" if payload.entityType == "issue" else "projects"
    parent = (
        " AND parent_issue_id IS NOT DISTINCT FROM :parent" if table == "issues" else ""
    )
    # Renumber the complete sibling sequence so hidden rows retain their relative order.
    # Identifiers come from the database and fixed table mapping, never caller-supplied SQL.
    # VI: Đánh lại toàn bộ thứ tự anh em để hàng ẩn giữ thứ tự tương đối.
    # ID lấy từ database và tên bảng từ ánh xạ cố định, không dùng SQL do bên gọi cung cấp.
    ids = list(
        (
            await db.execute(
                reorder_select_sql(table, parent),
                {"workspace": payload.workspaceId, "parent": source["parent_issue_id"]},
            )
        ).scalars()
    )
    ids.remove(payload.sourceId)
    index = ids.index(payload.targetId) + (payload.placement == "after")
    ids.insert(index, payload.sourceId)
    await db.execute(
        reorder_update_unnest_sql(table),
        {"ids": ids, "workspace": payload.workspaceId},
    )
    await db.execute(
        reorder_update_sql(table),
        {"id": payload.sourceId, "workspace": payload.workspaceId, "now": utcnow()},
    )
    await db.commit()
    return {"data": {"id": payload.sourceId, "manualOrder": str((index + 1) * 1024)}}
