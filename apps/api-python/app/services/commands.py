"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

CREATE_NOTIFICATION_BATCH_INSERT_NOTIFICATIONS = text(
    '''INSERT INTO notifications
                   (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                   VALUES (:id, :workspace_id, :user_id, :type, :entity_type, :entity_id,
                           CAST(:data AS jsonb), :created_at)'''
)
