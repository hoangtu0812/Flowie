"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

CREATE_GENERATED_CYCLE_INSERT_CYCLES = text('''INSERT INTO cycles (id, workspace_id, team_id, name, status, start_date, end_date,
                                    created_at, updated_at)
                VALUES (:id, :workspace_id, :team_id, :name, :status, :start_date, :end_date,
                        :now, :now)''')


CREATE_GENERATED_CYCLE_INSERT_AUDIT_LOGS = text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id,
                                        metadata, created_at)
                VALUES (:id, :workspace_id, NULL, 'cycle.auto_generated', 'cycle', :entity_id,
                        CAST(:metadata AS jsonb), :now)''')


APPLY_TEAM_CADENCE_LOCK = text('SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))')


APPLY_TEAM_CADENCE_UPDATE_CYCLES = text('''UPDATE cycles SET status = 'COMPLETED', updated_at = :now
                    WHERE team_id = :team_id AND status IN ('ACTIVE', 'UPCOMING')
                      AND end_date < :today''')


APPLY_TEAM_CADENCE_UPDATE_CYCLES_2 = text("UPDATE cycles SET status = 'ACTIVE', updated_at = :now"
     " WHERE id = :id AND status = 'UPCOMING'")


DELIVER_DUE_REMINDERS_INSERT_NOTIFICATIONS = text(
    '''INSERT INTO notifications
                       (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                       VALUES (:id, :workspace_id, :user_id, 'issue.reminder', 'issue', :issue_id,
                        CAST(:data AS jsonb), :now)'''
)


DELIVER_DUE_REMINDERS_UPDATE_ISSUE_REMINDERS = text('UPDATE issue_reminders SET delivered_at = :now, updated_at = :now WHERE id = :id')


PROCESS_SCM_DELIVERIES_UPDATE_SCM_WEBHOOK_DELIVERIES = text(
    '''UPDATE scm_webhook_deliveries
                       SET status = 'PROCESSING', next_attempt_at = :lease_until
                       WHERE id = ANY(:ids)'''
)


PROCESS_SCM_DELIVERIES_UPDATE_SCM_WEBHOOK_DELIVERIES_2 = text(
    '''UPDATE scm_webhook_deliveries
                           SET status = :status, payload = CAST('{}' AS jsonb),
                               processed_at = :now, last_error = NULL
                           WHERE id = :id'''
)


PROCESS_SCM_DELIVERIES_UPDATE_SCM_WEBHOOK_DELIVERIES_3 = text(
    '''UPDATE scm_webhook_deliveries
                           SET status = 'FAILED', attempts = :attempts, last_error = :error,
                               payload = CASE WHEN :terminal THEN CAST('{}' AS jsonb) ELSE payload END,
                               next_attempt_at = :retry_at,
                               processed_at = CASE WHEN :terminal THEN :now ELSE NULL END
                           WHERE id = :id'''
)


def apply_auto_close_update_issues_sql(_OPEN_ELIGIBILITY) -> TextClause:
    return text(f'''UPDATE issues SET status_id = :status_id, completed_at = NULL,
                            canceled_at = :now, resolution = NULL, duplicate_of_id = NULL,
                            updated_at = :now
                     WHERE id = :id AND id IN (
                         SELECT issue.id FROM issues issue
                         JOIN issue_statuses status ON status.id = issue.status_id
                         WHERE {_OPEN_ELIGIBILITY})''')


APPLY_AUTO_CLOSE_INSERT_ACTIVITIES = text('''INSERT INTO activities (id, workspace_id, issue_id, actor_id, type, data, created_at)
                    VALUES (:id, :workspace_id, :issue_id, NULL, 'issue.auto_closed',
                            CAST(:data AS jsonb), :now)''')


def apply_auto_archive_update_issues_sql(_CLOSED_ELIGIBILITY) -> TextClause:
    return text(f'''UPDATE issues SET archived_at = :now, updated_at = :now
                     WHERE id = :id AND id IN (
                         SELECT issue.id FROM issues issue
                         JOIN issue_statuses status ON status.id = issue.status_id
                         WHERE {_CLOSED_ELIGIBILITY})''')


APPLY_AUTO_ARCHIVE_INSERT_ACTIVITIES = text('''INSERT INTO activities (id, workspace_id, issue_id, actor_id, type, data, created_at)
                    VALUES (:id, :workspace_id, :issue_id, NULL, 'issue.auto_archived',
                            CAST(:data AS jsonb), :now)''')


APPLY_AUTO_ARCHIVE_INSERT_NOTIFICATIONS = text('''INSERT INTO notifications
                    (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                    VALUES (:id, :workspace_id, :user_id, 'issue.auto_archived', 'issue', :issue_id,
                            CAST(:data AS jsonb), :now)''')


APPLY_AUTO_CLOSE_INSERT_NOTIFICATIONS = text('''INSERT INTO notifications
                        (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                        VALUES (:id, :workspace_id, :user_id, 'issue.auto_closed', 'issue', :issue_id,
                                CAST(:data AS jsonb), :now)''')


NOTIFY_TICKET_STATUS_CHANGES_UPDATE_ASKS = text('UPDATE asks SET notified_ticket_status = :current WHERE id = :id AND notified_ticket_status IS NOT DISTINCT FROM CAST(:seen AS text) RETURNING id')
