from sqlalchemy import text

NOTIFY_INSERT_NOTIFICATIONS = text(
    """INSERT INTO notifications (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
       VALUES (:id, :workspace_id, :user_id, :type, 'sandbox', :entity_id, CAST(:data AS jsonb), :now)"""
)

# The person's earlier sandbox connections in the workspace, replaced by a new one.
# VI: Các kết nối sandbox trước đó của người đó trong workspace, được thay bằng kết nối mới.
MCP_REVOKE_UPDATE_MCP_CONNECTIONS = text(
    """UPDATE mcp_connections SET revoked_at = :now
       WHERE user_id = :user AND workspace_id = :workspace AND name = :name AND revoked_at IS NULL
       RETURNING id"""
)
