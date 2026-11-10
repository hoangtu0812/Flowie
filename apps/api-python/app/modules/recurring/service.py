import json
from hashlib import sha256

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..access.projects import team_access, workspace_manager
from ..audit.write import record_change
from ..work_items.issue_rules import validate_references
from .calendar import next_occurrence
from .commands import (
    CREATE_SCHEDULE_INSERT_RECURRING_SCHEDULES,
    CREATE_SCHEDULE_LOCK,
    SCHEDULE_COMMAND_INSERT_RECURRING_RUNS,
    SCHEDULE_COMMAND_UPDATE_RECURRING_RUNS,
    SCHEDULE_COMMAND_UPDATE_RECURRING_SCHEDULES,
    UPDATE_SCHEDULE_UPDATE_RECURRING_SCHEDULES,
)
from .queries import (
    CREATE_SCHEDULE_SELECT_RECURRING_SCHEDULES,
    CREATE_SCHEDULE_SELECT_RECURRING_SCHEDULES_2,
    SCHEDULE_COMMAND_SELECT_RECURRING_RUNS,
    SCHEDULE_COMMAND_SELECT_RECURRING_RUNS_2,
)
from .repository import public_schedule, schedule_row


async def validate_template(db, workspace, team, template):
    values = template.model_dump()
    await validate_references(db, workspace, team, values, creating=True)
    return values


async def create_schedule(db, user, payload):
    await workspace_manager(db, payload.workspaceId, user["id"])
    await team_access(db, payload.workspaceId, payload.teamId, user["id"])
    fingerprint = sha256(
        json.dumps(payload.model_dump(mode="json"), sort_keys=True).encode()
    ).hexdigest()
    await db.execute(
        CREATE_SCHEDULE_LOCK,
        {"key": f"recurring:{payload.workspaceId}"},
    )
    previous = (
        (
            await db.execute(
                CREATE_SCHEDULE_SELECT_RECURRING_SCHEDULES_2,
                {"actor": user["id"], "key": payload.requestKey},
            )
        )
        .mappings()
        .first()
    )
    if previous:
        if previous["fingerprint"] != fingerprint:
            raise ApiError(
                409, "Request key already used for another schedule.", "Conflict"
            )
        return await public_schedule(db, payload.workspaceId, user, previous)
    count = (
        await db.execute(
            CREATE_SCHEDULE_SELECT_RECURRING_SCHEDULES,
            {"workspace": payload.workspaceId},
        )
    ).scalar_one()
    if count >= 100:
        raise ApiError(
            400, "A workspace can have at most 100 recurring schedules.", "Bad Request"
        )
    template = await validate_template(
        db, payload.workspaceId, payload.teamId, payload.template
    )
    identifier, now = cuid(), utcnow()
    await db.execute(
        CREATE_SCHEDULE_INSERT_RECURRING_SCHEDULES,
        {
            "id": identifier,
            "workspace": payload.workspaceId,
            "team": payload.teamId,
            "actor": user["id"],
            "key": payload.requestKey,
            "fingerprint": fingerprint,
            "name": payload.name,
            "rule": json.dumps(payload.rule.model_dump(mode="json")),
            "template": json.dumps(template),
            "due": payload.dueAfterMinutes,
            "next": next_occurrence(payload.rule, now),
            "now": now,
        },
    )
    await record_change(
        db,
        payload.workspaceId,
        user["id"],
        "recurring.created",
        "recurring-schedule",
        identifier,
    )
    return await public_schedule(
        db,
        payload.workspaceId,
        user,
        await schedule_row(db, payload.workspaceId, user, identifier),
    )


def check_version(row, expected):
    if row["version"] != expected:
        raise ApiError(
            409, "Schedule changed. Reload before making changes.", "Conflict"
        )


async def update_schedule(db, user, workspace, identifier, payload):
    await workspace_manager(db, workspace, user["id"])
    row = await schedule_row(db, workspace, user, identifier, lock=True)
    check_version(row, payload.expectedVersion)
    template = await validate_template(db, workspace, row["team_id"], payload.template)
    now = utcnow()
    await db.execute(
        UPDATE_SCHEDULE_UPDATE_RECURRING_SCHEDULES,
        {
            "id": identifier,
            "name": payload.name,
            "rule": json.dumps(payload.rule.model_dump(mode="json")),
            "template": json.dumps(template),
            "due": payload.dueAfterMinutes,
            "next": next_occurrence(payload.rule, now),
            "now": now,
        },
    )
    await record_change(
        db,
        workspace,
        user["id"],
        "recurring.updated",
        "recurring-schedule",
        identifier,
        fields=["name", "rule", "template", "dueAfterMinutes"],
    )
    return await public_schedule(
        db, workspace, user, await schedule_row(db, workspace, user, identifier)
    )


def run_snapshot(row):
    return {
        "version": row["version"],
        "rule": row["rule"],
        "template": row["template"],
        "dueAfterMinutes": row["due_after_minutes"],
    }


async def schedule_command(db, user, workspace, identifier, command, payload):
    await workspace_manager(db, workspace, user["id"])
    row = await schedule_row(db, workspace, user, identifier, lock=True)
    if command == "run-now" and payload.requestKey:
        existing = (
            await db.execute(
                SCHEDULE_COMMAND_SELECT_RECURRING_RUNS,
                {"id": identifier, "key": "manual:" + payload.requestKey},
            )
        ).first()
        if existing:
            return await public_schedule(db, workspace, user, row)
    check_version(row, payload.expectedVersion)
    now = utcnow()
    if command == "run-now":
        if not payload.requestKey:
            raise ApiError(400, "Run now requires an idempotency key.", "Bad Request")
        if not row["active"]:
            raise ApiError(409, "Resume the schedule before running it.", "Conflict")
        count = (
            await db.execute(
                SCHEDULE_COMMAND_SELECT_RECURRING_RUNS_2,
                {"id": identifier},
            )
        ).scalar_one()
        if count >= 1:
            raise ApiError(409, "A manual run is already queued.", "Conflict")
        await db.execute(
            SCHEDULE_COMMAND_INSERT_RECURRING_RUNS,
            {
                "run": cuid(),
                "id": identifier,
                "key": "manual:" + payload.requestKey,
                "now": now,
                "snapshot": json.dumps(run_snapshot(row)),
            },
        )
    elif command in ("pause", "resume"):
        from .contracts import ScheduleRule

        await db.execute(
            SCHEDULE_COMMAND_UPDATE_RECURRING_SCHEDULES,
            {
                "id": identifier,
                "active": command == "resume",
                "now": now,
                "next": next_occurrence(ScheduleRule.model_validate(row["rule"]), now),
            },
        )
        if command == "pause":
            await db.execute(
                SCHEDULE_COMMAND_UPDATE_RECURRING_RUNS,
                {"id": identifier},
            )
    else:
        raise ApiError(400, "Unknown schedule command.", "Bad Request")
    await record_change(
        db,
        workspace,
        user["id"],
        "recurring." + command,
        "recurring-schedule",
        identifier,
    )
    return await public_schedule(
        db, workspace, user, await schedule_row(db, workspace, user, identifier)
    )
