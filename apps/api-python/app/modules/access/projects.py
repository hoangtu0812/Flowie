from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from .queries import (
    TEAM_ACCESS_SELECT_TEAMS,
    WORKSPACE_ACCESS_SELECT_WORKSPACE_MEMBERS,
    WORKSPACE_MANAGER_SELECT_WORKSPACE_MEMBERS,
)
from .read_only import ADMIN_READ_ROLES


async def workspace_access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        WORKSPACE_ACCESS_SELECT_WORKSPACE_MEMBERS,
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, "You do not have access to this workspace.", "Forbidden")


async def workspace_manager(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        WORKSPACE_MANAGER_SELECT_WORKSPACE_MEMBERS,
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    # ADMIN_VIEWER passes for reads; its writes are refused app-wide. VI: ADMIN_VIEWER qua được khi đọc; thao tác ghi bị chặn toàn app.
    if result.scalar_one_or_none() not in ADMIN_READ_ROLES:
        raise ApiError(403, "Workspace administrator access is required.", "Forbidden")


async def team_access(
    db: AsyncSession, workspace_id: str, team_id: str, user_id: str
) -> None:
    await workspace_access(db, workspace_id, user_id)
    result = await db.execute(
        TEAM_ACCESS_SELECT_TEAMS,
        {"team_id": team_id, "workspace_id": workspace_id, "user_id": user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, "You do not have access to this team.", "Forbidden")
