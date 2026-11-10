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
