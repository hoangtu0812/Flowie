"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

STORE_ATTACHMENT_INSERT_ATTACHMENTS = text('''INSERT INTO attachments (id, workspace_id, uploaded_by, entity_type, entity_id, object_key, filename, mime_type, size, created_at) VALUES (:id, :workspace_id, :uploaded_by, :entity_type, :entity_id, :object_key, :filename, :mime_type, :size, :now)''')
