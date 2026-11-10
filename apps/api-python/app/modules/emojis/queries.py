"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

EMOJI_SELECT_WORKSPACE_EMOJIS = text(
    '''SELECT emoji.id, emoji.workspace_id, emoji.name, emoji.object_key, emoji.filename,
                      emoji.mime_type, emoji.size, emoji.created_by, emoji.archived_at,
                      emoji.created_at, emoji.updated_at,
                      creator.id AS creator_id, creator.name AS creator_name,
                      creator.avatar_url AS creator_avatar_url
               FROM workspace_emojis emoji
               JOIN users creator ON creator.id = emoji.created_by
               WHERE emoji.id = :emoji_id AND emoji.workspace_id = :workspace_id
                 AND (:include_archived OR emoji.archived_at IS NULL)'''
)


LIST_EMOJIS_SELECT_WORKSPACE_EMOJIS = text(
    '''SELECT id FROM workspace_emojis
               WHERE workspace_id = :workspace_id AND archived_at IS NULL
               ORDER BY name ASC'''
)


UPLOAD_EMOJI_SELECT_WORKSPACE_EMOJIS = text('SELECT id FROM workspace_emojis WHERE workspace_id = :workspace_id AND name = :name')
