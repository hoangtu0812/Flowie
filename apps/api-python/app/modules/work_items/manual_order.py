from __future__ import annotations

from typing import Any, Literal
from fastapi import Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import _utcnow, current_user
from ..access.projects import _workspace_access
from ..access.project_scope import project_read_scope

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

    await _workspace_access(db, payload.workspaceId, user["id"])
    if payload.sourceId == payload.targetId:
        raise ApiError(400, "Choose a different target.", "Bad Request")
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
        {"key": f"manual-order:{payload.workspaceId}:{payload.entityType}"},
    )
    params = {
        "workspace": payload.workspaceId,
        "user": user["id"],
        "ids": [payload.sourceId, payload.targetId],
    }
    if payload.entityType == "issue":
        scope, bindings = issue_scope(payload.workspaceId, user["id"], {})
        query = (
            "SELECT i.id,i.manual_order,i.parent_issue_id "
            + scope
            + " AND i.id=ANY(CAST(:ids AS text[])) FOR UPDATE OF i"
        )
        params.update(bindings)
    else:
        query = (
            "SELECT p.id,p.manual_order,NULL::text AS parent_issue_id FROM projects p WHERE "
            + project_read_scope()
            + " AND p.id=ANY(CAST(:ids AS text[])) FOR UPDATE OF p"
        )
    rows = {
        row["id"]: row for row in (await db.execute(text(query), params)).mappings()
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
                text(
                    f"SELECT id FROM {table} WHERE workspace_id=:workspace AND archived_at IS NULL{parent} ORDER BY manual_order,id"
                ),
                {"workspace": payload.workspaceId, "parent": source["parent_issue_id"]},
            )
        ).scalars()
    )
    ids.remove(payload.sourceId)
    index = ids.index(payload.targetId) + (payload.placement == "after")
    ids.insert(index, payload.sourceId)
    await db.execute(
        text(f"""UPDATE {table} item SET manual_order=sequence.position*1024
        FROM unnest(CAST(:ids AS text[])) WITH ORDINALITY AS sequence(id,position)
        WHERE item.id=sequence.id AND item.workspace_id=:workspace"""),
        {"ids": ids, "workspace": payload.workspaceId},
    )
    await db.execute(
        text(
            f"UPDATE {table} SET updated_at=:now WHERE id=:id AND workspace_id=:workspace"
        ),
        {"id": payload.sourceId, "workspace": payload.workspaceId, "now": _utcnow()},
    )
    await db.commit()
    return {"data": {"id": payload.sourceId, "manualOrder": str((index + 1) * 1024)}}
