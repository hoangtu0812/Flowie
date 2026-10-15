import asyncio

from sqlalchemy import text

from ...core.audit_context import audit_source
from ...core.clock import _utcnow
from ..operations.heartbeats import progress
from .alerts import process_alerts
from .cycles import consume, save_cycle
from .jobs import record_failure, reschedule
from .synchronization import locked_issue, sync_issue


async def process_sla_job(factory, *, now=None, issue_id=None):
    now = now or _utcnow()
    identifier, generation = None, None
    token = audit_source.set("SYSTEM")
    try:
        async with factory() as db:
            # Every path locks the issue before its job, cycles and lifecycle rows.
            job = (
                (
                    await db.execute(
                        text("""SELECT j.issue_id,j.generation FROM issue_sla_jobs j JOIN issues i ON i.id=j.issue_id
                WHERE j.failed_at IS NULL AND j.next_attempt_at<=:now AND (CAST(:issue AS text) IS NULL OR j.issue_id=:issue)
                ORDER BY j.next_attempt_at,j.issue_id FOR UPDATE OF i SKIP LOCKED LIMIT 1"""),
                        {"now": now, "issue": issue_id},
                    )
                )
                .mappings()
                .first()
            )
            if not job:
                return False
            identifier, generation = job["issue_id"], job["generation"]
            db.info["lifecycle_source"] = "SYSTEM"
            cycle = await sync_issue(db, identifier, now=now)
            issue = await locked_issue(db, identifier)
            if cycle and cycle["state"] == "ACTIVE":
                consume(cycle, now)
                await save_cycle(db, cycle)
            await process_alerts(db, issue, cycle, now)
            await reschedule(db, identifier, now=now)
            await db.commit()
            return True
    except Exception as error:
        if identifier is None:
            raise
        await record_failure(factory, identifier, generation, error, now=now)
        raise
    finally:
        audit_source.reset(token)


async def sla_loop(factory, stop):
    while not stop.is_set():
        try:
            if await progress(factory, "sla-clocks", process_sla_job(factory)):
                continue
        except Exception:
            pass
        try:
            await asyncio.wait_for(stop.wait(), 5)
        except TimeoutError:
            pass
