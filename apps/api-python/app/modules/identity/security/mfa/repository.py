from .commands import (
    INVALIDATE_SESSIONS_UPDATE_MFA_CHALLENGES,
    invalidate_sessions_update_sessions_sql,
)
from .queries import (
    factor_select_account_mfa_sql,
)


async def factor(db, user, *, lock=False):
    row = (
        (
            await db.execute(
                factor_select_account_mfa_sql(lock),
                {"user": user},
            )
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


async def invalidate_sessions(db, user, now, *, except_session=None):
    await db.execute(
        invalidate_sessions_update_sessions_sql(except_session),
        {"user": user, "now": now, "except_session": except_session},
    )
    await db.execute(
        INVALIDATE_SESSIONS_UPDATE_MFA_CHALLENGES,
        {"user": user, "now": now},
    )
