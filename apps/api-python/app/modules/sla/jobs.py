from datetime import timedelta
import re

from sqlalchemy import text

from ...core.clock import _utcnow


async def reschedule(db, identifier, *, now=None):
    now = now or _utcnow()
    pending = (
        await db.execute(
            text(
                "SELECT MIN(occurred_at) FROM issue_lifecycle_events WHERE issue_id=:id AND sla_processed_at IS NULL"
            ),
            {"id": identifier},
        )
    ).scalar_one_or_none()
    row = (
        (
            await db.execute(
                text(
                    "SELECT state,due_at,warning_at,warning_sent_at,breached_at,breach_sent_at FROM issue_sla_cycles WHERE issue_id=:id ORDER BY cycle DESC LIMIT 1"
                ),
                {"id": identifier},
            )
        )
        .mappings()
        .first()
    )
    times = [pending] if pending else []
    breach = (
        await db.execute(
            text(
                "SELECT 1 FROM issue_sla_cycles WHERE issue_id=:id AND breached_at IS NOT NULL AND breach_sent_at IS NULL LIMIT 1"
            ),
            {"id": identifier},
        )
    ).first()
    if breach:
        times.append(now)
    if row:
        if row["state"] == "ACTIVE" and row["breached_at"] is None:
            if row["due_at"] is not None:
                times.append(row["due_at"] + timedelta(microseconds=1))
            if row["warning_at"] is not None and row["warning_sent_at"] is None:
                times.append(row["warning_at"])
    if not times:
        await db.execute(
            text(
                "UPDATE issue_sla_jobs SET next_attempt_at=NULL,generation=generation+1,attempts=0,last_error_code=NULL,failed_at=NULL WHERE issue_id=:id"
            ),
            {"id": identifier},
        )
        return
    await db.execute(
        text("""INSERT INTO issue_sla_jobs(issue_id,next_attempt_at) VALUES (:id,:next)
        ON CONFLICT(issue_id) DO UPDATE SET next_attempt_at=EXCLUDED.next_attempt_at,generation=issue_sla_jobs.generation+1,attempts=0,last_error_code=NULL,failed_at=NULL"""),
        {"id": identifier, "next": min(times)},
    )


async def record_failure(factory, identifier, generation, error, *, now=None):
    now = now or _utcnow()
    code = type(error).__name__
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,79}", code):
        code = "INTERNAL_ERROR"
    async with factory() as db:
        # Match the attempted generation so a newer user edit is never poisoned by an older failed attempt.
        await db.execute(
            text("SELECT id FROM issues WHERE id=:id FOR UPDATE"), {"id": identifier}
        )
        job = (
            (
                await db.execute(
                    text(
                        "SELECT attempts,generation FROM issue_sla_jobs WHERE issue_id=:id FOR UPDATE"
                    ),
                    {"id": identifier},
                )
            )
            .mappings()
            .first()
        )
        if job and job["generation"] == generation:
            attempts = job["attempts"] + 1
            await db.execute(
                text("""UPDATE issue_sla_jobs SET attempts=:attempts,last_error_code=:code,next_attempt_at=:next,failed_at=:failed
                WHERE issue_id=:id AND generation=:generation"""),
                {
                    "id": identifier,
                    "generation": generation,
                    "attempts": attempts,
                    "code": code,
                    "next": now + timedelta(seconds=min(300, 2 ** min(attempts, 9))),
                    "failed": now if attempts >= 8 else None,
                },
            )
        await db.commit()
