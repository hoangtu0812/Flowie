import json

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.pagination import CursorCodec
from ..access.projects import team_access, workspace_access, workspace_manager
from ..access.team_scope import workspace_team_scope
from ..audit.write import record_change
from .calendar import add_working_seconds
from .commands import (
    CREATE_POLICY_INSERT_SLA_POLICIES,
    CREATE_POLICY_LOCK,
    POLICY_COMMAND_LOCK,
    POLICY_COMMAND_UPDATE_SLA_POLICIES,
    REVISION_INSERT_SLA_POLICY_REVISIONS,
    UPDATE_POLICY_LOCK,
    UPDATE_POLICY_UPDATE_SLA_POLICIES,
)
from .contracts import BusinessCalendar
from .queries import (
    CREATE_POLICY_SELECT_SLA_POLICIES,
    POLICY_COMMAND_SELECT_SLA_POLICIES,
    SELECT_POLICY_SELECT_SLA_POLICIES,
    UNIQUE_NAME_SELECT_SLA_POLICIES,
    VALIDATE_POLICY_SELECT_ISSUE_STATUSES,
    VALIDATE_POLICY_SELECT_TEAM_MEMBERS,
    VALIDATE_POLICY_SELECT_WORKSPACE_MEMBERS,
    list_policies_select_sla_policies_sql,
    list_policies_select_sla_policies_sql_2,
    policy_history_select_sla_policy_revisions_sql,
    policy_history_select_sla_policy_revisions_sql_2,
    read_policy_select_sla_policies_sql,
)


def policy_values(row):
    return {
        key: row[column]
        for key, column in [
            ("name", "name"),
            ("description", "description"),
            ("teamId", "team_id"),
            ("priority", "priority"),
            ("deadlineMinutes", "deadline_minutes"),
            ("enabled", "enabled"),
            ("calendar", "calendar"),
            ("pauseStatusIds", "pause_status_ids"),
            ("warningMinutes", "warning_minutes"),
            ("escalateToId", "escalate_to_id"),
            ("createdBy", "created_by"),
        ]
    }


def present(row):
    return {
        **policy_values(row),
        "id": row["id"],
        "version": row["version"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "archivedAt": row["archived_at"],
    }


async def read_policy(
    db, workspace, user, identifier, *, lock=False, include_archived=False
):
    await workspace_access(db, workspace, user["id"])
    scope = workspace_team_scope("p", include_archived=include_archived)
    row = (
        (
            await db.execute(
                read_policy_select_sla_policies_sql(scope, lock),
                {"id": identifier, "workspace": workspace, "user": user["id"]},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(404, "SLA policy not found or inaccessible.", "Not Found")
    return row


async def list_policies(
    db, workspace, user, secret, *, include_archived=False, limit=50, cursor=None
):
    await workspace_access(db, workspace, user["id"])
    scope = workspace_team_scope("p", include_archived=include_archived)
    params = {"workspace": workspace, "user": user["id"]}
    total = (
        await db.execute(
            list_policies_select_sla_policies_sql(scope), params
        )
    ).scalar_one()
    codec = CursorCodec(
        secret,
        user["id"],
        "sla-policies",
        {"workspace": workspace, "includeArchived": include_archived},
    )
    if cursor:
        params["time"], params["after"] = codec.decode(cursor)
        scope += " AND (p.created_at,p.id)<(:time,:after)"
    rows = (
        (
            await db.execute(
                list_policies_select_sla_policies_sql_2(scope),
                {**params, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    return {
        "data": [present(row) for row in rows[:limit]],
        "meta": {
            "total": total,
            "limit": limit,
            "nextCursor": codec.encode(
                rows[limit - 1]["created_at"], rows[limit - 1]["id"]
            )
            if len(rows) > limit
            else None,
        },
    }


async def validate_policy(db, workspace, user, payload):
    await workspace_manager(db, workspace, user["id"])
    if payload.teamId:
        await team_access(db, workspace, payload.teamId, user["id"])
    if payload.pauseStatusIds:
        count = (
            await db.execute(
                VALIDATE_POLICY_SELECT_ISSUE_STATUSES,
                {
                    "ids": payload.pauseStatusIds,
                    "workspace": workspace,
                    "team": payload.teamId,
                },
            )
        ).scalar_one()
        if count != len(payload.pauseStatusIds):
            raise ApiError(
                400,
                "Pause statuses must be accessible non-terminal statuses in the policy scope.",
                "Bad Request",
            )
    if payload.escalateToId:
        target = (
            await db.execute(
                VALIDATE_POLICY_SELECT_WORKSPACE_MEMBERS,
                {"workspace": workspace, "target": payload.escalateToId},
            )
        ).first()
        if not target:
            raise ApiError(
                400,
                "Escalation target must be an active workspace member.",
                "Bad Request",
            )
        if payload.teamId:
            target_team = (
                await db.execute(
                    VALIDATE_POLICY_SELECT_TEAM_MEMBERS,
                    {"team": payload.teamId, "target": payload.escalateToId},
                )
            ).first()
            if not target_team:
                raise ApiError(
                    400,
                    "Escalation target must have access to the policy team.",
                    "Bad Request",
                )
    return add_working_seconds(
        utcnow(), payload.deadlineMinutes * 60, payload.calendar
    )


async def unique_name(db, workspace, payload, identifier=None):
    duplicate = (
        await db.execute(
            UNIQUE_NAME_SELECT_SLA_POLICIES,
            {
                "workspace": workspace,
                "name": payload.name,
                "team": payload.teamId,
                "id": identifier,
            },
        )
    ).first()
    if duplicate:
        raise ApiError(
            409,
            "An active SLA policy with this name already exists in that scope.",
            "Conflict",
        )


async def revision(db, row, actor, *, kind=None):
    values = {
        **policy_values(row),
        "archivedAt": row["archived_at"].isoformat() if row["archived_at"] else None,
    }
    await db.execute(
        REVISION_INSERT_SLA_POLICY_REVISIONS,
        {
            "id": row["id"],
            "version": row["version"],
            "kind": kind or ("CREATED" if row["version"] == 1 else "CHANGED"),
            "snapshot": json.dumps(values),
            "actor": actor,
            "now": utcnow(),
        },
    )


async def create_policy(db, workspace, user, payload):
    await validate_policy(db, workspace, user, payload)
    await db.execute(
        CREATE_POLICY_LOCK,
        {"key": "sla-policy:" + workspace},
    )
    await unique_name(db, workspace, payload)
    total = (
        await db.execute(
            CREATE_POLICY_SELECT_SLA_POLICIES,
            {"workspace": workspace},
        )
    ).scalar_one()
    if total >= 200:
        raise ApiError(
            400,
            "At most 200 active or disabled non-archived SLA policies are allowed.",
            "Bad Request",
        )
    identifier, now = cuid(), utcnow()
    values = payload.model_dump(mode="json", exclude={"workspaceId"})
    await db.execute(
        CREATE_POLICY_INSERT_SLA_POLICIES,
        {
            **values,
            "id": identifier,
            "workspace": workspace,
            "actor": user["id"],
            "calendar": json.dumps(values["calendar"])
            if values["calendar"] is not None
            else None,
            "now": now,
        },
    )
    row = await read_policy(db, workspace, user, identifier)
    await revision(db, row, user["id"])
    await record_change(
        db, workspace, user["id"], "sla-policy.created", "sla-policy", identifier
    )
    return present(row)


async def update_policy(db, workspace, user, identifier, payload):
    await validate_policy(db, workspace, user, payload)
    await db.execute(
        UPDATE_POLICY_LOCK,
        {"key": "sla-policy:" + workspace},
    )
    row = await read_policy(
        db, workspace, user, identifier, lock=True, include_archived=True
    )
    if row["version"] != payload.expectedVersion:
        raise ApiError(409, "SLA policy changed. Reload before saving.", "Conflict")
    if row["archived_at"] is None:
        await unique_name(db, workspace, payload, identifier)
    values = payload.model_dump(mode="json", exclude={"expectedVersion"})
    await db.execute(
        UPDATE_POLICY_UPDATE_SLA_POLICIES,
        {
            **values,
            "id": identifier,
            "calendar": json.dumps(values["calendar"])
            if values["calendar"] is not None
            else None,
            "now": utcnow(),
        },
    )
    updated = await read_policy(db, workspace, user, identifier, include_archived=True)
    await revision(db, updated, user["id"])
    await record_change(
        db,
        workspace,
        user["id"],
        "sla-policy.updated",
        "sla-policy",
        identifier,
        fields=values,
    )
    return present(updated)


async def policy_history(db, workspace, user, identifier, *, before=None, limit=50):
    await read_policy(db, workspace, user, identifier, include_archived=True)
    params = {"id": identifier, "workspace": workspace, "user": user["id"]}
    scope = """r.policy_id=:id AND (r.snapshot->>'teamId' IS NULL OR EXISTS(SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
        WHERE t.id=r.snapshot->>'teamId' AND t.workspace_id=:workspace AND t.archived_at IS NULL AND tm.user_id=:user))"""
    total = (
        await db.execute(
            policy_history_select_sla_policy_revisions_sql(scope), params
        )
    ).scalar_one()
    if before:
        scope += " AND r.version<:before"
        params["before"] = before
    rows = (
        (
            await db.execute(
                policy_history_select_sla_policy_revisions_sql_2(scope),
                {**params, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    return {
        "data": [dict(row) for row in rows[:limit]],
        "meta": {
            "total": total,
            "nextBefore": rows[limit - 1]["version"] if len(rows) > limit else None,
        },
    }


async def select_policy(db, workspace, team, priority):
    row = (
        (
            await db.execute(
                SELECT_POLICY_SELECT_SLA_POLICIES,
                {"workspace": workspace, "team": team, "priority": priority},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        return None
    return {
        "id": row["id"],
        "version": row["version"],
        "values": policy_values(row),
        "calendar": BusinessCalendar.model_validate(row["calendar"])
        if row["calendar"] is not None
        else None,
    }


async def policy_command(db, workspace, user, identifier, command, expected):
    await workspace_manager(db, workspace, user["id"])
    await db.execute(
        POLICY_COMMAND_LOCK,
        {"key": "sla-policy:" + workspace},
    )
    row = await read_policy(
        db, workspace, user, identifier, lock=True, include_archived=True
    )
    if row["version"] != expected:
        raise ApiError(
            409, "SLA policy changed. Reload before making changes.", "Conflict"
        )
    if command == "restore":
        from .contracts import PolicyValues

        values = PolicyValues.model_validate(
            {
                key: value
                for key, value in policy_values(row).items()
                if key != "createdBy"
            }
        )
        await validate_policy(db, workspace, user, values)
        await unique_name(db, workspace, values, identifier)
        total = (
            await db.execute(
                POLICY_COMMAND_SELECT_SLA_POLICIES,
                {"workspace": workspace},
            )
        ).scalar_one()
        if total >= 200 and row["archived_at"]:
            raise ApiError(400, "The SLA policy limit has been reached.", "Bad Request")
        archived = None
    elif command == "archive":
        archived = utcnow()
    else:
        raise ApiError(400, "Unknown policy command.", "Bad Request")
    await db.execute(
        POLICY_COMMAND_UPDATE_SLA_POLICIES,
        {"id": identifier, "archived": archived, "now": utcnow()},
    )
    row = await read_policy(db, workspace, user, identifier, include_archived=True)
    await revision(
        db, row, user["id"], kind="RESTORED" if command == "restore" else "ARCHIVED"
    )
    await record_change(
        db, workspace, user["id"], "sla-policy." + command, "sla-policy", identifier
    )
    return present(row)
