from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from .queries import (
    OWNER_SELECT_WORKSPACE_MEMBERS,
    WORKSPACE_ROLE_SELECT_WORKSPACE_MEMBERS,
)
from .read_only import ADMIN_READ_ROLES


async def workspace_role(db: AsyncSession, workspace_id: str, user_id: str) -> str:
    result = await db.execute(
        WORKSPACE_ROLE_SELECT_WORKSPACE_MEMBERS,
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    role = result.scalar_one_or_none()
    if not role:
        raise ApiError(403, "You do not have access to this workspace.", "Forbidden")
    return role


async def manager(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    # ADMIN_VIEWER passes for reads; its writes never get here (`read_only.enforce_read_only_role`).
    # VI: ADMIN_VIEWER qua được khi đọc; thao tác ghi của role này không tới được đây (`read_only.enforce_read_only_role`).
    if await workspace_role(db, workspace_id, user_id) not in ADMIN_READ_ROLES:
        raise ApiError(403, "Workspace administrator access is required.", "Forbidden")


async def owner(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    # Keep ownership stable until the protected membership write commits.
    result = await db.execute(
        OWNER_SELECT_WORKSPACE_MEMBERS,
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    if result.scalar_one_or_none() != "OWNER":
        raise ApiError(
            403, "Only the workspace owner can add people to a team.", "Forbidden"
        )
