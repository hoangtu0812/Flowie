"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

AUDIT_INSERT_AUDIT_LOGS = text(
    '''INSERT INTO audit_logs (
                   id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at
               ) VALUES (
                   :id, :workspace_id, :actor_id, :action, 'scm-connection', :entity_id,
                   CAST(:metadata AS jsonb), :now
               )'''
)


DELETE_IDENTITY_DELETE_SCM_USER_IDENTITIES = text(
    '''DELETE FROM scm_user_identities
               WHERE connection_id = :connection_id AND user_id = :user_id RETURNING id'''
)


DELETE_IDENTITY_UPDATE_CODE_REVIEW_REVIEWERS = text(
    '''UPDATE code_review_reviewers reviewer
               SET flowie_user_id = NULL, updated_at = :now
               FROM code_reviews review
               JOIN scm_repositories repository ON repository.id = review.repository_id
               WHERE reviewer.code_review_id = review.id
                 AND repository.connection_id = :connection_id
                 AND reviewer.flowie_user_id = :user_id'''
)


ROTATE_CONNECTION_CREDENTIALS_UPDATE_SCM_CONNECTION_SECRETS = text(
    '''UPDATE scm_connection_secrets
               SET encrypted_value = :encrypted_value, key_version = key_version + 1, updated_at = :now
               WHERE connection_id = :connection_id'''
)


REACTIVATE_CONNECTION_UPDATE_SCM_CONNECTIONS = text(
    '''UPDATE scm_connections
               SET status = 'ACTIVE', last_error = NULL, updated_at = :now WHERE id = :id'''
)


UPDATE_REPOSITORY_UPDATE_SCM_REPOSITORIES = text(
    '''UPDATE scm_repositories SET enabled = :enabled, team_id = :team_id, updated_at = :now
               WHERE id = :id'''
)


DISCONNECT_UPDATE_SCM_CONNECTIONS = text("UPDATE scm_connections SET status = 'REVOKED', updated_at = :now WHERE id = :id")


DISCONNECT_UPDATE_SCM_REPOSITORIES = text('UPDATE scm_repositories SET enabled = false, updated_at = :now WHERE connection_id = :id')


SAVE_DELIVERY_INSERT_SCM_WEBHOOK_DELIVERIES = text(
    '''INSERT INTO scm_webhook_deliveries (
                   id, connection_id, external_delivery_id, event_type, action, status, payload,
                   payload_hash, attempts, next_attempt_at, received_at
               ) VALUES (
                   :id, :connection_id, :external_delivery_id, :event_type, :action,
                   CAST(:status AS "ScmDeliveryStatus"), CAST(:payload AS jsonb), :payload_hash,
                   0, :now, :now
               ) ON CONFLICT (connection_id, external_delivery_id) DO NOTHING
               RETURNING id'''
)


CREATE_CONNECTION_INSERT_SCM_CONNECTIONS = text(
    '''INSERT INTO scm_connections (
                       id, workspace_id, provider, external_account_id, display_name, status,
                       auth_mode, settings, created_by_id, created_at, updated_at
                   ) VALUES (
                       :id, :workspace_id, CAST(:provider AS "ScmProvider"), :external_account_id,
                       :display_name, 'ACTIVE', CAST(:auth_mode AS "ScmAuthMode"), CAST(:settings AS jsonb),
                       :created_by_id, :now, :now
                   )'''
)


SAVE_IDENTITY_INSERT_SCM_USER_IDENTITIES = text(
    '''INSERT INTO scm_user_identities (
                       id, workspace_id, connection_id, user_id, external_user_id,
                       display_name, email, created_at, updated_at
                   ) VALUES (
                       :id, :workspace_id, :connection_id, :user_id, :external_user_id,
                       :display_name, :email, :now, :now
                   ) ON CONFLICT (connection_id, user_id) DO UPDATE SET
                       external_user_id = EXCLUDED.external_user_id,
                       display_name = EXCLUDED.display_name, email = EXCLUDED.email,
                       updated_at = EXCLUDED.updated_at
                   RETURNING id, user_id, external_user_id, display_name, email, updated_at'''
)


SAVE_IDENTITY_UPDATE_CODE_REVIEW_REVIEWERS = text(
    '''UPDATE code_review_reviewers reviewer
                   SET flowie_user_id = NULL, updated_at = :now
                   FROM code_reviews review
                   JOIN scm_repositories repository ON repository.id = review.repository_id
                   WHERE reviewer.code_review_id = review.id
                     AND repository.connection_id = :connection_id
                     AND reviewer.flowie_user_id = :user_id'''
)


SAVE_IDENTITY_UPDATE_CODE_REVIEW_REVIEWERS_2 = text(
    '''UPDATE code_review_reviewers reviewer
                   SET flowie_user_id = :user_id, updated_at = :now
                   FROM code_reviews review
                   JOIN scm_repositories repository ON repository.id = review.repository_id
                   WHERE reviewer.code_review_id = review.id
                     AND repository.connection_id = :connection_id
                     AND reviewer.external_user_id = :external_user_id'''
)


CREATE_CONNECTION_INSERT_SCM_CONNECTION_SECRETS = text(
    '''INSERT INTO scm_connection_secrets (
                           id, connection_id, encrypted_value, key_version, created_at, updated_at
                       ) VALUES (:id, :connection_id, :encrypted_value, 1, :now, :now)'''
)


UPSERT_REPOSITORY_INSERT_SCM_REPOSITORIES = text(
    '''INSERT INTO scm_repositories (
                   id, workspace_id, connection_id, external_project_id, external_repository_id,
                   name, full_name, is_private, default_branch, created_at, updated_at
               ) VALUES (
                   :id, :workspace_id, :connection_id, :external_project_id, :external_repository_id,
                   :name, :full_name, :is_private, :default_branch, :now, :now
               ) ON CONFLICT (connection_id, external_repository_id) DO UPDATE SET
                   external_project_id = EXCLUDED.external_project_id,
                   name = EXCLUDED.name, full_name = EXCLUDED.full_name,
                   is_private = EXCLUDED.is_private, default_branch = EXCLUDED.default_branch,
                   archived_at = NULL, updated_at = EXCLUDED.updated_at
               RETURNING id'''
)


UPSERT_REVIEW_INSERT_CODE_REVIEWS = text(
    '''INSERT INTO code_reviews (
                   id, workspace_id, repository_id, external_review_id, number, title, description,
                   state, is_draft, external_author_id, author_name, source_ref, target_ref,
                   head_revision, latest_revision_key, remote_url, additions, deletions, changed_files,
                   external_created_at, external_updated_at, merged_at, closed_at, created_at, updated_at
               ) VALUES (
                   :id, :workspace_id, :repository_id, :external_review_id, :number, :title, :description,
                   CAST(:state AS "CodeReviewState"), :is_draft, :external_author_id, :author_name,
                   :source_ref, :target_ref, :head_revision, :latest_revision_key, :remote_url,
                   :additions, :deletions, :changed_files, :external_created_at, :external_updated_at,
                   :merged_at, :closed_at, :now, :now
               ) ON CONFLICT (repository_id, external_review_id) DO UPDATE SET
                   number = EXCLUDED.number, title = EXCLUDED.title, description = EXCLUDED.description,
                   state = EXCLUDED.state, is_draft = EXCLUDED.is_draft,
                   external_author_id = EXCLUDED.external_author_id, author_name = EXCLUDED.author_name,
                   source_ref = EXCLUDED.source_ref, target_ref = EXCLUDED.target_ref,
                   head_revision = EXCLUDED.head_revision, latest_revision_key = EXCLUDED.latest_revision_key,
                   remote_url = EXCLUDED.remote_url, additions = EXCLUDED.additions,
                   deletions = EXCLUDED.deletions, changed_files = EXCLUDED.changed_files,
                   external_created_at = EXCLUDED.external_created_at,
                   external_updated_at = EXCLUDED.external_updated_at,
                   merged_at = EXCLUDED.merged_at, closed_at = EXCLUDED.closed_at,
                   updated_at = EXCLUDED.updated_at
               RETURNING id'''
)


LINK_DETECTED_ISSUES_INSERT_CODE_REVIEW_ISSUE_LINKS = text(
    '''INSERT INTO code_review_issue_links (
                   workspace_id, code_review_id, issue_id, source, created_by_id, created_at
               )
               SELECT issue.workspace_id, :review_id, issue.id, 'DETECTED',
                      connection.created_by_id, :now
               FROM scm_repositories repository
               JOIN scm_connections connection ON connection.id = repository.connection_id
               JOIN issues issue ON issue.workspace_id = repository.workspace_id
                                AND issue.team_id = repository.team_id
               WHERE repository.id = :repository_id
                 AND issue.archived_at IS NULL
                 AND upper(issue.identifier) = ANY(:keys)
               ON CONFLICT (code_review_id, issue_id) DO NOTHING'''
)


UPSERT_REVIEW_INSERT_CODE_REVIEW_REVIEWERS = text(
    '''INSERT INTO code_review_reviewers (
                       id, code_review_id, flowie_user_id, external_user_id, display_name,
                       reviewer_kind, is_required, decision, provider_decision, updated_at
                   ) VALUES (
                       :id, :code_review_id, :flowie_user_id, :external_user_id, :display_name,
                       :reviewer_kind, :is_required, CAST(:decision AS "CodeReviewDecision"),
                       :provider_decision, :now
                   ) ON CONFLICT (code_review_id, external_user_id) DO UPDATE SET
                       flowie_user_id = EXCLUDED.flowie_user_id, display_name = EXCLUDED.display_name,
                       reviewer_kind = EXCLUDED.reviewer_kind, is_required = EXCLUDED.is_required,
                       decision = EXCLUDED.decision, provider_decision = EXCLUDED.provider_decision,
                       updated_at = EXCLUDED.updated_at'''
)


UPSERT_REVIEW_DELETE_CODE_REVIEW_REVIEWERS = text(
    '''DELETE FROM code_review_reviewers
                   WHERE code_review_id = :code_review_id
                     AND NOT (external_user_id = ANY(:reviewer_ids))'''
)


UPSERT_REVIEW_DELETE_CODE_REVIEW_REVIEWERS_2 = text('DELETE FROM code_review_reviewers WHERE code_review_id = :code_review_id')


UPSERT_REVIEW_INSERT_CODE_REVIEW_REVISIONS = text(
    '''INSERT INTO code_review_revisions (
                       id, code_review_id, external_revision_id, sequence, base_revision,
                       head_revision, external_created_at, created_at
                   ) VALUES (
                       :id, :code_review_id, :external_revision_id, :sequence, :base_revision,
                       :head_revision, :external_created_at, :now
                   ) ON CONFLICT (code_review_id, external_revision_id) DO UPDATE SET
                       sequence = EXCLUDED.sequence, base_revision = EXCLUDED.base_revision,
                       head_revision = EXCLUDED.head_revision,
                       external_created_at = EXCLUDED.external_created_at'''
)


CONNECTION_SYNC_LOCK_LOCK = text('SELECT pg_try_advisory_xact_lock(hashtextextended(:key,0))')


SYNC_CONNECTION_UPDATE_SCM_CONNECTIONS = text(
    '''UPDATE scm_connections
                   SET last_synced_at = :now, last_error = NULL, status = 'ACTIVE', updated_at = :now
                   WHERE id = :id'''
)


SYNC_CONNECTION_UPDATE_SCM_CONNECTIONS_2 = text(
    '''UPDATE scm_connections SET status = 'ERROR', last_error = :error, updated_at = :now
                   WHERE id = :id'''
)


SYNC_DELIVERY_REVIEW_INSERT_NOTIFICATIONS = text(
    '''INSERT INTO notifications (
                           id, workspace_id, user_id, type, entity_type, entity_id, data, created_at
                       ) VALUES (
                           :id, :workspace_id, :user_id, :type, 'review', :review_id,
                           CAST(:data AS jsonb), :now
                       )'''
)


SYNC_CONNECTION_UPDATE_SCM_REPOSITORIES = text(
    '''UPDATE scm_repositories SET archived_at = :now, enabled = false, updated_at = :now
                           WHERE id = :id'''
)
