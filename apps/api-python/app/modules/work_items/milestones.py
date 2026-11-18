"""Milestone of an issue: which one it may carry.

An issue carries at most one milestone, and only one of its own project. Every caller that writes
an issue (web, bulk edit, CSV import, MCP) goes through `create_issue`/`update_issue`, which use
this check, so the rule holds in one place. Moving an issue to another team clears the milestone
together with the project in the move SQL.
VI: Milestone của issue: issue được mang milestone nào. Issue mang tối đa một milestone và chỉ của
VI: chính dự án chứa nó. Mọi nơi ghi issue (web, bulk edit, nhập CSV, MCP) đều qua
VI: `create_issue`/`update_issue`, vốn dùng hàm kiểm tra này, nên quy tắc nằm một chỗ. Chuyển issue
VI: sang team khác thì câu SQL chuyển gỡ milestone cùng lúc với dự án.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from .queries import VALIDATE_MILESTONE_SELECT_PROJECT_MILESTONES


async def validate_milestone(
    db: AsyncSession, project_id: str | None, milestone_id: str | None
) -> dict[str, Any] | None:
    """Returns the milestone (id, title) or None for "no milestone".

    Refuses (4xx) a milestone when the issue has no project, and one outside `project_id`.
    VI: Trả milestone (id, tiêu đề) hoặc None nghĩa là "không có milestone". Từ chối (4xx) khi issue
    VI: không có dự án, và milestone ngoài `project_id`.
    """
    if not milestone_id:
        return None
    if not project_id:
        raise ApiError(400, "Only an issue in a project can have a milestone.", "Bad Request")
    row = (
        await db.execute(
            VALIDATE_MILESTONE_SELECT_PROJECT_MILESTONES,
            {"id": milestone_id, "project_id": project_id},
        )
    ).mappings().first()
    if row is None:
        raise ApiError(404, "Milestone was not found in this project.", "Not Found")
    return {"id": row["id"], "title": row["title"]}
