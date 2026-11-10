"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

TEAM_RECIPIENT_IDS_SELECT_TEAM_MEMBERS = text('SELECT user_id FROM team_members WHERE team_id = :team_id')


ISSUE_RECIPIENT_IDS_SELECT_ISSUE_SUBSCRIPTIONS = text('SELECT user_id FROM issue_subscriptions WHERE issue_id = :issue_id')


PROJECT_RECIPIENT_IDS_SELECT_PROJECT_MEMBERS = text(
    '''SELECT user_id FROM project_members WHERE project_id = :project_id
               UNION SELECT user_id FROM project_subscriptions WHERE project_id = :project_id'''
)


DISCORD_WEBHOOK_SELECT_DISCORD_WEBHOOKS = text(
    '''SELECT webhook_url FROM discord_webhooks
               WHERE workspace_id = :workspace_id AND enabled = TRUE LIMIT 1'''
)


TEAMS_WEBHOOKS_SELECT_TEAMS_WEBHOOKS = text(
    '''SELECT webhook_url FROM teams_webhooks
               WHERE workspace_id = :workspace_id AND enabled = TRUE
               UNION
               SELECT c.webhook_url FROM project_teams_channels c
               JOIN projects p ON p.id = c.project_id
               WHERE p.workspace_id = :workspace_id AND c.enabled = TRUE
                 AND p.id IN (
                     SELECT CAST(:entity_id AS text) WHERE CAST(:entity_type AS text) = 'project'
                     UNION SELECT project_id FROM issues
                     WHERE id = :entity_id AND CAST(:entity_type AS text) = 'issue')'''
)


PROJECT_TEAMS_BATCH_SELECT_PROJECT_TEAMS_CHANNELS = text(
    '''SELECT c.webhook_url, p.name FROM project_teams_channels c JOIN projects p ON p.id = c.project_id
               WHERE c.project_id = :project_id AND p.workspace_id = :workspace_id AND c.enabled = TRUE'''
)


WORKSPACE_ROUTE_ID_SELECT_WORKSPACES = text('SELECT id FROM workspaces WHERE id = :workspace_id')


TEAMS_MENTION_CARD_SELECT_PROJECT_TEAMS_CHANNELS = text(
    '''SELECT webhook_url FROM (
                       SELECT c.webhook_url, 0 AS rank FROM project_teams_channels c
                       JOIN issues i ON i.project_id = c.project_id
                       WHERE i.id = :issue_id AND c.enabled = TRUE
                       UNION ALL
                       SELECT webhook_url, 1 FROM teams_webhooks
                       WHERE workspace_id = :workspace_id AND enabled = TRUE) channel
                   ORDER BY rank LIMIT 1'''
)


TEAMS_MENTION_CARD_SELECT_USERS = text(
    '''SELECT DISTINCT ON (u.id) split_part(identity.provider_account_id, ':', 2) AS id, u.name
                   FROM users u JOIN user_identities identity
                     ON identity.user_id = u.id AND identity.provider = 'MICROSOFT'
                   WHERE u.id = ANY(CAST(:users AS text[]))
                     AND NOT EXISTS(SELECT 1 FROM notification_preferences preference
                         WHERE preference.workspace_id = :workspace_id AND preference.user_id = u.id
                           AND NOT preference.teams_enabled)
                   ORDER BY u.id, identity.updated_at DESC'''
)
