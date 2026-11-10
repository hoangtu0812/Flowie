"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

RETRY_JOB_SELECT_ISSUE_SLA_JOBS = text(
    "SELECT generation,failed_at FROM issue_sla_jobs WHERE issue_id=:id FOR UPDATE"
)


def escalation_actor_select_users_sql(team_join, locked_rows) -> TextClause:
    return text(
        f"""SELECT u.id,u.name,u.avatar_url FROM users u
        JOIN workspace_members wm ON wm.user_id=u.id AND wm.workspace_id=:workspace
        {team_join}
        WHERE u.id=:id AND u.status='ACTIVE' AND wm.status='ACTIVE' FOR SHARE OF {locked_rows}"""
    )


PROCESS_ALERTS_SELECT_ISSUE_SLA_CYCLES = text(
    "SELECT * FROM issue_sla_cycles WHERE issue_id=:id AND breached_at IS NOT NULL AND breach_sent_at IS NULL ORDER BY cycle LIMIT 20 FOR UPDATE"
)


LATEST_CYCLE_SELECT_ISSUE_SLA_CYCLES = text(
    "SELECT * FROM issue_sla_cycles WHERE issue_id=:id ORDER BY cycle DESC LIMIT 1 FOR UPDATE"
)


RECORD_FAILURE_SELECT_ISSUES = text("SELECT id FROM issues WHERE id=:id FOR UPDATE")


RESCHEDULE_SELECT_ISSUE_LIFECYCLE_EVENTS = text(
    "SELECT MIN(occurred_at) FROM issue_lifecycle_events WHERE issue_id=:id AND sla_processed_at IS NULL"
)


RESCHEDULE_SELECT_ISSUE_SLA_CYCLES = text(
    "SELECT 1 FROM issue_sla_cycles WHERE issue_id=:id AND breached_at IS NOT NULL AND breach_sent_at IS NULL LIMIT 1"
)


RESCHEDULE_SELECT_ISSUE_SLA_CYCLES_2 = text(
    "SELECT state,due_at,warning_at,warning_sent_at,breached_at,breach_sent_at FROM issue_sla_cycles WHERE issue_id=:id ORDER BY cycle DESC LIMIT 1"
)


RECORD_FAILURE_SELECT_ISSUE_SLA_JOBS = text(
    "SELECT attempts,generation FROM issue_sla_jobs WHERE issue_id=:id FOR UPDATE"
)


POLICY_OPTIONS_SELECT_ISSUE_STATUSES = text(
    "SELECT id,name FROM issue_statuses WHERE workspace_id=:workspace AND (team_id IS NULL OR team_id=:team) AND category NOT IN ('COMPLETED','CANCELED') ORDER BY position,name,id"
)


POLICY_OPTIONS_SELECT_WORKSPACE_MEMBERS = text("""SELECT u.id,u.name FROM workspace_members wm JOIN users u ON u.id=wm.user_id
        WHERE wm.workspace_id=:workspace AND wm.status='ACTIVE' AND u.status='ACTIVE'
        AND (CAST(:team AS text) IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=:team AND tm.user_id=u.id)) ORDER BY u.name,u.id""")


def list_policies_select_sla_policies_sql(scope) -> TextClause:
    return text("SELECT COUNT(*) FROM sla_policies p WHERE " + scope)


UNIQUE_NAME_SELECT_SLA_POLICIES = text("""SELECT 1 FROM sla_policies WHERE workspace_id=:workspace AND archived_at IS NULL
        AND lower(name)=lower(:name) AND team_id IS NOT DISTINCT FROM :team AND (CAST(:id AS text) IS NULL OR id<>:id)""")


CREATE_POLICY_SELECT_SLA_POLICIES = text(
    "SELECT COUNT(*) FROM sla_policies WHERE workspace_id=:workspace AND archived_at IS NULL"
)


def policy_history_select_sla_policy_revisions_sql(scope) -> TextClause:
    return text("SELECT COUNT(*) FROM sla_policy_revisions r WHERE " + scope)


VALIDATE_POLICY_SELECT_ISSUE_STATUSES = text("""SELECT COUNT(*) FROM issue_statuses s WHERE s.id=ANY(CAST(:ids AS text[])) AND s.workspace_id=:workspace
            AND (s.team_id IS NULL OR s.team_id=:team) AND s.category NOT IN ('COMPLETED','CANCELED')""")


VALIDATE_POLICY_SELECT_WORKSPACE_MEMBERS = text(
    "SELECT 1 FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=:workspace AND wm.user_id=:target AND wm.status='ACTIVE' AND u.status='ACTIVE'"
)


POLICY_COMMAND_SELECT_SLA_POLICIES = text(
    "SELECT COUNT(*) FROM sla_policies WHERE workspace_id=:workspace AND archived_at IS NULL"
)


def read_policy_select_sla_policies_sql(scope, lock) -> TextClause:
    return text(
        "SELECT p.* FROM sla_policies p WHERE p.id=:id AND "
        + scope
        + (" FOR UPDATE OF p" if lock else "")
    )


def list_policies_select_sla_policies_sql_2(scope) -> TextClause:
    return text(
        "SELECT p.* FROM sla_policies p WHERE "
        + scope
        + " ORDER BY p.created_at DESC,p.id DESC LIMIT :limit"
    )


VALIDATE_POLICY_SELECT_TEAM_MEMBERS = text(
    "SELECT 1 FROM team_members WHERE team_id=:team AND user_id=:target"
)


def policy_history_select_sla_policy_revisions_sql_2(scope) -> TextClause:
    return text(
        'SELECT version,kind,snapshot,created_at AS "createdAt" FROM sla_policy_revisions r WHERE '
        + scope
        + " ORDER BY version DESC LIMIT :limit"
    )


SELECT_POLICY_SELECT_SLA_POLICIES = text("""SELECT * FROM sla_policies WHERE workspace_id=:workspace AND archived_at IS NULL AND enabled=true
        AND (team_id IS NULL OR team_id=:team) AND (priority IS NULL OR priority=:priority)
        ORDER BY ((CASE WHEN team_id=:team THEN 2 ELSE 0 END)+(CASE WHEN priority=:priority THEN 1 ELSE 0 END)) DESC,created_at,id LIMIT 1 FOR SHARE""")


def issue_sla_select_issue_sla_cycles_sql(predicate) -> TextClause:
    return text("SELECT COUNT(*) FROM issue_sla_cycles c WHERE " + predicate)


ISSUE_SLA_SELECT_ISSUE_SLA_CYCLES = text(
    "SELECT c.* FROM issue_sla_cycles c WHERE c.issue_id=:id ORDER BY cycle DESC LIMIT 1"
)


def issue_sla_select_issue_sla_cycles_sql_2(predicate) -> TextClause:
    return text(
        "SELECT c.* FROM issue_sla_cycles c WHERE "
        + predicate
        + " ORDER BY c.cycle DESC LIMIT :limit"
    )


ISSUE_SLA_SELECT_ISSUE_LIFECYCLE_EVENTS = text(
    "SELECT sla_opt_out,EXISTS(SELECT 1 FROM issue_lifecycle_events e WHERE e.issue_id=i.id AND e.sla_processed_at IS NULL) AS pending FROM issues i WHERE id=:id"
)


ISSUE_SLA_SELECT_ISSUE_SLA_JOBS = text(
    'SELECT generation,attempts,last_error_code AS "errorCode",failed_at AS "failedAt",next_attempt_at AS "nextAttemptAt" FROM issue_sla_jobs WHERE issue_id=:id'
)


def issue_sla_select_issue_sla_cycles_sql_3(predicate) -> TextClause:
    return text(
        "SELECT c.* FROM issue_sla_cycles c WHERE "
        + predicate
        + " AND c.cycle=:cycle"
    )


LOCKED_ISSUE_SELECT_ISSUES = text("""SELECT i.*,s.category::text AS category,t.archived_at AS team_archived_at
        FROM issues i JOIN issue_statuses s ON s.id=i.status_id LEFT JOIN teams t ON t.id=i.team_id
        WHERE i.id=:id FOR UPDATE OF i""")


SYNC_ISSUE_SELECT_ISSUE_LIFECYCLE_EVENTS = text(
    "SELECT * FROM issue_lifecycle_events WHERE issue_id=:id AND sla_processed_at IS NULL ORDER BY issue_version FOR UPDATE"
)


PROCESS_SLA_JOB_SELECT_ISSUE_SLA_JOBS = text("""SELECT j.issue_id,j.generation FROM issue_sla_jobs j JOIN issues i ON i.id=j.issue_id
                WHERE j.failed_at IS NULL AND j.next_attempt_at<=:now AND (CAST(:issue AS text) IS NULL OR j.issue_id=:issue)
                ORDER BY j.next_attempt_at,j.issue_id FOR UPDATE OF i SKIP LOCKED LIMIT 1""")


def sla_report_select_sql(scope, cycle_clause) -> TextClause:
    return text(
        """WITH scoped AS (SELECT i.id,i.sla_opt_out """
        + scope
        + """), clocks AS (
        SELECT i.id,i.sla_opt_out,c.state,c.breached_at,c.due_at,c.closed_at,c.budget_seconds,c.remaining_seconds
        FROM scoped i LEFT JOIN LATERAL (SELECT c.* FROM issue_sla_cycles c WHERE c.issue_id=i.id ORDER BY c.cycle DESC LIMIT 1) c ON """
        + cycle_clause
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
