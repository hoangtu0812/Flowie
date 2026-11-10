"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def schedules_select_sql(scope) -> TextClause:
    return text("SELECT COUNT(*) " + scope)


def run_history_select_sql(scope) -> TextClause:
    return text("SELECT COUNT(*) " + scope)


def schedule_row_select_recurring_schedules_sql(lock) -> TextClause:
    return text(
        "SELECT * FROM recurring_schedules WHERE id=:id AND workspace_id=:workspace"
        + (" FOR UPDATE" if lock else "")
    )


def schedules_select_sql_2(scope) -> TextClause:
    return text(
        "SELECT r.* "
        + scope
        + " ORDER BY r.created_at DESC,r.id DESC LIMIT :limit"
    )


def run_history_select_team_members_sql(scope) -> TextClause:
    return text(
        """SELECT r.id,r.scheduled_for AS "scheduledFor",r.state,r.error_code AS "errorCode",r.created_at AS "createdAt",r.snapshot->>'version' AS "scheduleVersion",
        CASE WHEN i.workspace_id=:workspace AND i.archived_at IS NULL AND (i.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.team_id=i.team_id AND tm.user_id=:user AND t.archived_at IS NULL)) THEN i.identifier END AS identifier """
        + scope
        + " ORDER BY r.created_at DESC,r.id DESC LIMIT :limit"
    )


def public_schedules_select_projects_sql(project_read_scope) -> TextClause:
    return text(
        "SELECT p.id FROM projects p WHERE p.id=ANY(CAST(:ids AS text[])) AND "
        + project_read_scope()
    )


CREATE_SCHEDULE_SELECT_RECURRING_SCHEDULES = text(
    "SELECT COUNT(*) FROM recurring_schedules WHERE workspace_id=:workspace"
)


SCHEDULE_COMMAND_SELECT_RECURRING_RUNS = text(
    "SELECT id FROM recurring_runs WHERE schedule_id=:id AND occurrence_key=:key"
)


SCHEDULE_COMMAND_SELECT_RECURRING_RUNS_2 = text(
    "SELECT COUNT(*) FROM recurring_runs WHERE schedule_id=:id AND state='QUEUED'"
)


CREATE_SCHEDULE_SELECT_RECURRING_SCHEDULES_2 = text(
    "SELECT * FROM recurring_schedules WHERE created_by=:actor AND request_key=:key"
)


PROCESS_SCHEDULE_SELECT_RECURRING_SCHEDULES = text("""SELECT * FROM recurring_schedules s WHERE active=true AND
            (next_run_at<=:now OR EXISTS(SELECT 1 FROM recurring_runs r WHERE r.schedule_id=s.id AND r.state='QUEUED'))
            ORDER BY next_run_at,id FOR UPDATE SKIP LOCKED LIMIT 1""")


PROCESS_SCHEDULE_SELECT_RECURRING_RUNS = text(
    "SELECT * FROM recurring_runs WHERE schedule_id=:id AND state='QUEUED' ORDER BY created_at,id FOR UPDATE LIMIT 1"
)


PROCESS_SCHEDULE_SELECT_USERS = text(
    "SELECT id,name,avatar_url AS \"avatarUrl\" FROM users WHERE id=:id AND status='ACTIVE'"
)
