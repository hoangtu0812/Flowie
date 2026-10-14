import json
from sqlalchemy import text
from ...core.clock import _utcnow
from ...core.errors import ApiError


async def limits(db, workspace):
    row = (
        (
            await db.execute(
                text(
                    "SELECT total_per_minute,per_tool FROM ai_workspace_limits WHERE workspace_id=:workspace"
                ),
                {"workspace": workspace},
            )
        )
        .mappings()
        .first()
    )
    return {
        "totalPerMinute": row["total_per_minute"] if row else 300,
        "perTool": row["per_tool"] if row else {},
    }


async def consume_quota(factory, workspace, tool):
    now = _utcnow().replace(second=0, microsecond=0)
    async with factory() as db:
        budget = await limits(db, workspace)
        for name, maximum in [
            ("*", budget["totalPerMinute"]),
            (tool, budget["perTool"].get(tool, budget["totalPerMinute"])),
        ]:
            used = (
                await db.execute(
                    text("""INSERT INTO ai_tool_windows(workspace_id,tool,window_start,used) VALUES (:workspace,:tool,:window,1)
                ON CONFLICT(workspace_id,tool,window_start) DO UPDATE SET used=ai_tool_windows.used+1 WHERE ai_tool_windows.used<:maximum RETURNING used"""),
                    {
                        "workspace": workspace,
                        "tool": name,
                        "window": now,
                        "maximum": maximum,
                    },
                )
            ).scalar_one_or_none()
            if used is None:
                raise ApiError(
                    429,
                    "Workspace or tool budget reached. Retry after the minute window.",
                    "Too Many Requests",
                )
        await db.commit()


async def update_limits(db, workspace, total, per_tool):
    await db.execute(
        text("""INSERT INTO ai_workspace_limits(workspace_id,total_per_minute,per_tool,updated_at) VALUES (:workspace,:total,CAST(:tool AS jsonb),:now)
        ON CONFLICT(workspace_id) DO UPDATE SET total_per_minute=:total,per_tool=CAST(:tool AS jsonb),updated_at=:now"""),
        {
            "workspace": workspace,
            "total": total,
            "tool": json.dumps(per_tool),
            "now": _utcnow(),
        },
    )
