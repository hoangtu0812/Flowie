from datetime import timedelta

from .queries import (
    VISIBLE_JOBS_SELECT_OPERATION_HEARTBEATS,
)


async def visible_jobs(db, now):
    rows = (
        (
            await db.execute(
                VISIBLE_JOBS_SELECT_OPERATION_HEARTBEATS,
                {
                    "cutoff": now - timedelta(days=1),
                    "alive": now - timedelta(seconds=60),
                },
            )
        )
        .mappings()
        .all()
    )
    return rows[:100], len(rows) > 100
