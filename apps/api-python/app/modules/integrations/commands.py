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
