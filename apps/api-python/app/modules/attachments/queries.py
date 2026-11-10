"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

LIST_ATTACHMENTS_SELECT_ATTACHMENTS = text('SELECT a.*, pub.web_url AS sp_web_url, pub.path AS sp_path, pub.last_error AS sp_last_error FROM attachments a LEFT JOIN attachment_publications pub ON pub.attachment_id = a.id WHERE a.workspace_id = :workspace_id AND a.entity_type = :entity_type AND a.entity_id = :entity_id ORDER BY a.created_at DESC')


STORE_ATTACHMENT_SELECT_ATTACHMENTS = text('SELECT * FROM attachments WHERE id = :id')


DOWNLOAD_ATTACHMENT_SELECT_ATTACHMENTS = text('SELECT * FROM attachments WHERE id = :attachment_id')


PREVIEW_ATTACHMENT_SELECT_ATTACHMENTS = text('SELECT * FROM attachments WHERE id = :attachment_id')


AUTHORIZE_ENTITY_SELECT_COMMENTS = text('SELECT author_id FROM comments WHERE id=:id')


GET_ATTACHMENT_SELECT_ATTACHMENTS = text('SELECT a.*, u.name AS uploader_name FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.id = :attachment_id')


# Team of an attachment's parent entity, by entity type.
# VI: Team của thực thể cha của attachment, theo loại thực thể.
ENTITY_TEAM_ID_SELECT = {
    'issue': text('SELECT team_id FROM issues WHERE id = :entity_id AND workspace_id = :workspace_id AND archived_at IS NULL'),
    'comment': text('SELECT i.team_id FROM comments c JOIN issues i ON i.id = c.issue_id WHERE c.id = :entity_id AND i.workspace_id = :workspace_id AND c.deleted_at IS NULL AND i.archived_at IS NULL'),
    'project': text('SELECT team_id FROM projects WHERE id = :entity_id AND workspace_id = :workspace_id AND archived_at IS NULL'),
    'project-update': text('SELECT p.team_id FROM project_updates pu JOIN projects p ON p.id = pu.project_id WHERE pu.id = :entity_id AND pu.workspace_id = :workspace_id AND p.archived_at IS NULL'),
    'document': text('SELECT team_id FROM documents WHERE id = :entity_id AND workspace_id = :workspace_id AND archived_at IS NULL'),
    'document-folder': text('SELECT team_id FROM document_folders WHERE id = :entity_id AND workspace_id = :workspace_id'),
}
