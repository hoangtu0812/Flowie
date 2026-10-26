from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ..work_items.lifecycle import managed_due
from .cycles import (
    LIVE,
    TERMINAL,
    consume,
    initial_clock,
    insert_cycle,
    latest_cycle,
    policy_from_cycle,
    save_cycle,
    transition,
)
from .policies import select_policy
from .jobs import reschedule


async def locked_issue(db, identifier):
    row = (
        (
            await db.execute(
                text("""SELECT i.*,s.category::text AS category,t.archived_at AS team_archived_at
        FROM issues i JOIN issue_statuses s ON s.id=i.status_id LEFT JOIN teams t ON t.id=i.team_id
        WHERE i.id=:id FOR UPDATE OF i"""),
                {"id": identifier},
            )
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


def safe_clock(policy, status, category, now):
    try:
        return initial_clock(policy, status, category, now)
    except ApiError:
        budget = policy["values"]["deadlineMinutes"] * 60
        return {
            "state": "UNAVAILABLE",
            "budget": budget,
            "remaining": float(budget),
            "last": None,
            "due": None,
            "warning": None,
            "closed": None,
            "breach": None,
        }


async def initialize_cycle(
    db, issue, policy, now, *, previous=None, reason="CREATED", clock=None
):
    clock = clock or safe_clock(policy, issue["status_id"], issue["category"], now)
    return await insert_cycle(
        db,
        issue,
        policy,
        issue["status_id"],
        issue["category"],
        now,
        previous=previous,
        reason=reason,
        clock=clock,
    )


async def close_cycle(db, cycle, state, at):
    consume(cycle, at)
    cycle.update(state=state, closed_at=at, last_started_at=None, warning_at=None)
    await save_cycle(db, cycle)


async def sync_issue(db, identifier, *, now=None):
    now = now or _utcnow()
    issue = await locked_issue(db, identifier)
    if not issue:
        return None
    cycle = await latest_cycle(db, identifier)
    events = (
        (
            await db.execute(
                text(
                    "SELECT * FROM issue_lifecycle_events WHERE issue_id=:id AND sla_processed_at IS NULL ORDER BY issue_version FOR UPDATE"
                ),
                {"id": identifier},
            )
        )
        .mappings()
        .all()
    )
    now = max(now, _utcnow(), *(event["occurred_at"] for event in events))
    rebind = False
    for event in events:
        if (
            event["kind"] not in ("BASELINE", "CREATED")
            and not event["managed_due"]
            and cycle
        ):
            if cycle["state"] in LIVE:
                manual_due = (
                    event["from_due_date"] != event["to_due_date"]
                    and event["to_sla_opt_out"]
                )
                if manual_due:
                    await close_cycle(db, cycle, "OVERRIDDEN", event["occurred_at"])
                elif event["from_team_id"] != event["to_team_id"]:
                    await close_cycle(db, cycle, "CANCELED", event["occurred_at"])
                    rebind = True
                else:
                    transition(cycle, event)
                    await save_cycle(db, cycle)
            elif event["from_team_id"] != event["to_team_id"]:
                rebind = True
            elif (
                cycle["state"] in TERMINAL
                and event["to_category"] not in TERMINAL
                and event["to_archived_at"] is None
                and not event["to_sla_opt_out"]
            ):
                if cycle["snapshot"]["issueTeamId"] == event["to_team_id"]:
                    # Reopens retain their accepted revision; delayed consumption never guesses a past policy version.
                    historical = {
                        **issue,
                        "team_id": event["to_team_id"],
                        "status_id": event["to_status_id"],
                        "category": event["to_category"],
                    }
                    cycle = await initialize_cycle(
                        db,
                        historical,
                        policy_from_cycle(cycle),
                        event["occurred_at"],
                        previous=cycle,
                        reason="RESTORED" if event["from_archived_at"] else "REOPENED",
                    )
                else:
                    rebind = True
        await db.execute(
            text(
                "UPDATE issue_lifecycle_events SET sla_processed_at=:now WHERE id=:id"
            ),
            {"id": event["id"], "now": now},
        )
    if issue["team_archived_at"] is not None or issue["archived_at"] is not None:
        if cycle and cycle["state"] in LIVE:
            archived = issue["archived_at"] or issue["team_archived_at"]
            await close_cycle(db, cycle, "CANCELED", max(archived, cycle["started_at"]))
        await reschedule(db, identifier, now=now)
        return cycle
    if rebind and not issue["sla_opt_out"] and issue["category"] not in TERMINAL:
        policy = await select_policy(
            db, issue["workspace_id"], issue["team_id"], issue["priority"]
        )
        if policy:
            cycle = await initialize_cycle(
                db, issue, policy, now, previous=cycle, reason="TEAM_CHANGED"
            )
    if cycle and issue["sla_opt_out"] and cycle["state"] in LIVE:
        await close_cycle(db, cycle, "OVERRIDDEN", now)
    if not issue["sla_opt_out"]:
        same_team = (
            cycle is not None and cycle["snapshot"]["issueTeamId"] == issue["team_id"]
        )
        desired = (
            cycle["due_at"] if same_team and cycle["state"] != "OVERRIDDEN" else None
        )
        if (same_team or rebind) and issue["due_date"] != desired:
            await managed_due(db, identifier, desired)
            await db.execute(
                text(
                    "UPDATE issue_lifecycle_events SET sla_processed_at=:now WHERE issue_id=:id AND sla_processed_at IS NULL AND managed_due=true"
                ),
                {"id": identifier, "now": now},
            )
    await reschedule(db, identifier, now=now)
    return cycle


async def reapply_policy(db, identifier, *, now=None):
    now = now or _utcnow()
    issue = await locked_issue(db, identifier)
    if (
        not issue
        or issue["archived_at"] is not None
        or issue["team_archived_at"] is not None
    ):
        raise ApiError(404, "Issue unavailable.", "Not Found")
    if issue["category"] in TERMINAL:
        raise ApiError(409, "Reopen the issue before applying an SLA.", "Conflict")
    await sync_issue(db, identifier, now=now)
    issue = await locked_issue(db, identifier)
    now = max(now, _utcnow())
    cycle = await latest_cycle(db, identifier)
    policy = await select_policy(
        db, issue["workspace_id"], issue["team_id"], issue["priority"]
    )
    if not policy:
        raise ApiError(400, "No active SLA policy matches this issue.", "Bad Request")
    clock = initial_clock(policy, issue["status_id"], issue["category"], now)
    if cycle and cycle["state"] in LIVE:
        await close_cycle(db, cycle, "OVERRIDDEN", now)
    await db.execute(
        text("UPDATE issues SET sla_opt_out=false WHERE id=:id"), {"id": identifier}
    )
    issue["sla_opt_out"] = False
    cycle = await initialize_cycle(
        db, issue, policy, now, previous=cycle, reason="REAPPLIED", clock=clock
    )
    if issue["due_date"] != cycle["due_at"]:
        await managed_due(db, identifier, cycle["due_at"])
    await db.execute(
        text(
            "UPDATE issue_lifecycle_events SET sla_processed_at=:now WHERE issue_id=:id AND sla_processed_at IS NULL AND managed_due=true"
        ),
        {"id": identifier, "now": now},
    )
    await reschedule(db, identifier, now=now)
    return cycle
