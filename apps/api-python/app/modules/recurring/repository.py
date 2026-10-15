from sqlalchemy import text

from ...core.errors import ApiError
from ...core.pagination import CursorCodec
from ..access.projects import _team_access, _workspace_access
from ..access.project_scope import project_read_scope


def present(row):
    return {
        key: row[column]
        for key, column in [
            ("id", "id"),
            ("name", "name"),
            ("teamId", "team_id"),
            ("rule", "rule"),
            ("template", "template"),
            ("dueAfterMinutes", "due_after_minutes"),
            ("active", "active"),
            ("version", "version"),
            ("nextRunAt", "next_run_at"),
            ("consecutiveFailures", "consecutive_failures"),
            ("createdBy", "created_by"),
            ("createdAt", "created_at"),
        ]
    }


async def public_schedules(db, workspace, user, rows):
    project_ids = list(
        {
            row["template"].get("projectId")
            for row in rows
            if row["template"].get("projectId")
        }
    )
    visible = set()
    if project_ids:
        visible = set(
            (
                await db.execute(
                    text(
                        "SELECT p.id FROM projects p WHERE p.id=ANY(CAST(:ids AS text[])) AND "
                        + project_read_scope()
                    ),
                    {"ids": project_ids, "workspace": workspace, "user": user["id"]},
                )
            )
            .scalars()
            .all()
        )
    results = []
    for row in rows:
        value = present(row)
        if (
            row["template"].get("projectId")
            and row["template"]["projectId"] not in visible
        ):
            value["template"] = {**row["template"], "projectId": None}
            value["unavailableProject"] = True
        results.append(value)
    return results


async def public_schedule(db, workspace, user, row):
    return (await public_schedules(db, workspace, user, [row]))[0]


async def schedule_row(db, workspace, user, identifier, *, lock=False):
    row = (
        (
            await db.execute(
                text(
                    "SELECT * FROM recurring_schedules WHERE id=:id AND workspace_id=:workspace"
                    + (" FOR UPDATE" if lock else "")
                ),
                {"id": identifier, "workspace": workspace},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(404, "Recurring schedule not found.", "Not Found")
    await _team_access(db, workspace, row["team_id"], user["id"])
    return row


async def schedules(db, workspace, user, secret, *, team=None, cursor=None, limit=50):
    await _workspace_access(db, workspace, user["id"])
    params = {"workspace": workspace, "user": user["id"]}
    scope = """FROM recurring_schedules r JOIN teams t ON t.id=r.team_id WHERE r.workspace_id=:workspace AND t.archived_at IS NULL
        AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=r.team_id AND tm.user_id=:user)"""
    if team:
        scope += " AND r.team_id=:team"
        params["team"] = team
    total = (await db.execute(text("SELECT COUNT(*) " + scope), params)).scalar_one()
    codec = CursorCodec(
        secret,
        user["id"],
        "recurring-schedules",
        {"workspace": workspace, "team": team},
    )
    if cursor:
        params["time"], params["after"] = codec.decode(cursor)
        scope += " AND (r.created_at,r.id)<(:time,:after)"
    rows = (
        (
            await db.execute(
                text(
                    "SELECT r.* "
                    + scope
                    + " ORDER BY r.created_at DESC,r.id DESC LIMIT :limit"
                ),
                {**params, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    return {
        "data": await public_schedules(db, workspace, user, rows[:limit]),
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


async def run_history(db, workspace, user, secret, identifier, cursor=None, limit=50):
    await schedule_row(db, workspace, user, identifier)
    params = {"schedule": identifier}
    scope = "FROM recurring_runs r LEFT JOIN issues i ON i.id=r.issue_id WHERE r.schedule_id=:schedule"
    total = (await db.execute(text("SELECT COUNT(*) " + scope), params)).scalar_one()
    codec = CursorCodec(
        secret,
        user["id"],
        "recurring-runs",
        {"workspace": workspace, "schedule": identifier},
    )
    if cursor:
        params["time"], params["after"] = codec.decode(cursor)
        scope += " AND (r.created_at,r.id)<(:time,:after)"
    # The schedule's team scope remains necessary; issue access is independently rechecked after a move.
    rows = (
        (
            await db.execute(
                text(
                    """SELECT r.id,r.scheduled_for AS "scheduledFor",r.state,r.error_code AS "errorCode",r.created_at AS "createdAt",r.snapshot->>'version' AS "scheduleVersion",
        CASE WHEN i.workspace_id=:workspace AND i.archived_at IS NULL AND EXISTS(SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.team_id=i.team_id AND tm.user_id=:user AND t.archived_at IS NULL) THEN i.identifier END AS identifier """
                    + scope
                    + " ORDER BY r.created_at DESC,r.id DESC LIMIT :limit"
                ),
                {
                    **params,
                    "workspace": workspace,
                    "user": user["id"],
                    "limit": limit + 1,
                },
            )
        )
        .mappings()
        .all()
    )
    return {
        "data": [dict(row) for row in rows[:limit]],
        "meta": {
            "total": total,
            "limit": limit,
            "nextCursor": codec.encode(
                rows[limit - 1]["createdAt"], rows[limit - 1]["id"]
            )
            if len(rows) > limit
            else None,
        },
    }
