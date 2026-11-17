from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from .queries import (
    TEAM_ACCESS_SELECT_TEAMS,
    TEAM_ROLE_SELECT_TEAM_MEMBERS,
    WORKSPACE_ACCESS_SELECT_WORKSPACE_MEMBERS,
    WORKSPACE_MANAGER_SELECT_WORKSPACE_MEMBERS,
)
from .read_only import ADMIN_READ_ROLES
from .team_roles import TEAM_WRITE_ROLES, VIEW_ONLY_MESSAGE


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


async def team_write_role(db: AsyncSession, team_id: str | None, user_id: str) -> None:
    """Refuses (403) a write to a team where the caller's role does not write (VIEWER). It checks
    the role only: callers have already established access to the record (team_access,
    issue_row, document_team_access), so a record without a team or a caller outside the team is
    left to those checks and behaves as before. REST and MCP share the services that call this.
    VI: Từ chối (403) thao tác ghi vào team mà vai trò của người gọi không được ghi (VIEWER). Hàm
    VI: chỉ kiểm tra vai trò: nơi gọi đã xác lập quyền với bản ghi (team_access, issue_row,
    VI: document_team_access), nên bản ghi không thuộc team hay người gọi ngoài team để các kiểm
    VI: tra đó xử lý như trước. REST và MCP dùng chung các service gọi hàm này.
    """
    if not team_id:
        return
    role = (
        await db.execute(
            TEAM_ROLE_SELECT_TEAM_MEMBERS, {"team_id": team_id, "user_id": user_id}
        )
    ).scalar_one_or_none()
    if role is not None and role not in TEAM_WRITE_ROLES:
        raise ApiError(403, VIEW_ONLY_MESSAGE, "Forbidden")


async def team_writer(
    db: AsyncSession, workspace_id: str, team_id: str, user_id: str
) -> None:
    """`team_access` for a write: the caller must belong to the active team with a writing role.
    VI: `team_access` cho thao tác ghi: người gọi phải thuộc team đang hoạt động với vai trò được ghi.
    """
    await team_access(db, workspace_id, team_id, user_id)
    await team_write_role(db, team_id, user_id)
