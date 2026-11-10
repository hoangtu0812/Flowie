from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.audit_context import audit_agent, audit_source
from ...core.clock import utcnow
from ...core.identifiers import cuid
from .commands import (
    WRITE_ACTIVITY_INSERT_ACTIVITIES,
)


async def _write_activity(
    db: AsyncSession,
    workspace_id: str,
    issue_id: str,
    user_id: str,
    action: str,
    data: dict[str, Any],
) -> None:
    await db.execute(
        WRITE_ACTIVITY_INSERT_ACTIVITIES,
        {
            "id": cuid(),
            "workspace_id": workspace_id,
            "issue_id": issue_id,
            "actor_id": user_id,
            "action": action,
            "data": json.dumps(
                {
                    **data,
                    "source": audit_source.get(),
                    **({"agent": agent} if (agent := audit_agent.get()) else {}),
                }
            ),
            "now": utcnow(),
        },
    )


def _transition(before: Any, after: Any) -> str:
    """Render a change as ``Todo → In Progress``.

    The pair is the point: the new value on its own does not say what happened.
    """

    return f"{before or '—'} → {after or '—'}"
