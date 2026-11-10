import json

from ...core.clock import utcnow
from ...core.errors import ApiError
from .commands import (
    CONSUME_QUOTA_INSERT_AI_TOOL_WINDOWS,
    UPDATE_LIMITS_INSERT_AI_WORKSPACE_LIMITS,
)
from .queries import (
    LIMITS_SELECT_AI_WORKSPACE_LIMITS,
)


async def limits(db, workspace):
    row = (
        (
            await db.execute(
                LIMITS_SELECT_AI_WORKSPACE_LIMITS,
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
    now = utcnow().replace(second=0, microsecond=0)
    async with factory() as db:
        budget = await limits(db, workspace)
        for name, maximum in [
            ("*", budget["totalPerMinute"]),
            (tool, budget["perTool"].get(tool, budget["totalPerMinute"])),
        ]:
            used = (
                await db.execute(
                    CONSUME_QUOTA_INSERT_AI_TOOL_WINDOWS,
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
        UPDATE_LIMITS_INSERT_AI_WORKSPACE_LIMITS,
        {
            "workspace": workspace,
            "total": total,
            "tool": json.dumps(per_tool),
            "now": utcnow(),
        },
    )
