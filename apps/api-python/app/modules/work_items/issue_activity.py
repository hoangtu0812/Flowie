from __future__ import annotations
from typing import Any
import json
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.clock import _utcnow
from ...core.identifiers import _cuid


async def _write_activity(
    db: AsyncSession,
    workspace_id: str,
    issue_id: str,
    user_id: str,
    action: str,
    data: dict[str, Any],
) -> None:
    await db.execute(
        text(
            """INSERT INTO activities (id, workspace_id, issue_id, actor_id, type, data, created_at)
               VALUES (:id, :workspace_id, :issue_id, :actor_id, :action, CAST(:data AS jsonb), :now)"""
        ),
        {
            "id": _cuid(),
            "workspace_id": workspace_id,
            "issue_id": issue_id,
            "actor_id": user_id,
            "action": action,
            "data": json.dumps(data),
            "now": _utcnow(),
        },
    )


def _transition(before: Any, after: Any) -> str:
    """Render a change as ``Todo → In Progress``.

    The pair is the point: the new value on its own does not say what happened.
    """

    return f"{before or '—'} → {after or '—'}"
