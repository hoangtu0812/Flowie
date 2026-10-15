from datetime import timedelta

from sqlalchemy import text


async def visible_jobs(db, now):
    rows = (
        (
            await db.execute(
                text("""WITH ranked AS (
        SELECT *,ROW_NUMBER() OVER(PARTITION BY job ORDER BY last_seen_at DESC,instance_id) AS position
        FROM operation_heartbeats WHERE last_seen_at>=:cutoff
    ) SELECT instance_id,job,status,last_seen_at,last_progress_at,failures,last_error_code FROM ranked
        WHERE position=1 OR (status<>'stopped' AND last_seen_at>=:alive)
        ORDER BY CASE WHEN status<>'stopped' AND last_seen_at>=:alive THEN 0 ELSE 1 END,last_seen_at DESC,job,instance_id LIMIT 101"""),
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
