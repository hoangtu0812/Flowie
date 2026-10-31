from __future__ import annotations
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError
from .read_only import ADMIN_READ_ROLES


async def _workspace_access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        text(
            "SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"
        ),
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, "You do not have access to this workspace.", "Forbidden")


async def _workspace_manager(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        text(
            "SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"
        ),
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    # ADMIN_VIEWER passes for reads; its writes are refused app-wide. VI: ADMIN_VIEWER qua được khi đọc; thao tác ghi bị chặn toàn app.
    if result.scalar_one_or_none() not in ADMIN_READ_ROLES:
        raise ApiError(403, "Workspace administrator access is required.", "Forbidden")


async def _team_access(
    db: AsyncSession, workspace_id: str, team_id: str, user_id: str
) -> None:
    await _workspace_access(db, workspace_id, user_id)
    result = await db.execute(
        text(
            """SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.id = :team_id AND t.workspace_id = :workspace_id AND t.archived_at IS NULL AND tm.user_id = :user_id"""
        ),
        {"team_id": team_id, "workspace_id": workspace_id, "user_id": user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, "You do not have access to this team.", "Forbidden")
