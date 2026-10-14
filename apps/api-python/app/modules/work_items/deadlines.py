from __future__ import annotations
from datetime import timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.clock import _utcnow


async def resolve_deadline(
    db: AsyncSession, workspace_id: str, team_id: str, priority: str
):
    rows = await db.execute(
        text("""SELECT id, deadline_minutes, team_id, priority FROM sla_policies
                                    WHERE workspace_id = :workspace_id AND archived_at IS NULL AND enabled = TRUE
                                      AND (team_id IS NULL OR team_id = :team_id) AND (priority IS NULL OR priority = :priority)
                                    ORDER BY created_at ASC"""),
        {"workspace_id": workspace_id, "team_id": team_id, "priority": priority},
    )
    policies = rows.mappings().all()
    if not policies:
        return None
    policy = sorted(
        policies,
        key=lambda p: (
            (2 if p["team_id"] == team_id else 0)
            + (1 if p["priority"] == priority else 0)
        ),
        reverse=True,
    )[0]
    return (_utcnow() + timedelta(minutes=policy["deadline_minutes"])).isoformat()
