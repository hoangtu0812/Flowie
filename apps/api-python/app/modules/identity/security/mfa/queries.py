"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

FINISH_LOGIN_SELECT_MFA_CHALLENGES = text("SELECT user_id FROM mfa_challenges WHERE token_hash=:hash")


FINISH_LOGIN_SELECT_MFA_CHALLENGES_2 = text("SELECT * FROM mfa_challenges WHERE token_hash=:hash FOR UPDATE")


def factor_select_account_mfa_sql(lock) -> TextClause:
    return text(
        "SELECT * FROM account_mfa WHERE user_id=:user"
        + (" FOR UPDATE" if lock else "")
    )
