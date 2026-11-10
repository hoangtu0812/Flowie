"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

SETUP_INSERT_ACCOUNT_MFA = text(
    """INSERT INTO account_mfa(user_id,secret_cipher,pending_until) VALUES (:user,:cipher,:expires)
    ON CONFLICT(user_id) DO UPDATE SET secret_cipher=EXCLUDED.secret_cipher,pending_until=EXCLUDED.pending_until,last_counter=NULL,recovery_hashes='[]' """
)


ENABLE_UPDATE_ACCOUNT_MFA = text(
    "UPDATE account_mfa SET enabled_at=:now,pending_until=NULL,recovery_hashes=CAST(:hashes AS jsonb) WHERE user_id=:user"
)


CHANGE_DELETE_ACCOUNT_MFA = text("DELETE FROM account_mfa WHERE user_id=:user")


CHANGE_UPDATE_ACCOUNT_MFA = text(
    "UPDATE account_mfa SET recovery_hashes=CAST(:hashes AS jsonb) WHERE user_id=:user"
)


BEGIN_LOGIN_INSERT_MFA_CHALLENGES = text(
    """INSERT INTO mfa_challenges(id,user_id,token_hash,auth_version,auth_method,authenticated_at,next_path,expires_at,created_at)
    VALUES (:id,:user,:hash,:version,:method,:proof,:next,:expires,:now)"""
)


FINISH_LOGIN_UPDATE_MFA_CHALLENGES = text("UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=:id")


FINISH_LOGIN_UPDATE_MFA_CHALLENGES_2 = text("UPDATE mfa_challenges SET consumed_at=:now WHERE id=:id")


FINISH_LOGIN_UPDATE_USERS = text("UPDATE users SET last_login_at=:now,last_seen_at=:now WHERE id=:user")


CONSUME_FACTOR_UPDATE_ACCOUNT_MFA = text("UPDATE account_mfa SET last_counter=:counter WHERE user_id=:user")


CONSUME_FACTOR_UPDATE_ACCOUNT_MFA_2 = text(
    "UPDATE account_mfa SET recovery_hashes=CAST(:hashes AS jsonb) WHERE user_id=:user"
)


def invalidate_sessions_update_sessions_sql(except_session) -> TextClause:
    return text(
        "UPDATE sessions SET revoked_at=:now WHERE user_id=:user AND revoked_at IS NULL"
        + (" AND id<>:except_session" if except_session else "")
    )


INVALIDATE_SESSIONS_UPDATE_MFA_CHALLENGES = text(
    "UPDATE mfa_challenges SET consumed_at=:now WHERE user_id=:user AND consumed_at IS NULL"
)
