from copy import deepcopy

from ...core.clock import utcnow
from ..access.projects import workspace_access
from ..work_items.issue_queries import issue_row
from ..work_items.issue_search import issue_scope
from .cycles import consume
from .queries import (
    ISSUE_SLA_SELECT_ISSUE_LIFECYCLE_EVENTS,
    ISSUE_SLA_SELECT_ISSUE_SLA_CYCLES,
    ISSUE_SLA_SELECT_ISSUE_SLA_JOBS,
    issue_sla_select_issue_sla_cycles_sql,
    issue_sla_select_issue_sla_cycles_sql_2,
    issue_sla_select_issue_sla_cycles_sql_3,
    sla_report_select_sql,
)


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
    issue = await issue_row(db, identifier, workspace, user["id"])
    params = {"id": identifier, "workspace": workspace, "user": user["id"]}
    predicate = "c.issue_id=:id AND " + cycle_scope()
    total = (
        await db.execute(
            issue_sla_select_issue_sla_cycles_sql(predicate), params
        )
    ).scalar_one()
    latest = (
        (
            await db.execute(
                ISSUE_SLA_SELECT_ISSUE_SLA_CYCLES,
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
                    issue_sla_select_issue_sla_cycles_sql_3(predicate),
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
                issue_sla_select_issue_sla_cycles_sql_2(predicate),
                {**params, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    flags = (
        (
            await db.execute(
                ISSUE_SLA_SELECT_ISSUE_LIFECYCLE_EVENTS,
                params,
            )
        )
        .mappings()
        .one()
    )
    job = (
        (
            await db.execute(
                ISSUE_SLA_SELECT_ISSUE_SLA_JOBS,
                params,
            )
        )
        .mappings()
        .first()
    )
    now = utcnow()
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
    await workspace_access(db, workspace, user["id"])
    scope, params = issue_scope(workspace, user["id"], options)
    params["now"] = utcnow()
    # Select the latest cycle before checking historical team visibility.
    query = sla_report_select_sql(scope, cycle_scope())
    result = dict((await db.execute(query, params)).mappings().one())
    denominator = result["completed_on_time"] + result["completed_late"]
    result["compliancePercent"] = (
        round(100 * result["completed_on_time"] / denominator, 1)
        if denominator
        else None
    )
    return {"data": result}
