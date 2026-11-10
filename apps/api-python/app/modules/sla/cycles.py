import json

from ...core.identifiers import cuid
from .calendar import add_working_seconds, working_seconds_between
from .commands import (
    INSERT_CYCLE_INSERT_ISSUE_SLA_CYCLES,
    SAVE_CYCLE_UPDATE_ISSUE_SLA_CYCLES,
)
from .contracts import BusinessCalendar
from .queries import (
    LATEST_CYCLE_SELECT_ISSUE_SLA_CYCLES,
)

TERMINAL = {"COMPLETED", "CANCELED"}
LIVE = {"ACTIVE", "PAUSED"}


def calendar_for(snapshot):
    return (
        BusinessCalendar.model_validate(snapshot["calendar"])
        if snapshot.get("calendar") is not None
        else None
    )


def initial_clock(policy, status, category, now):
    values = policy["values"]
    budget = values["deadlineMinutes"] * 60
    state = (
        category
        if category in TERMINAL
        else ("PAUSED" if status in values["pauseStatusIds"] else "ACTIVE")
    )
    calendar = calendar_for(values)
    due = add_working_seconds(now, budget, calendar) if state != "PAUSED" else None
    warning = (
        add_working_seconds(now, budget - values["warningMinutes"] * 60, calendar)
        if state == "ACTIVE" and values["warningMinutes"]
        else None
    )
    return {
        "state": state,
        "budget": budget,
        "remaining": float(budget),
        "last": now if state == "ACTIVE" else None,
        "due": due,
        "warning": warning,
        "closed": now if state in TERMINAL else None,
        "breach": None,
    }


async def latest_cycle(db, issue):
    row = (
        (
            await db.execute(
                LATEST_CYCLE_SELECT_ISSUE_SLA_CYCLES,
                {"id": issue},
            )
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


async def insert_cycle(
    db,
    issue,
    policy,
    status,
    category,
    now,
    *,
    previous=None,
    reason="CREATED",
    clock=None,
):
    clock = clock or initial_clock(policy, status, category, now)
    identifier = cuid()
    snapshot = {
        **policy["values"],
        "issueTeamId": issue["team_id"],
        "bindingReason": reason,
    }
    await db.execute(
        INSERT_CYCLE_INSERT_ISSUE_SLA_CYCLES,
        {
            "id": identifier,
            "issue": issue["id"],
            "workspace": issue["workspace_id"],
            "cycle": previous["cycle"] + 1 if previous else 1,
            "policy": policy["id"],
            "version": policy["version"],
            "snapshot": json.dumps(snapshot),
            "now": now,
            **{
                key: clock[key]
                for key in (
                    "state",
                    "budget",
                    "remaining",
                    "last",
                    "due",
                    "warning",
                    "closed",
                )
            },
        },
    )
    return await latest_cycle(db, issue["id"])


def policy_from_cycle(cycle):
    return {
        "id": cycle["policy_id"],
        "version": cycle["policy_version"],
        "values": cycle["snapshot"],
        "calendar": calendar_for(cycle["snapshot"]),
    }


def consume(cycle, at):
    if cycle["state"] != "ACTIVE" or cycle["last_started_at"] is None:
        return
    if at < cycle["last_started_at"]:
        return
    calendar = calendar_for(cycle["snapshot"])
    used = working_seconds_between(
        cycle["last_started_at"], at, calendar, cap=cycle["remaining_seconds"]
    )
    cycle["remaining_seconds"] = max(0, cycle["remaining_seconds"] - used)
    cycle["last_started_at"] = at
    if (
        cycle["due_at"] is not None
        and at > cycle["due_at"]
        and cycle["breached_at"] is None
    ):
        cycle["breached_at"] = cycle["due_at"]


def transition(cycle, event):
    at = event["occurred_at"]
    consume(cycle, at)
    if event["to_archived_at"] is not None or event["to_category"] == "CANCELED":
        cycle.update(
            state="CANCELED", closed_at=at, last_started_at=None, warning_at=None
        )
    elif event["to_category"] == "COMPLETED":
        cycle.update(
            state="COMPLETED", closed_at=at, last_started_at=None, warning_at=None
        )
    elif event["to_status_id"] in cycle["snapshot"]["pauseStatusIds"]:
        cycle.update(state="PAUSED", last_started_at=None, warning_at=None)
        if cycle["breached_at"] is None:
            cycle["due_at"] = None
    elif cycle["state"] == "PAUSED":
        calendar = calendar_for(cycle["snapshot"])
        due = (
            cycle["due_at"]
            if cycle["breached_at"] is not None
            else add_working_seconds(at, cycle["remaining_seconds"], calendar)
        )
        warning = (
            add_working_seconds(
                at,
                max(
                    0,
                    cycle["remaining_seconds"]
                    - cycle["snapshot"]["warningMinutes"] * 60,
                ),
                calendar,
            )
            if cycle["snapshot"]["warningMinutes"] and cycle["warning_sent_at"] is None
            else None
        )
        cycle.update(state="ACTIVE", last_started_at=at, due_at=due, warning_at=warning)
    return cycle


async def save_cycle(db, cycle):
    await db.execute(
        SAVE_CYCLE_UPDATE_ISSUE_SLA_CYCLES,
        {
            key: cycle[key]
            for key in (
                "id",
                "state",
                "remaining_seconds",
                "last_started_at",
                "due_at",
                "warning_at",
                "closed_at",
                "breached_at",
            )
        },
    )
