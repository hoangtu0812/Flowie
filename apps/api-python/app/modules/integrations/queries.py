"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

INTEGRATION_MANAGER_SELECT_WORKSPACE_MEMBERS = text(
    '''SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id
                 AND status = 'ACTIVE' AND role IN ('OWNER', 'ADMIN')'''
)


DISCORD_STATUS_SELECT_DISCORD_WEBHOOKS = text('SELECT enabled, daily_digest_enabled, webhook_url, updated_at FROM discord_webhooks WHERE workspace_id = :workspace_id')


SAVE_DISCORD_SELECT_DISCORD_WEBHOOKS = text('SELECT id, webhook_url FROM discord_webhooks WHERE workspace_id = :workspace_id')


TEST_DISCORD_SELECT_DISCORD_WEBHOOKS = text('SELECT webhook_url, enabled FROM discord_webhooks WHERE workspace_id = :workspace_id')


TEAMS_STATUS_SELECT_TEAMS_WEBHOOKS = text('SELECT enabled, webhook_url, updated_at FROM teams_webhooks WHERE workspace_id = :workspace_id')


SAVE_TEAMS_SELECT_TEAMS_WEBHOOKS = text('SELECT webhook_url FROM teams_webhooks WHERE workspace_id = :workspace_id')


TEST_TEAMS_SELECT_TEAMS_WEBHOOKS = text('SELECT webhook_url, enabled FROM teams_webhooks WHERE workspace_id = :workspace_id')


def project_teams_access_select_workspace_members_sql(project_read_scope) -> TextClause:
    return text(
        f'''SELECT p.lead_id = :user OR EXISTS(
                     SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = :workspace
                       AND wm.user_id = :user AND wm.status = 'ACTIVE' AND wm.role IN ('OWNER', 'ADMIN'))
               FROM projects p WHERE p.id = :project_id AND {project_read_scope()}'''
    )


PROJECT_TEAMS_STATUS_SELECT_PROJECT_TEAMS_CHANNELS = text('SELECT channel_name, enabled, webhook_url, updated_at FROM project_teams_channels WHERE project_id = :project_id')


SAVE_PROJECT_TEAMS_SELECT_PROJECT_TEAMS_CHANNELS = text('SELECT webhook_url FROM project_teams_channels WHERE project_id = :project_id')


TEST_PROJECT_TEAMS_SELECT_PROJECT_TEAMS_CHANNELS = text('SELECT webhook_url, enabled FROM project_teams_channels WHERE project_id = :project_id')


# Outgoing webhooks (DTD-904). The secret is selected only where a delivery is signed.
# VI: Webhook gửi ra ngoài (DTD-904). Secret chỉ được đọc ở chỗ ký một lần gửi.
LIST_OUTGOING_WEBHOOKS = text(
    '''SELECT w.id, w.name, w.url, w.events, w.enabled, w.consecutive_failures, w.disabled_at,
                      w.disabled_reason, w.created_at, w.updated_at,
                      last.event AS last_event, last.response_status AS last_status,
                      last.delivered_at AS last_delivered_at, last.failed_at AS last_failed_at,
                      last.last_error AS last_error, last.created_at AS last_created_at
               FROM outgoing_webhooks w
               LEFT JOIN LATERAL (
                   SELECT d.event, d.response_status, d.delivered_at, d.failed_at, d.last_error, d.created_at
                   FROM outgoing_webhook_deliveries d WHERE d.webhook_id = w.id
                   ORDER BY d.created_at DESC, d.id DESC LIMIT 1
               ) last ON true
               WHERE w.workspace_id = :workspace_id
               ORDER BY w.created_at, w.id'''
)


OUTGOING_WEBHOOK = text(
    '''SELECT id, name, url, events, enabled FROM outgoing_webhooks
               WHERE id = :id AND workspace_id = :workspace_id'''
)


OUTGOING_WEBHOOK_DELIVERIES = text(
    '''SELECT id, event, attempts, response_status, duration_ms, last_error, delivered_at, failed_at,
                      available_at, created_at
               FROM outgoing_webhook_deliveries WHERE webhook_id = :id
               ORDER BY created_at DESC, id DESC LIMIT 20'''
)


SUBSCRIBED_OUTGOING_WEBHOOKS = text(
    '''SELECT id FROM outgoing_webhooks
               WHERE workspace_id = :workspace_id AND enabled AND :event = ANY(events)'''
)


OUTGOING_WEBHOOK_TARGET = text('SELECT url, secret FROM outgoing_webhooks WHERE id = :id')
