"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

LIST_CONNECTIONS_SELECT_SCM_CONNECTIONS = text(
    '''SELECT connection.*, secret.encrypted_value,
                      COUNT(repository.id) AS repository_count,
                      COUNT(repository.id) FILTER (WHERE repository.enabled = true) AS enabled_repository_count
               FROM scm_connections connection
               LEFT JOIN scm_connection_secrets secret ON secret.connection_id = connection.id
               LEFT JOIN scm_repositories repository
                 ON repository.connection_id = connection.id AND repository.archived_at IS NULL
               WHERE connection.workspace_id = :workspace_id
               GROUP BY connection.id, secret.encrypted_value
               ORDER BY connection.created_at ASC'''
)


def list_repositories_select_scm_repositories_sql(connection_clause) -> TextClause:
    return text(
        f'''SELECT repository.*, connection.provider, connection.display_name AS connection_name,
                       team.name AS team_name
                FROM scm_repositories repository
                JOIN scm_connections connection ON connection.id = repository.connection_id
                LEFT JOIN teams team ON team.id = repository.team_id
                WHERE repository.workspace_id = :workspace_id AND repository.archived_at IS NULL
                  {connection_clause}
                ORDER BY connection.provider, repository.full_name'''
    )


LIST_IDENTITIES_SELECT_SCM_USER_IDENTITIES = text(
    '''SELECT identity.*, account.name AS flowie_name, account.email AS flowie_email
               FROM scm_user_identities identity
               JOIN users account ON account.id = identity.user_id
               WHERE identity.connection_id = :connection_id
               ORDER BY account.name, account.email'''
)


SAVE_IDENTITY_SELECT_WORKSPACE_MEMBERS = text(
    '''SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE' '''
)


UPDATE_REPOSITORY_SELECT_SCM_REPOSITORIES = text(
    '''SELECT repository.id, repository.connection_id, repository.full_name, repository.team_id
               FROM scm_repositories repository
               JOIN scm_connections connection ON connection.id = repository.connection_id
               WHERE repository.id = :id AND repository.workspace_id = :workspace_id
                 AND repository.archived_at IS NULL AND connection.status = 'ACTIVE' '''
)


GITHUB_APP_WEBHOOK_SELECT_SCM_CONNECTIONS = text(
    '''SELECT connection.*, secret.encrypted_value
               FROM scm_connections connection
               LEFT JOIN scm_connection_secrets secret ON secret.connection_id = connection.id
               WHERE connection.provider = 'GITHUB' AND connection.status = 'ACTIVE'
                 AND connection.external_account_id = :installation_id'''
)


UPDATE_REPOSITORY_SELECT_TEAMS = text(
    '''SELECT 1 FROM teams WHERE id = :team_id AND workspace_id = :workspace_id
                   AND deleted_at IS NULL AND archived_at IS NULL'''
)


def connection_row_select_scm_connections_sql(workspace_clause) -> TextClause:
    return text(
        f'''SELECT connection.*, secret.encrypted_value
                FROM scm_connections connection
                LEFT JOIN scm_connection_secrets secret ON secret.connection_id = connection.id
                WHERE connection.id = :connection_id {workspace_clause}'''
    )


SYNC_DELIVERY_REVIEW_SELECT_SCM_REPOSITORIES = text(
    '''SELECT * FROM scm_repositories
               WHERE connection_id = :connection_id AND external_repository_id = :external_repository_id
                 AND enabled = true AND archived_at IS NULL'''
)


SYNC_DELIVERY_REVIEW_SELECT_CODE_REVIEWS = text(
    '''SELECT id, latest_revision_key FROM code_reviews
               WHERE repository_id = :repository_id AND external_review_id = :external_review_id'''
)


SYNC_DELIVERY_REVIEW_SELECT_CODE_REVIEW_REVIEWERS = text(
    '''SELECT flowie_user_id FROM code_review_reviewers
               WHERE code_review_id = :review_id AND flowie_user_id IS NOT NULL'''
)


UPSERT_REVIEW_SELECT_SCM_USER_IDENTITIES = text(
    '''SELECT user_id FROM scm_user_identities
                   WHERE connection_id = :connection_id AND external_user_id = :external_user_id'''
)


SYNC_CONNECTION_SELECT_SCM_REPOSITORIES = text('SELECT id, external_repository_id FROM scm_repositories WHERE connection_id = :connection_id')


SYNC_CONNECTION_SELECT_SCM_REPOSITORIES_2 = text(
    '''SELECT * FROM scm_repositories
                   WHERE connection_id = :connection_id AND enabled = true AND archived_at IS NULL'''
)


SYNC_DELIVERY_REVIEW_SELECT_CODE_REVIEW_REVIEWERS_2 = text(
    '''SELECT flowie_user_id FROM code_review_reviewers
                   WHERE code_review_id = :review_id AND flowie_user_id IS NOT NULL'''
)
