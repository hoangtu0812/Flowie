"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

REVOKE_CREDENTIAL_UPDATE_MCP_CONNECTIONS = text(
    "UPDATE mcp_connections SET revoked_at=:now WHERE id=:id AND user_id=:user AND revoked_at IS NULL RETURNING workspace_id"
)


REVOKE_CREDENTIAL_UPDATE_PERSONAL_API_KEYS = text(
    "UPDATE personal_api_keys SET revoked_at=:now WHERE id=:id AND user_id=:user AND revoked_at IS NULL RETURNING id"
)


RECORD_EVENT_INSERT_ACCOUNT_SECURITY_EVENTS = text(
    "INSERT INTO account_security_events(id,user_id,kind,method,ip_address,user_agent,created_at) VALUES (:id,:user,:kind,:method,:ip,:agent,:now)"
)


CREATE_SESSION_INSERT_SESSIONS = text(
    """INSERT INTO sessions(id,user_id,refresh_token_hash,ip_address,user_agent,expires_at,created_at,last_used_at,authenticated_at,auth_method,mfa_verified_at)
        VALUES (:id,:user,:hash,:ip,:agent,:expires,:now,:now,:authenticated,:method,:mfa)"""
)


ROTATE_SESSION_UPDATE_SESSIONS = text(
    "UPDATE sessions SET refresh_token_hash=:hash,last_used_at=:now,expires_at=:expires WHERE id=:id"
)


LOGOUT_SESSION_UPDATE_SESSIONS = text(
    "UPDATE sessions SET revoked_at=:now WHERE id=:id AND user_id=:user AND revoked_at IS NULL RETURNING id"
)


def revoke_sessions_update_sessions_sql(predicate) -> TextClause:
    return text(
        "UPDATE sessions SET revoked_at=:now WHERE user_id=:user AND revoked_at IS NULL AND "
        + predicate
        + " RETURNING id"
    )
