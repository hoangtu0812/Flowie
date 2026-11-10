"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

MARK_REVIEW_VIEWED_INSERT_CODE_REVIEW_VIEW_STATES = text(
    '''INSERT INTO code_review_view_states (
                   code_review_id, user_id, last_viewed_revision, updated_at
               ) VALUES (
                   :review_id, :user_id, :revision, :now
               ) ON CONFLICT (code_review_id, user_id) DO UPDATE SET
                   last_viewed_revision = EXCLUDED.last_viewed_revision,
                   updated_at = EXCLUDED.updated_at'''
)


AUDIT_LINK_INSERT_AUDIT_LOGS = text(
    '''INSERT INTO audit_logs (
                   id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at
               ) VALUES (
                   :id, :workspace_id, :actor_id, :action, 'review', :review_id,
                   CAST(:metadata AS jsonb), :now
               )'''
)


UNLINK_ISSUE_DELETE_CODE_REVIEW_ISSUE_LINKS = text(
    '''DELETE FROM code_review_issue_links
               WHERE workspace_id = :workspace_id AND code_review_id = :review_id AND issue_id = :issue_id
               RETURNING issue_id'''
)


LINK_ISSUE_INSERT_CODE_REVIEW_ISSUE_LINKS = text(
    '''INSERT INTO code_review_issue_links (
                       workspace_id, code_review_id, issue_id, source, created_by_id, created_at
                   ) VALUES (
                       :workspace_id, :review_id, :issue_id, 'MANUAL', :created_by_id, :now
                   )'''
)
