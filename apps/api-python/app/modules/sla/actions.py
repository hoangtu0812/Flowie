
from ...core.clock import utcnow
from ...core.errors import ApiError
from ..audit.write import record_change
from ..work_items.issue_queries import issue_row
from ..work_items.lifecycle import actor_context
from .commands import (
    RETRY_JOB_UPDATE_ISSUE_SLA_JOBS,
)
from .queries import (
    RETRY_JOB_SELECT_ISSUE_SLA_JOBS,
)
from .synchronization import latest_cycle, locked_issue, reapply_policy


async def apply_current_policy(db, workspace, user, identifier, payload):
    await issue_row(db, identifier, workspace, user["id"])
    await locked_issue(db, identifier)
    issue = await issue_row(db, identifier, workspace, user["id"])
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
    await issue_row(db, identifier, workspace, user["id"])
    await locked_issue(db, identifier)
    await issue_row(db, identifier, workspace, user["id"])
    job = (
        (
            await db.execute(
                RETRY_JOB_SELECT_ISSUE_SLA_JOBS,
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
        RETRY_JOB_UPDATE_ISSUE_SLA_JOBS,
        {"id": identifier, "now": utcnow()},
    )
    await record_change(
        db, workspace, user["id"], "issue.sla_retry_requested", "issue", identifier
    )
