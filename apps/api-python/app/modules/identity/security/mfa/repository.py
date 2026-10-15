from sqlalchemy import text


async def factor(db, user, *, lock=False):
    row = (
        (
            await db.execute(
                text(
                    "SELECT * FROM account_mfa WHERE user_id=:user"
                    + (" FOR UPDATE" if lock else "")
                ),
                {"user": user},
            )
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


async def invalidate_sessions(db, user, now, *, except_session=None):
    await db.execute(
        text(
            "UPDATE sessions SET revoked_at=:now WHERE user_id=:user AND revoked_at IS NULL"
            + (" AND id<>:except_session" if except_session else "")
        ),
        {"user": user, "now": now, "except_session": except_session},
    )
    await db.execute(
        text(
            "UPDATE mfa_challenges SET consumed_at=:now WHERE user_id=:user AND consumed_at IS NULL"
        ),
        {"user": user, "now": now},
    )
