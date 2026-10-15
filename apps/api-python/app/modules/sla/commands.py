from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ..audit.write import record_change
from ..work_items.issue_queries import _issue_row
from ..work_items.lifecycle import actor_context
from .synchronization import locked_issue, latest_cycle, reapply_policy


async def apply_current_policy(db, workspace, user, identifier, payload):
    await _issue_row(db, identifier, workspace, user["id"])
    await locked_issue(db, identifier)
    issue = await _issue_row(db, identifier, workspace, user["id"])
    cycle = await latest_cycle(db, identifier)
    if (
        issue["version"] != payload.expectedVersion
        or (cycle["cycle"] if cycle else None) != payload.expectedCycle
    ):
        raise ApiError(
            409, "Issue or SLA changed. Reload before applying a policy.", "Conflict"
        )
    await actor_context(db, user["id"])
    await reapply_policy(db, identifier)
    await record_change(
        db, workspace, user["id"], "issue.sla_reapplied", "issue", identifier
    )


async def retry_job(db, workspace, user, identifier, payload):
    await _issue_row(db, identifier, workspace, user["id"])
    await locked_issue(db, identifier)
    await _issue_row(db, identifier, workspace, user["id"])
    job = (
        (
            await db.execute(
                text(
                    "SELECT generation,failed_at FROM issue_sla_jobs WHERE issue_id=:id FOR UPDATE"
                ),
                {"id": identifier},
            )
        )
        .mappings()
        .first()
    )
    if (
        not job
        or job["generation"] != payload.expectedGeneration
        or job["failed_at"] is None
    ):
        raise ApiError(
            409, "SLA job changed or is not failed. Reload before retrying.", "Conflict"
        )
    await db.execute(
        text(
            "UPDATE issue_sla_jobs SET generation=generation+1,attempts=0,failed_at=NULL,last_error_code=NULL,next_attempt_at=:now WHERE issue_id=:id"
        ),
        {"id": identifier, "now": _utcnow()},
    )
    await record_change(
        db, workspace, user["id"], "issue.sla_retry_requested", "issue", identifier
    )
