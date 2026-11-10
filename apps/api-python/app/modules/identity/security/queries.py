"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def read_page_select_sql(select) -> TextClause:
    return text("SELECT COUNT(*) FROM (" + select + ") items")


def read_page_select_sql_2(select, clause) -> TextClause:
    return text(
        "SELECT * FROM ("
        + select
        + ") items"
        + clause
        + " ORDER BY created_at DESC,id DESC LIMIT :limit"
    )


LOGOUT_SESSION_SELECT_USERS = text("SELECT id FROM users WHERE id=:user FOR UPDATE")


ROTATE_SESSION_SELECT_SESSIONS = text("SELECT user_id FROM sessions WHERE refresh_token_hash=:hash")


ACTIVE_IDENTITY_SELECT_SESSIONS = text(
    """SELECT u.*,s.id AS session_id,s.auth_method AS session_auth_method,s.authenticated_at AS session_authenticated_at FROM sessions s JOIN users u ON u.id=s.user_id
        LEFT JOIN account_mfa m ON m.user_id=u.id
        WHERE s.id=:session AND s.user_id=:user AND s.revoked_at IS NULL AND s.expires_at>:now AND u.status='ACTIVE' AND u.auth_version=:version
        AND (m.enabled_at IS NULL OR s.mfa_verified_at>=m.enabled_at)"""
)


LOCK_ACCOUNT_SELECT_USERS = text("SELECT * FROM users WHERE id=:id FOR UPDATE")


ROTATE_SESSION_SELECT_SESSIONS_2 = text(
    "SELECT * FROM sessions WHERE refresh_token_hash=:hash AND user_id=:user AND revoked_at IS NULL AND expires_at>:now FOR UPDATE"
)


LOGOUT_SESSION_SELECT_SESSIONS = text(
    "SELECT id,user_id FROM sessions WHERE refresh_token_hash=:hash AND revoked_at IS NULL AND expires_at>:now"
)


LOGOUT_SESSION_SELECT_SESSIONS_2 = text(
    "SELECT id,user_id FROM sessions WHERE id=:id AND user_id=:user AND revoked_at IS NULL"
)
