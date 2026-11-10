"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def accessible_review_select_code_reviews_sql(ACCESS_JOIN, ACCESS_WHERE) -> TextClause:
    return text(
        f'''SELECT review.*, repository.connection_id, repository.team_id,
                       repository.full_name AS repository_name, repository.external_project_id,
                       repository.external_repository_id, repository.name AS repository_short_name,
                       repository.is_private, repository.default_branch,
                       connection.provider, connection.display_name AS connection_name
                FROM code_reviews review
                JOIN scm_repositories repository ON repository.id = review.repository_id
                JOIN scm_connections connection ON connection.id = repository.connection_id
                {ACCESS_JOIN}
                WHERE review.id = :review_id AND review.workspace_id = :workspace_id
                  AND repository.enabled = true AND repository.archived_at IS NULL
                  AND {ACCESS_WHERE}'''
    )


REVIEW_RELATIONS_SELECT_CODE_REVIEW_REVIEWERS = text(
    '''SELECT code_review_id, external_user_id, display_name, reviewer_kind,
                      is_required, decision, provider_decision, flowie_user_id
               FROM code_review_reviewers
               WHERE code_review_id = ANY(:review_ids)
               ORDER BY is_required DESC, display_name ASC'''
)


REVIEW_RELATIONS_SELECT_CODE_REVIEW_ISSUE_LINKS = text(
    '''SELECT link.code_review_id, link.issue_id, link.source, link.created_at,
                      issue.identifier, issue.title
               FROM code_review_issue_links link
               JOIN issues issue ON issue.id = link.issue_id
               WHERE link.code_review_id = ANY(:review_ids)
               ORDER BY link.created_at ASC'''
)


def list_reviews_select_sql(select) -> TextClause:
    return text(f'SELECT COUNT(DISTINCT review.id) {select}')


def list_reviews_select_code_review_reviewers_sql(select) -> TextClause:
    return text(
        f'''SELECT DISTINCT review.*, repository.connection_id,
                       repository.full_name AS repository_name,
                       connection.provider, connection.display_name AS connection_name,
                       view_state.last_viewed_revision,
                       EXISTS (
                           SELECT 1 FROM code_review_reviewers mine
                           WHERE mine.code_review_id = review.id AND mine.flowie_user_id = :user_id
                       ) AS assigned_to_me,
                       EXISTS (
                           SELECT 1 FROM scm_user_identities identity
                           WHERE identity.connection_id = repository.connection_id
                             AND identity.user_id = :user_id
                             AND identity.external_user_id = review.external_author_id
                       ) AS created_by_me
                {select}
                ORDER BY review.external_updated_at DESC, review.id DESC
                LIMIT :limit OFFSET :offset'''
    )


GET_REVIEW_SELECT_CODE_REVIEW_VIEW_STATES = text(
    '''SELECT last_viewed_revision FROM code_review_view_states
               WHERE code_review_id = :review_id AND user_id = :user_id'''
)


GET_REVIEW_SELECT_CODE_REVIEW_REVIEWERS = text(
    '''SELECT EXISTS (
                       SELECT 1 FROM code_review_reviewers
                       WHERE code_review_id = :review_id AND flowie_user_id = :user_id
                   ) AS assigned_to_me,
                   EXISTS (
                       SELECT 1 FROM scm_user_identities
                       WHERE connection_id = :connection_id AND user_id = :user_id
                         AND external_user_id = :external_author_id
                   ) AS created_by_me'''
)


GET_REVIEW_SELECT_CODE_REVIEW_REVISIONS = text(
    '''SELECT external_revision_id, sequence, base_revision, head_revision, external_created_at
               FROM code_review_revisions WHERE code_review_id = :review_id
               ORDER BY sequence NULLS LAST, created_at ASC'''
)


def link_issue_select_issues_sql(issue_filter) -> TextClause:
    return text(
        f'''SELECT id, identifier, title, team_id FROM issues
                WHERE {issue_filter} AND workspace_id = :workspace_id AND archived_at IS NULL'''
    )
