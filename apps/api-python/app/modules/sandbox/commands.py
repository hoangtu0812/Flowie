from sqlalchemy import text

NOTIFY_INSERT_NOTIFICATIONS = text(
    """INSERT INTO notifications (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
       VALUES (:id, :workspace_id, :user_id, :type, 'sandbox', :entity_id, CAST(:data AS jsonb), :now)"""
)
