from copy import deepcopy

from sqlalchemy import text

from ...core.clock import _utcnow
from ..access.projects import _workspace_access
from ..work_items.issue_queries import _issue_row
from ..work_items.issue_search import issue_scope
from .cycles import consume


def cycle_scope(alias="c"):
    return f"""EXISTS(SELECT 1 FROM teams ct JOIN team_members ctm ON ctm.team_id=ct.id
    WHERE ct.id={alias}.snapshot->>'issueTeamId' AND ct.workspace_id=:workspace AND ct.archived_at IS NULL AND ctm.user_id=:user)
    AND ({alias}.snapshot->>'teamId' IS NULL OR EXISTS(SELECT 1 FROM teams pt JOIN team_members ptm ON ptm.team_id=pt.id
    WHERE pt.id={alias}.snapshot->>'teamId' AND pt.workspace_id=:workspace AND pt.archived_at IS NULL AND ptm.user_id=:user))"""


def public_cycle(row, now):
    cycle = deepcopy(dict(row))
    consume(cycle, now)
    return {
        "cycle": cycle["cycle"],
        "policyVersion": cycle["policy_version"],
        "policyName": cycle["snapshot"]["name"],
        "state": cycle["state"],
        "budgetSeconds": cycle["budget_seconds"],
        "remainingSeconds": cycle["remaining_seconds"],
        "startedAt": cycle["started_at"],
        "closedAt": cycle["closed_at"],
        "dueAt": cycle["due_at"],
        "warningAt": cycle["warning_at"],
        "breachedAt": cycle["breached_at"],
        "warningProcessedAt": cycle["warning_sent_at"],
        "breachProcessedAt": cycle["breach_sent_at"],
        "escalationCode": cycle["escalation_code"],
        "alertResults": cycle["alert_results"],
        "calendar": cycle["snapshot"].get("calendar"),
        "bindingReason": cycle["snapshot"].get("bindingReason"),
    }


async def issue_sla(db, workspace, user, identifier, *, before=None, limit=20):
    issue = await _issue_row(db, identifier, workspace, user["id"])
    params = {"id": identifier, "workspace": workspace, "user": user["id"]}
    predicate = "c.issue_id=:id AND " + cycle_scope()
    total = (
        await db.execute(
            text("SELECT COUNT(*) FROM issue_sla_cycles c WHERE " + predicate), params
        )
    ).scalar_one()
    latest = (
        (
            await db.execute(
                text(
                    "SELECT c.* FROM issue_sla_cycles c WHERE c.issue_id=:id ORDER BY cycle DESC LIMIT 1"
                ),
                params,
            )
        )
        .mappings()
        .first()
    )
    visible = None
    if latest:
        visible = (
            (
                await db.execute(
                    text(
                        "SELECT c.* FROM issue_sla_cycles c WHERE "
                        + predicate
                        + " AND c.cycle=:cycle"
                    ),
                    {**params, "cycle": latest["cycle"]},
                )
            )
            .mappings()
            .first()
        )
    if before is not None:
        predicate += " AND c.cycle<:before"
        params["before"] = before
    rows = (
        (
            await db.execute(
                text(
                    "SELECT c.* FROM issue_sla_cycles c WHERE "
                    + predicate
                    + " ORDER BY c.cycle DESC LIMIT :limit"
                ),
                {**params, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    flags = (
        (
            await db.execute(
                text(
                    "SELECT sla_opt_out,EXISTS(SELECT 1 FROM issue_lifecycle_events e WHERE e.issue_id=i.id AND e.sla_processed_at IS NULL) AS pending FROM issues i WHERE id=:id"
                ),
                params,
            )
        )
        .mappings()
        .one()
    )
    job = (
        (
            await db.execute(
                text(
                    'SELECT generation,attempts,last_error_code AS "errorCode",failed_at AS "failedAt",next_attempt_at AS "nextAttemptAt" FROM issue_sla_jobs WHERE issue_id=:id'
                ),
                params,
            )
        )
        .mappings()
        .first()
    )
    now = _utcnow()
    return {
        "data": {
            "issueVersion": issue["version"],
            "latestCycle": latest["cycle"] if latest else None,
            "current": public_cycle(visible, now) if visible else None,
            "coverage": "MANUAL"
            if flags["sla_opt_out"]
            else "TRACKED"
            if visible
            else "RESTRICTED"
            if latest
            else "UNMANAGED",
            "pending": flags["pending"],
            "job": dict(job) if job else None,
            "history": [public_cycle(row, now) for row in rows[:limit]],
        },
        "meta": {
            "total": total,
            "nextBefore": rows[limit - 1]["cycle"] if len(rows) > limit else None,
        },
    }


async def sla_report(db, workspace, user, options):
    await _workspace_access(db, workspace, user["id"])
    scope, params = issue_scope(workspace, user["id"], options)
    params["now"] = _utcnow()
    # Select the latest cycle before checking historical team visibility.
    query = (
        """WITH scoped AS (SELECT i.id,i.sla_opt_out """
        + scope
        + """), clocks AS (
        SELECT i.id,i.sla_opt_out,c.state,c.breached_at,c.due_at,c.closed_at,c.budget_seconds,c.remaining_seconds
        FROM scoped i LEFT JOIN LATERAL (SELECT c.* FROM issue_sla_cycles c WHERE c.issue_id=i.id ORDER BY c.cycle DESC LIMIT 1) c ON """
        + cycle_scope()
        + """
    ) SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE sla_opt_out) AS manual,
    COUNT(*) FILTER(WHERE state IS NULL AND NOT sla_opt_out) AS unmanaged,
    COUNT(*) FILTER(WHERE state='ACTIVE' AND breached_at IS NULL AND due_at>=:now) AS active,
    COUNT(*) FILTER(WHERE state='PAUSED') AS paused,
    COUNT(*) FILTER(WHERE breached_at IS NOT NULL OR (state='ACTIVE' AND due_at<:now)) AS breached,
    COUNT(*) FILTER(WHERE state='COMPLETED' AND breached_at IS NULL) AS completed_on_time,
    COUNT(*) FILTER(WHERE state='COMPLETED' AND breached_at IS NOT NULL) AS completed_late,
    COUNT(*) FILTER(WHERE state IN ('CANCELED','OVERRIDDEN','UNAVAILABLE')) AS inactive,
    (SELECT COUNT(*) FROM issue_lifecycle_events e JOIN scoped x ON x.id=e.issue_id WHERE e.sla_processed_at IS NULL) AS pending_events
    FROM clocks"""
    )
    result = dict((await db.execute(text(query), params)).mappings().one())
    denominator = result["completed_on_time"] + result["completed_late"]
    result["compliancePercent"] = (
        round(100 * result["completed_on_time"] / denominator, 1)
        if denominator
        else None
    )
    return {"data": result}
