"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

CREATE_GENERATED_CYCLE_SELECT_CYCLES = text('SELECT id FROM cycles WHERE team_id = :team_id AND start_date = :start_date'
     ' AND end_date = :end_date LIMIT 1')


APPLY_TEAM_CADENCE_SELECT_CYCLES = text('''SELECT count(*) FROM cycles WHERE team_id = :team_id
                    AND status IN ('ACTIVE', 'UPCOMING') AND end_date < :today''')


APPLY_TEAM_CADENCE_SELECT_CYCLES_2 = text('''SELECT id, name, status, start_date, end_date FROM cycles
                WHERE team_id = :team_id ORDER BY start_date ASC, created_at ASC''')


RUN_CYCLE_CADENCE_SELECT_TEAMS = text('''SELECT id, workspace_id, cycle_cadence_weeks FROM teams
                    WHERE archived_at IS NULL AND cycle_cadence_weeks IS NOT NULL''')


DELIVER_DUE_DIGESTS_SELECT_WORKSPACES = text(
    """SELECT w.id FROM workspaces w
                   JOIN discord_webhooks dw ON dw.workspace_id = w.id
                   WHERE dw.enabled = TRUE AND dw.daily_digest_enabled = TRUE
                     AND (dw.daily_digest_sent_at IS NULL OR dw.daily_digest_sent_at < :cutoff)"""
)


RUN_DUE_DISPATCHERS_SELECT_TEAM_DISPATCHER_SETTINGS = text("""SELECT s.team_id, t.workspace_id FROM team_dispatcher_settings s
                   JOIN teams t ON t.id = s.team_id
                   WHERE s.enabled = TRUE AND t.archived_at IS NULL""")


DELIVER_DUE_REMINDERS_SELECT_ISSUE_REMINDERS = text(
    '''SELECT reminder.id, reminder.user_id, reminder.remind_at,
                          issue.id AS issue_id, issue.workspace_id, issue.identifier, issue.title
                   FROM issue_reminders reminder
                   JOIN issues issue ON issue.id = reminder.issue_id
                   WHERE reminder.delivered_at IS NULL AND reminder.remind_at <= :now
                     AND issue.archived_at IS NULL
                   ORDER BY reminder.remind_at ASC
                   FOR UPDATE OF reminder SKIP LOCKED
                   LIMIT 100'''
)


PROCESS_SCM_DELIVERIES_SELECT_SCM_WEBHOOK_DELIVERIES = text(
    '''SELECT id FROM scm_webhook_deliveries
                   WHERE status IN ('PENDING', 'FAILED', 'PROCESSING') AND next_attempt_at <= :now
                     AND attempts < :max_attempts
                   ORDER BY received_at ASC
                   FOR UPDATE SKIP LOCKED LIMIT 20'''
)


PROCESS_SCM_DELIVERIES_SELECT_SCM_WEBHOOK_DELIVERIES_2 = text('SELECT * FROM scm_webhook_deliveries WHERE id = :id')


def sync_due_connections_select_scm_connections_sql(DUE) -> TextClause:
    return text(f'SELECT id FROM scm_connections WHERE {DUE} ORDER BY last_synced_at ASC NULLS FIRST')


def sync_due_connections_select_scm_connections_sql_2(DUE) -> TextClause:
    return text(f'SELECT id FROM scm_connections WHERE id = :id AND {DUE}')


CLOSED_PROJECT_STATUS_NAMES_SELECT_PROJECT_STATUSES = text("SELECT name FROM project_statuses WHERE workspace_id = :workspace_id"
     " AND category IN ('completed', 'canceled')")


HAS_ACTIVE_SLA_SELECT_SLA_POLICIES = text('''SELECT 1 FROM sla_policies policy
                WHERE policy.workspace_id = :workspace_id AND policy.archived_at IS NULL
                  AND policy.enabled = true
                  AND (policy.team_id IS NULL OR policy.team_id = :team_id)
                  AND (policy.priority IS NULL OR policy.priority = :priority)
                LIMIT 1''')


CANCELED_STATUS_ID_SELECT_ISSUE_STATUSES = text('''SELECT id FROM issue_statuses
                    WHERE workspace_id = :workspace_id AND category = 'CANCELED'
                      AND (team_id = :team_id OR (:team_id IS NULL AND team_id IS NULL))
                    ORDER BY position ASC LIMIT 1''')


def apply_auto_close_select_issues_sql(_OPEN_ELIGIBILITY) -> TextClause:
    return text(f'''SELECT issue.id, issue.workspace_id, issue.team_id, issue.status_id,
                        issue.identifier, issue.title, issue.priority
                 FROM issues issue JOIN issue_statuses status ON status.id = issue.status_id
                 WHERE {_OPEN_ELIGIBILITY}
                 ORDER BY issue.updated_at ASC LIMIT :batch_size''')


def apply_auto_archive_select_issues_sql(_CLOSED_ELIGIBILITY) -> TextClause:
    return text(f'''SELECT issue.id, issue.workspace_id, issue.creator_id,
                        issue.identifier, issue.title
                 FROM issues issue JOIN issue_statuses status ON status.id = issue.status_id
                 WHERE {_CLOSED_ELIGIBILITY}
                 ORDER BY issue.updated_at ASC LIMIT :batch_size''')


APPLY_AUTO_CLOSE_SELECT_ISSUE_SUBSCRIPTIONS = text('''SELECT DISTINCT subscription.user_id FROM issue_subscriptions subscription
                    JOIN notification_preferences preference
                      ON preference.user_id = subscription.user_id
                     AND preference.workspace_id = :workspace_id
                    WHERE subscription.issue_id = :issue_id AND preference.issue_completed = true''')


RUN_TEAM_POLICIES_SELECT_TEAMS = text('''SELECT id, workspace_id, auto_close_days, auto_archive_days FROM teams
                    WHERE archived_at IS NULL
                      AND (auto_close_days IS NOT NULL OR auto_archive_days IS NOT NULL)''')


NOTIFY_TICKET_STATUS_CHANGES_SELECT_ASKS = text(
    '''SELECT ask.id, ask.number, ask.workspace_id, ask.title, ask.status, ask.created_by, ask.notified_ticket_status, ask.reopened_at,
                          COALESCE(issue.completed_at, issue.canceled_at) AS closed_at, issue_status.category
                   FROM asks ask
                   LEFT JOIN issues issue ON issue.id = ask.converted_issue_id
                   LEFT JOIN issue_statuses issue_status ON issue_status.id = issue.status_id
                   WHERE ask.archived_at IS NULL'''
)
