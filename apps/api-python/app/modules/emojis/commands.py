"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

AUDIT_INSERT_AUDIT_LOGS = text(
    '''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :workspace_id, :actor_id, :action, 'workspace-emoji', :entity_id,
                       CAST(:metadata AS jsonb), :created_at)'''
)


ARCHIVE_EMOJI_UPDATE_WORKSPACE_EMOJIS = text('UPDATE workspace_emojis SET archived_at = :now, updated_at = :now WHERE id = :emoji_id')


UPLOAD_EMOJI_UPDATE_WORKSPACE_EMOJIS = text(
    '''UPDATE workspace_emojis
                       SET object_key = :object_key, filename = :filename, mime_type = :mime_type,
                           size = :size, created_by = :created_by, archived_at = NULL, updated_at = :now
                       WHERE id = :id'''
)


UPLOAD_EMOJI_INSERT_WORKSPACE_EMOJIS = text(
    '''INSERT INTO workspace_emojis
                       (id, workspace_id, name, object_key, filename, mime_type, size, created_by, created_at, updated_at)
                       VALUES (:id, :workspace_id, :name, :object_key, :filename, :mime_type, :size,
                               :created_by, :now, :now)'''
)
