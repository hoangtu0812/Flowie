"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

UPDATE_NOTIFICATION_PREFERENCES_INSERT_NOTIFICATION_PREFERENCES = text(
    """INSERT INTO notification_preferences
               (workspace_id, user_id, team_issue_added, issue_completed, issue_added_to_triage, created_at, updated_at)
               VALUES (:workspace_id, :user_id, :team_issue_added, :issue_completed, :issue_added_to_triage, :now, :now)
               ON CONFLICT (workspace_id, user_id) DO UPDATE
               SET team_issue_added = EXCLUDED.team_issue_added,
                   issue_completed = EXCLUDED.issue_completed,
                   issue_added_to_triage = EXCLUDED.issue_added_to_triage,
                   updated_at = EXCLUDED.updated_at"""
)


UPDATE_NOTIFICATION_PREFERENCES_INSERT_AUDIT_LOGS = text(
    """INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :workspace_id, :actor_id, 'notification.preferences.updated', 'user', :actor_id, CAST(:metadata AS jsonb), :now)"""
)


MARK_ALL_READ_UPDATE_NOTIFICATIONS = text(
    '''UPDATE notifications SET read_at = :now
               WHERE workspace_id = :workspace_id AND user_id = :user_id AND read_at IS NULL'''
)


MARK_READ_UPDATE_NOTIFICATIONS = text('UPDATE notifications SET read_at = :now WHERE id = :id')


DELETE_ALL_NOTIFICATIONS_DELETE_NOTIFICATIONS = text('DELETE FROM notifications WHERE workspace_id = :workspace_id AND user_id = :user_id')


DELETE_READ_NOTIFICATIONS_DELETE_NOTIFICATIONS = text(
    '''DELETE FROM notifications
               WHERE workspace_id = :workspace_id AND user_id = :user_id AND read_at IS NOT NULL'''
)


DELETE_COMPLETED_ISSUE_NOTIFICATIONS_DELETE_NOTIFICATIONS = text(
    '''DELETE FROM notifications notification
               USING issues issue, issue_statuses status
               WHERE notification.workspace_id = :workspace_id
                 AND notification.user_id = :user_id
                 AND notification.entity_type = 'issue'
                 AND notification.entity_id = issue.id
                 AND issue.status_id = status.id
                 AND status.category IN ('COMPLETED', 'CANCELED')'''
)


UPDATE_CHANNELS_INSERT_NOTIFICATION_PREFERENCES = text("""INSERT INTO notification_preferences(workspace_id,user_id,email_enabled,desktop_enabled,teams_enabled,ticket_email_enabled,created_at,updated_at)
        VALUES (:workspace,:user,:email,:desktop,COALESCE(CAST(:teams AS boolean),true),COALESCE(CAST(:tickets AS boolean),true),:now,:now) ON CONFLICT(workspace_id,user_id) DO UPDATE SET email_enabled=EXCLUDED.email_enabled,
        desktop_enabled=EXCLUDED.desktop_enabled,teams_enabled=COALESCE(CAST(:teams AS boolean),notification_preferences.teams_enabled),
        ticket_email_enabled=COALESCE(CAST(:tickets AS boolean),notification_preferences.ticket_email_enabled),updated_at=:now""")


def snooze_update_notifications_sql(notification_scope) -> TextClause:
    return text(
        f"UPDATE notifications n SET snoozed_until=:until WHERE id=:id AND workspace_id=:workspace AND user_id=:user AND {notification_scope(actor=':user')} RETURNING id"
    )


DELIVER_ONE_UPDATE_NOTIFICATION_EMAIL_DELIVERIES = text("""UPDATE notification_email_deliveries SET delivered_at=:delivered,failed_at=:failed,last_error_code=:error,
            available_at=:retry,lease_until=NULL,lease_token=NULL WHERE notification_id=:id AND lease_token=:token""")


WAKE_SNOOZED_UPDATE_NOTIFICATIONS = text("""UPDATE notifications SET snoozed_until=NULL WHERE id IN (
            SELECT id FROM notifications WHERE snoozed_until<=:now ORDER BY snoozed_until,id FOR UPDATE SKIP LOCKED LIMIT 100)
            RETURNING id,workspace_id,user_id,read_at""")


DELIVER_ONE_UPDATE_NOTIFICATION_EMAIL_DELIVERIES_2 = text("""UPDATE notification_email_deliveries SET attempts=attempts+1,lease_token=:token,lease_until=:lease
            WHERE notification_id=(SELECT notification_id FROM notification_email_deliveries e WHERE delivered_at IS NULL AND failed_at IS NULL
            AND available_at<=:now AND (lease_until IS NULL OR lease_until<:now)
            AND (CAST(:target AS text) IS NULL OR notification_id=CAST(:target AS text))
            AND EXISTS(SELECT 1 FROM notifications n WHERE n.id=e.notification_id AND (n.snoozed_until IS NULL OR n.snoozed_until<=:now))
            ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1)
            RETURNING notification_id,attempts""")


PROCESS_ONE_UPDATE_NOTIFICATION_OUTBOX = text("""
            UPDATE notification_outbox SET lease_until=:lease, lease_token=:token, attempts=attempts+1
            WHERE id=(SELECT id FROM notification_outbox
                WHERE delivered_at IS NULL AND failed_at IS NULL AND available_at<=:now
                AND (lease_until IS NULL OR lease_until<:now) AND (CAST(:target AS text) IS NULL OR id=CAST(:target AS text))
                ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
            RETURNING id,payload,attempts
        """)


PROCESS_ONE_UPDATE_NOTIFICATION_OUTBOX_2 = text("""
            UPDATE notification_outbox SET delivered_at=:delivered,failed_at=:failed,
                available_at=:retry,lease_until=NULL,lease_token=NULL,
                payload=CASE WHEN :clear THEN '{}'::jsonb ELSE payload END
            WHERE id=:id AND lease_token=:token
        """)


STAGE_NOTIFICATIONS_INSERT_NOTIFICATION_OUTBOX = text(
    "INSERT INTO notification_outbox (id,workspace_id,payload) VALUES (:id,:workspace,CAST(:payload AS jsonb))"
)
