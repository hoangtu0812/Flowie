from __future__ import annotations
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError


async def _workspace_role(db: AsyncSession, workspace_id: str, user_id: str) -> str:
    result = await db.execute(
        text(
            "SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"
        ),
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    role = result.scalar_one_or_none()
    if not role:
        raise ApiError(403, "You do not have access to this workspace.", "Forbidden")
    return role


async def _manager(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    if await _workspace_role(db, workspace_id, user_id) not in {"OWNER", "ADMIN"}:
        raise ApiError(403, "Workspace administrator access is required.", "Forbidden")
