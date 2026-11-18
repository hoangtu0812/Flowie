"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

SAVE_TEAMS_INSERT_TEAMS_WEBHOOKS = text(
    '''INSERT INTO teams_webhooks (id, workspace_id, webhook_url, enabled, created_at, updated_at)
               VALUES (:id, :workspace_id, :webhook_url, :enabled, :now, :now)
               ON CONFLICT (workspace_id) DO UPDATE SET webhook_url = EXCLUDED.webhook_url,
                   enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
               RETURNING enabled, webhook_url, updated_at'''
)


SAVE_PROJECT_TEAMS_INSERT_PROJECT_TEAMS_CHANNELS = text(
    '''INSERT INTO project_teams_channels (id, project_id, channel_name, webhook_url, enabled, created_at, updated_at)
               VALUES (:id, :project_id, :channel_name, :webhook_url, :enabled, :now, :now)
               ON CONFLICT (project_id) DO UPDATE SET channel_name = EXCLUDED.channel_name,
                   webhook_url = EXCLUDED.webhook_url, enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
               RETURNING channel_name, enabled, webhook_url, updated_at'''
)


DELETE_PROJECT_TEAMS_DELETE_PROJECT_TEAMS_CHANNELS = text('DELETE FROM project_teams_channels WHERE project_id = :project_id')


SAVE_DISCORD_UPDATE_DISCORD_WEBHOOKS = text(
    '''UPDATE discord_webhooks SET webhook_url = :webhook_url, enabled = :enabled,
                   daily_digest_enabled = :daily_digest_enabled,
                   updated_at = :now WHERE id = :id
                   RETURNING enabled, daily_digest_enabled, webhook_url, updated_at'''
)


SAVE_DISCORD_INSERT_DISCORD_WEBHOOKS = text(
    '''INSERT INTO discord_webhooks (id, workspace_id, webhook_url, enabled, daily_digest_enabled, created_at, updated_at)
                   VALUES (:id, :workspace_id, :webhook_url, :enabled, :daily_digest_enabled, :now, :now)
                   RETURNING enabled, daily_digest_enabled, webhook_url, updated_at'''
)


# Outgoing webhooks (DTD-904). VI: Webhook gửi ra ngoài (DTD-904).
CREATE_OUTGOING_WEBHOOK = text(
    '''INSERT INTO outgoing_webhooks (id, workspace_id, name, url, secret, events, enabled, created_by_id, created_at, updated_at)
               VALUES (:id, :workspace_id, :name, :url, :secret, :events, true, :user_id, :now, :now)'''
)


UPDATE_OUTGOING_WEBHOOK = text(
    '''UPDATE outgoing_webhooks SET name = :name, url = :url, events = :events, enabled = :enabled,
                   consecutive_failures = CASE WHEN :enabled AND NOT enabled THEN 0 ELSE consecutive_failures END,
                   disabled_at = CASE WHEN :enabled THEN NULL ELSE disabled_at END,
                   disabled_reason = CASE WHEN :enabled THEN NULL ELSE disabled_reason END,
                   updated_at = :now
               WHERE id = :id AND workspace_id = :workspace_id'''
)


ROTATE_OUTGOING_WEBHOOK_SECRET = text(
    '''UPDATE outgoing_webhooks SET secret = :secret, updated_at = :now
               WHERE id = :id AND workspace_id = :workspace_id RETURNING id'''
)


DELETE_OUTGOING_WEBHOOK = text(
    'DELETE FROM outgoing_webhooks WHERE id = :id AND workspace_id = :workspace_id RETURNING id'
)


STAGE_OUTGOING_WEBHOOK_DELIVERY = text(
    '''INSERT INTO outgoing_webhook_deliveries (id, webhook_id, event, payload, available_at, created_at)
               VALUES (:id, :webhook_id, :event, CAST(:payload AS jsonb), :now, :now)'''
)


LEASE_OUTGOING_WEBHOOK_DELIVERY = text(
    '''UPDATE outgoing_webhook_deliveries SET lease_until = :lease, lease_token = :token, attempts = attempts + 1
               WHERE id = (SELECT d.id FROM outgoing_webhook_deliveries d
                   JOIN outgoing_webhooks w ON w.id = d.webhook_id
                   WHERE d.delivered_at IS NULL AND d.failed_at IS NULL AND d.available_at <= :now
                     AND (d.lease_until IS NULL OR d.lease_until < :now)
                     AND (w.enabled OR d.event = 'ping')
                     AND (CAST(:target AS text) IS NULL OR d.id = CAST(:target AS text))
                   ORDER BY d.available_at, d.id FOR UPDATE OF d SKIP LOCKED LIMIT 1)
               RETURNING id, webhook_id, event, payload, attempts'''
)


FINISH_OUTGOING_WEBHOOK_DELIVERY = text(
    '''UPDATE outgoing_webhook_deliveries SET lease_until = NULL, lease_token = NULL,
                   response_status = :status, duration_ms = :duration, last_error = :error,
                   delivered_at = :delivered, failed_at = :failed, available_at = :retry
               WHERE id = :id AND lease_token = :token'''
)


RESET_OUTGOING_WEBHOOK_FAILURES = text(
    'UPDATE outgoing_webhooks SET consecutive_failures = 0 WHERE id = :id'
)


COUNT_OUTGOING_WEBHOOK_FAILURE = text(
    '''UPDATE outgoing_webhooks SET consecutive_failures = consecutive_failures + 1,
                   enabled = CASE WHEN consecutive_failures + 1 >= :limit THEN false ELSE enabled END,
                   disabled_at = CASE WHEN enabled AND consecutive_failures + 1 >= :limit THEN :now ELSE disabled_at END,
                   disabled_reason = CASE WHEN enabled AND consecutive_failures + 1 >= :limit THEN :reason ELSE disabled_reason END
               WHERE id = :id RETURNING enabled'''
)


DROP_PENDING_OUTGOING_WEBHOOK_DELIVERIES = text(
    '''UPDATE outgoing_webhook_deliveries SET failed_at = :now, last_error = 'Webhook turned off before delivery.'
               WHERE webhook_id = :id AND delivered_at IS NULL AND failed_at IS NULL'''
)


PRUNE_OUTGOING_WEBHOOK_DELIVERIES = text(
    '''DELETE FROM outgoing_webhook_deliveries
               WHERE created_at < :cutoff AND (delivered_at IS NOT NULL OR failed_at IS NOT NULL)'''
)
