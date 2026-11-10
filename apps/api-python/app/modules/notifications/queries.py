"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def readable_recipients_select_n_sql(notification_scope) -> TextClause:
    return text(
        """WITH n AS (SELECT CAST(:workspace AS text) AS workspace_id,CAST(:entity_type AS text) AS entity_type,CAST(:entity_id AS text) AS entity_id,unnest(CAST(:users AS text[])) AS user_id)
        SELECT n.user_id FROM n WHERE """
        + notification_scope()
    )


def readable_records_select_notifications_sql(notification_scope) -> TextClause:
    return text(
        "SELECT n.id,n.workspace_id,n.user_id FROM notifications n WHERE n.id=ANY(CAST(:ids AS text[])) AND "
        + notification_scope()
    )


def list_notifications_select_notifications_sql(notification_scope) -> TextClause:
    return text(
        f'''SELECT id, workspace_id, user_id, type, entity_type, entity_id, data, read_at, created_at, snoozed_until
               FROM notifications n
               WHERE workspace_id = :workspace_id AND user_id = :user_id
               AND {notification_scope(actor=':user_id')}
               AND (:include_snoozed OR snoozed_until IS NULL OR snoozed_until<=:now)
               ORDER BY created_at DESC'''
    )


NOTIFICATION_PREFERENCES_SELECT_NOTIFICATION_PREFERENCES = text(
    """SELECT team_issue_added, issue_completed, issue_added_to_triage
               FROM notification_preferences
               WHERE workspace_id = :workspace_id AND user_id = :user_id"""
)


def notification_exists_select_notifications_sql(notification_scope) -> TextClause:
    return text(
        f'''SELECT 1 FROM notifications n
                 WHERE id = :id AND workspace_id = :workspace_id AND user_id = :user_id AND {notification_scope(actor=':user_id')}'''
    )


def delivery_status_select_notification_email_deliveries_sql(notification_scope) -> TextClause:
    return text(f"""SELECT n.id AS "notificationId",e.attempts,e.delivered_at AS "deliveredAt",e.failed_at AS "failedAt",
        e.last_error_code AS "lastErrorCode",e.available_at AS "retryAt" FROM notification_email_deliveries e JOIN notifications n ON n.id=e.notification_id
        WHERE n.workspace_id=:workspace AND n.user_id=:user AND {notification_scope(actor=':user')} ORDER BY n.created_at DESC LIMIT 50""")


CHANNELS_SELECT_NOTIFICATION_PREFERENCES = text(
    "SELECT email_enabled,desktop_enabled,teams_enabled,ticket_email_enabled FROM notification_preferences WHERE workspace_id=:workspace AND user_id=:user"
)


DELIVER_ONE_SELECT_NOTIFICATIONS = text("""SELECT u.email,u.status,u.email_verified_at,w.id AS workspace_id,w.slug AS workspace_slug,p.email_enabled,
            p.ticket_email_enabled,wm.status AS membership_status,n.user_id,n.entity_type,n.entity_id,n.data,n.created_at,
            a.created_by AS ticket_owner,a.archived_at AS ticket_archived_at
            FROM notifications n JOIN users u ON u.id=n.user_id JOIN workspaces w ON w.id=n.workspace_id
            LEFT JOIN workspace_members wm ON wm.user_id=n.user_id AND wm.workspace_id=n.workspace_id
            LEFT JOIN notification_preferences p ON p.user_id=n.user_id AND p.workspace_id=n.workspace_id
            LEFT JOIN asks a ON n.entity_type='ticket' AND a.id=n.entity_id WHERE n.id=:id""")
