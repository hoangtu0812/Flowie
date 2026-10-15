from __future__ import annotations
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.clock import _utcnow
from ..sla.calendar import add_working_seconds
from ..sla.policies import select_policy


async def resolve_deadline(
    db: AsyncSession, workspace_id: str, team_id: str, priority: str
):
    policy = await select_policy(db, workspace_id, team_id, priority)
    if not policy:
        return None
    return add_working_seconds(
        _utcnow(), policy["values"]["deadlineMinutes"] * 60, policy["calendar"]
    ).isoformat()
