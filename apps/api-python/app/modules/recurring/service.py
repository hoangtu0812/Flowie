from hashlib import sha256
import json

from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ..access.projects import _workspace_manager, _team_access
from ..audit.write import record_change
from ..work_items.issue_rules import _validate_references
from .calendar import next_occurrence
from .repository import public_schedule, schedule_row


async def validate_template(db, workspace, team, template):
    values = template.model_dump()
    await _validate_references(db, workspace, team, values, creating=True)
    return values


async def create_schedule(db, user, payload):
    await _workspace_manager(db, payload.workspaceId, user["id"])
    await _team_access(db, payload.workspaceId, payload.teamId, user["id"])
    fingerprint = sha256(
        json.dumps(payload.model_dump(mode="json"), sort_keys=True).encode()
    ).hexdigest()
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
        {"key": f"recurring:{payload.workspaceId}"},
    )
    previous = (
        (
            await db.execute(
                text(
                    "SELECT * FROM recurring_schedules WHERE created_by=:actor AND request_key=:key"
                ),
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
            text(
                "SELECT COUNT(*) FROM recurring_schedules WHERE workspace_id=:workspace"
            ),
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
    identifier, now = _cuid(), _utcnow()
    await db.execute(
        text("""INSERT INTO recurring_schedules(id,workspace_id,team_id,created_by,request_key,fingerprint,name,rule,template,due_after_minutes,next_run_at,created_at,updated_at)
        VALUES (:id,:workspace,:team,:actor,:key,:fingerprint,:name,CAST(:rule AS jsonb),CAST(:template AS jsonb),:due,:next,:now,:now)"""),
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
    await _workspace_manager(db, workspace, user["id"])
    row = await schedule_row(db, workspace, user, identifier, lock=True)
    check_version(row, payload.expectedVersion)
    template = await validate_template(db, workspace, row["team_id"], payload.template)
    now = _utcnow()
    await db.execute(
        text("""UPDATE recurring_schedules SET name=:name,rule=CAST(:rule AS jsonb),template=CAST(:template AS jsonb),due_after_minutes=:due,
        next_run_at=:next,version=version+1,updated_at=:now WHERE id=:id"""),
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
    await _workspace_manager(db, workspace, user["id"])
    row = await schedule_row(db, workspace, user, identifier, lock=True)
    if command == "run-now" and payload.requestKey:
        existing = (
            await db.execute(
                text(
                    "SELECT id FROM recurring_runs WHERE schedule_id=:id AND occurrence_key=:key"
                ),
                {"id": identifier, "key": "manual:" + payload.requestKey},
            )
        ).first()
        if existing:
            return await public_schedule(db, workspace, user, row)
    check_version(row, payload.expectedVersion)
    now = _utcnow()
    if command == "run-now":
        if not payload.requestKey:
            raise ApiError(400, "Run now requires an idempotency key.", "Bad Request")
        if not row["active"]:
            raise ApiError(409, "Resume the schedule before running it.", "Conflict")
        count = (
            await db.execute(
                text(
                    "SELECT COUNT(*) FROM recurring_runs WHERE schedule_id=:id AND state='QUEUED'"
                ),
                {"id": identifier},
            )
        ).scalar_one()
        if count >= 1:
            raise ApiError(409, "A manual run is already queued.", "Conflict")
        await db.execute(
            text("""INSERT INTO recurring_runs(id,schedule_id,occurrence_key,scheduled_for,state,snapshot,created_at)
            VALUES (:run,:id,:key,:now,'QUEUED',CAST(:snapshot AS jsonb),:now)"""),
            {
                "run": _cuid(),
                "id": identifier,
                "key": "manual:" + payload.requestKey,
                "now": now,
                "snapshot": json.dumps(run_snapshot(row)),
            },
        )
    elif command in ("pause", "resume"):
        from .contracts import ScheduleRule

        await db.execute(
            text(
                "UPDATE recurring_schedules SET active=:active,version=version+1,updated_at=:now,next_run_at=:next,consecutive_failures=0 WHERE id=:id"
            ),
            {
                "id": identifier,
                "active": command == "resume",
                "now": now,
                "next": next_occurrence(ScheduleRule.model_validate(row["rule"]), now),
            },
        )
        if command == "pause":
            await db.execute(
                text(
                    "UPDATE recurring_runs SET state='CANCELED' WHERE schedule_id=:id AND state='QUEUED'"
                ),
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
