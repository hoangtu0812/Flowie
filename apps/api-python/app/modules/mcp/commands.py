"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

MUTATE_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


MUTATE_LOCK_2 = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


MUTATE_LOCK_3 = text("SELECT set_config('flowie.mcp_write','true',true)")


MUTATE_INSERT_MCP_REQUESTS = text("""INSERT INTO mcp_requests (connection_id,tool,key,request_hash,result)
            VALUES (:connection,:tool,:key,:hash,CAST(:result AS jsonb))""")


AUDIT_INSERT_AUDIT_LOGS = text("""INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
            VALUES (:id,:workspace,:actor,:action,'mcp-tool',:entity,CAST(:metadata AS jsonb),:now)""")


ADD_LINK_INSERT_DOCUMENT_LINKS = text("""INSERT INTO document_links (id,document_id,workspace_id,project_id,issue_id)
            VALUES (:id,:document,:workspace,:project,:issue) ON CONFLICT DO NOTHING""")


AUTHENTICATE_UPDATE_MCP_CONNECTIONS = text("UPDATE mcp_connections SET last_used_at=:now WHERE id=:id")


CREATE_INSERT_MCP_CONNECTIONS = text("""
        INSERT INTO mcp_connections (id,workspace_id,user_id,name,prefix,token_hash,scopes,team_ids,project_ids,expires_at,created_at)
        VALUES (:id,:workspace,:user,:name,:prefix,:hash,:scopes,:teams,:projects,:expires,:now) RETURNING *
    """)


CREATE_INSERT_AUDIT_LOGS = text("""INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:user,'mcp.connection.created','mcp-connection',:connection,'{}'::jsonb,:now)""")


UPDATE_INSERT_AUDIT_LOGS = text("""INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:user,'mcp.connection.updated','mcp-connection',:connection,CAST(:metadata AS jsonb),:now)""")


REVOKE_UPDATE_MCP_CONNECTIONS = text("""UPDATE mcp_connections SET revoked_at=:now
        WHERE id=:id AND workspace_id=:workspace AND (:manager OR user_id=:user) RETURNING id""")


REVOKE_INSERT_AUDIT_LOGS = text("""INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:user,'mcp.connection.revoked','mcp-connection',:connection,'{}'::jsonb,:now)""")


UPDATE_UPDATE_MCP_CONNECTIONS = text("""UPDATE mcp_connections SET name=:name,scopes=:scopes,team_ids=:teams,
        project_ids=:projects WHERE id=:id RETURNING *""")


UPSERT_FEATURE_DOC_INSERT_DOCUMENT_LINKS = text(
    """INSERT INTO document_links (id,document_id,workspace_id,project_id,issue_id)
            VALUES (:id,:document,:workspace,NULL,:issue) ON CONFLICT DO NOTHING"""
)


SAVE_UPDATE_WORKSPACES = text("UPDATE workspaces SET mcp_instructions=:value WHERE id=:id")


CLEANUP_DELETE_MCP_REQUESTS = text("""DELETE FROM mcp_requests WHERE ctid IN (
            SELECT r.ctid FROM mcp_requests r JOIN mcp_connections c ON c.id=r.connection_id
            WHERE c.expires_at<:cutoff OR c.revoked_at<:cutoff LIMIT 1000)""")


CLEANUP_DELETE_NOTIFICATION_OUTBOX = text("""DELETE FROM notification_outbox WHERE id IN (
            SELECT id FROM notification_outbox WHERE delivered_at<:cutoff ORDER BY delivered_at LIMIT 1000)""")


CLEANUP_DELETE_AI_TOOL_WINDOWS = text(
    "DELETE FROM ai_tool_windows WHERE ctid IN (SELECT ctid FROM ai_tool_windows WHERE window_start<:cutoff LIMIT 1000)"
)


CLEANUP_UPDATE_BULK_OPERATIONS = text("UPDATE bulk_operations SET state='EXPIRED' WHERE id IN (SELECT id FROM bulk_operations WHERE state='PREVIEW' AND expires_at<:now LIMIT 1000)")


CLEANUP_DELETE_BULK_OPERATIONS = text("DELETE FROM bulk_operations WHERE id IN (SELECT id FROM bulk_operations WHERE state IN ('DONE','CANCELLED','FAILED','EXPIRED') AND created_at<:cutoff ORDER BY created_at LIMIT 1000)")


CLEANUP_DELETE_ACCOUNT_SECURITY_EVENTS = text('DELETE FROM account_security_events WHERE id IN (SELECT id FROM account_security_events WHERE created_at<:cutoff ORDER BY created_at LIMIT 1000)')


CLEANUP_DELETE_SESSIONS = text('DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE revoked_at<:cutoff OR expires_at<:cutoff ORDER BY created_at LIMIT 1000)')


CLEANUP_DELETE_MFA_CHALLENGES = text('DELETE FROM mfa_challenges WHERE id IN (SELECT id FROM mfa_challenges WHERE expires_at<:cutoff ORDER BY expires_at LIMIT 1000)')


CLEANUP_DELETE_ACCOUNT_MFA = text('DELETE FROM account_mfa WHERE user_id IN (SELECT user_id FROM account_mfa WHERE enabled_at IS NULL AND pending_until<:cutoff LIMIT 1000)')


def cleanup_delete_sql(table, clock) -> TextClause:
    return text(f'DELETE FROM {table} WHERE id IN (SELECT id FROM {table} WHERE {clock}<:cutoff ORDER BY {clock} LIMIT 1000)')


UPDATE_LIMITS_INSERT_AI_WORKSPACE_LIMITS = text("""INSERT INTO ai_workspace_limits(workspace_id,total_per_minute,per_tool,updated_at) VALUES (:workspace,:total,CAST(:tool AS jsonb),:now)
        ON CONFLICT(workspace_id) DO UPDATE SET total_per_minute=:total,per_tool=CAST(:tool AS jsonb),updated_at=:now""")


CONSUME_QUOTA_INSERT_AI_TOOL_WINDOWS = text("""INSERT INTO ai_tool_windows(workspace_id,tool,window_start,used) VALUES (:workspace,:tool,:window,1)
                ON CONFLICT(workspace_id,tool,window_start) DO UPDATE SET used=ai_tool_windows.used+1 WHERE ai_tool_windows.used<:maximum RETURNING used""")


CALL_UPDATE_MCP_CONNECTIONS = text("""UPDATE mcp_connections SET
                    rate_count=CASE WHEN rate_window=date_trunc('minute',CAST(:now AS timestamp)) THEN rate_count+1 ELSE 1 END,
                    rate_window=date_trunc('minute',CAST(:now AS timestamp)) WHERE id=:id RETURNING rate_count""")


UPLOAD_ATTACHMENT_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


UPLOAD_ATTACHMENT_INSERT_MCP_REQUESTS = text("""INSERT INTO mcp_requests (connection_id,tool,key,request_hash,result)
            VALUES (:connection,:tool,:key,:hash,CAST(:result AS jsonb))""")
