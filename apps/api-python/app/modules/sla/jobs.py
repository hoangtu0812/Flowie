import re
from datetime import timedelta

from ...core.clock import utcnow
from .commands import (
    RECORD_FAILURE_UPDATE_ISSUE_SLA_JOBS,
    RESCHEDULE_INSERT_ISSUE_SLA_JOBS,
    RESCHEDULE_UPDATE_ISSUE_SLA_JOBS,
)
from .queries import (
    RECORD_FAILURE_SELECT_ISSUE_SLA_JOBS,
    RECORD_FAILURE_SELECT_ISSUES,
    RESCHEDULE_SELECT_ISSUE_LIFECYCLE_EVENTS,
    RESCHEDULE_SELECT_ISSUE_SLA_CYCLES,
    RESCHEDULE_SELECT_ISSUE_SLA_CYCLES_2,
)


async def reschedule(db, identifier, *, now=None):
    now = now or utcnow()
    pending = (
        await db.execute(
            RESCHEDULE_SELECT_ISSUE_LIFECYCLE_EVENTS,
            {"id": identifier},
        )
    ).scalar_one_or_none()
    row = (
        (
            await db.execute(
                RESCHEDULE_SELECT_ISSUE_SLA_CYCLES_2,
                {"id": identifier},
            )
        )
        .mappings()
        .first()
    )
    times = [pending] if pending else []
    breach = (
        await db.execute(
            RESCHEDULE_SELECT_ISSUE_SLA_CYCLES,
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
            RESCHEDULE_UPDATE_ISSUE_SLA_JOBS,
            {"id": identifier},
        )
        return
    await db.execute(
        RESCHEDULE_INSERT_ISSUE_SLA_JOBS,
        {"id": identifier, "next": min(times)},
    )


async def record_failure(factory, identifier, generation, error, *, now=None):
    now = now or utcnow()
    code = type(error).__name__
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,79}", code):
        code = "INTERNAL_ERROR"
    async with factory() as db:
        # Match the attempted generation so a newer user edit is never poisoned by an older failed attempt.
        await db.execute(
            RECORD_FAILURE_SELECT_ISSUES, {"id": identifier}
        )
        job = (
            (
                await db.execute(
                    RECORD_FAILURE_SELECT_ISSUE_SLA_JOBS,
                    {"id": identifier},
                )
            )
            .mappings()
            .first()
        )
        if job and job["generation"] == generation:
            attempts = job["attempts"] + 1
            await db.execute(
                RECORD_FAILURE_UPDATE_ISSUE_SLA_JOBS,
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
