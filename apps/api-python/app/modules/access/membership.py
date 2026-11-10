from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from .read_only import ADMIN_READ_ROLES


async def workspace_role(db: AsyncSession, workspace_id: str, user_id: str) -> str:
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


async def manager(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    # ADMIN_VIEWER passes for reads; its writes never get here (`read_only.enforce_read_only_role`).
    # VI: ADMIN_VIEWER qua được khi đọc; thao tác ghi của role này không tới được đây (`read_only.enforce_read_only_role`).
    if await workspace_role(db, workspace_id, user_id) not in ADMIN_READ_ROLES:
        raise ApiError(403, "Workspace administrator access is required.", "Forbidden")



# shortcut: private alias kept for callers not yet moved out of app/domains; delete it once DTD-523
# has switched every caller to `manager` / `workspace_role`.
# VI: shortcut: alias nội bộ giữ cho các nơi gọi chưa chuyển khỏi app/domains; xoá khi DTD-523 đã
# VI: chuyển mọi nơi gọi sang `manager` / `workspace_role`.
_manager = manager
_workspace_role = workspace_role

async def _owner(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    # Keep ownership stable until the protected membership write commits.
    result = await db.execute(
        text("""SELECT role FROM workspace_members
            WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'
            FOR SHARE"""),
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    if result.scalar_one_or_none() != "OWNER":
        raise ApiError(
            403, "Only the workspace owner can add people to a team.", "Forbidden"
        )
