from __future__ import annotations

import asyncio
from datetime import timedelta
from hashlib import sha256
from secrets import token_urlsafe
from argon2 import PasswordHasher
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.clock import _utcnow
from ...core.identifiers import _cuid, _hash_token
from ...core.errors import ApiError


async def limit_request(
    db: AsyncSession, secret: str, kind: str, identity: str, limit: int
) -> None:
    now = _utcnow()
    key = sha256(f"{secret}:{kind}:{identity}".encode()).hexdigest()
    count = (
        await db.execute(
            text("""INSERT INTO auth_rate_limits (key,window_start,count)
        VALUES (:key,:now,1) ON CONFLICT(key) DO UPDATE SET
        count=CASE WHEN auth_rate_limits.window_start<:cutoff THEN 1 ELSE auth_rate_limits.count+1 END,
        window_start=CASE WHEN auth_rate_limits.window_start<:cutoff THEN :now ELSE auth_rate_limits.window_start END
        RETURNING count"""),
            {"key": key, "now": now, "cutoff": now - timedelta(hours=1)},
        )
    ).scalar_one()
    await db.execute(
        text("DELETE FROM auth_rate_limits WHERE window_start<:cutoff"),
        {"cutoff": now - timedelta(days=1)},
    )
    await db.commit()
    if count > limit:
        raise ApiError(429, "Too many requests. Try again later.", "Too Many Requests")


async def issue_reset(db: AsyncSession, email: str) -> str | None:
    user = (
        (
            await db.execute(
                text(
                    "SELECT id FROM users WHERE email=:email AND status='ACTIVE' AND password_hash IS NOT NULL FOR UPDATE"
                ),
                {"email": email},
            )
        )
        .mappings()
        .first()
    )
    if not user:
        return None
    now, token = _utcnow(), token_urlsafe(48)
    await db.execute(
        text(
            "UPDATE password_reset_tokens SET used_at=:now WHERE user_id=:user AND used_at IS NULL"
        ),
        {"now": now, "user": user["id"]},
    )
    await db.execute(
        text("""INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,created_at)
        VALUES (:id,:user,:hash,:expires,:now)"""),
        {
            "id": _cuid(),
            "user": user["id"],
            "hash": _hash_token(token),
            "expires": now + timedelta(minutes=15),
            "now": now,
        },
    )
    await db.commit()
    return token


async def consume_reset(db: AsyncSession, token: str, password: str) -> str:
    # Hash before selecting a valid token so invalid tokens perform comparable password work.
    password_hash = await asyncio.to_thread(PasswordHasher().hash, password)
    now = _utcnow()
    # Issuing and consuming resets lock the user before any token to avoid lock inversion.
    candidate = (
        await db.execute(
            text("SELECT user_id FROM password_reset_tokens WHERE token_hash=:hash"),
            {"hash": _hash_token(token)},
        )
    ).scalar_one_or_none()
    if candidate:
        await db.execute(
            text("SELECT id FROM users WHERE id=:id FOR UPDATE"), {"id": candidate}
        )
    row = (
        (
            await db.execute(
                text("""SELECT r.id,r.user_id FROM password_reset_tokens r
        JOIN users u ON u.id=r.user_id WHERE r.token_hash=:hash AND r.used_at IS NULL
        AND r.expires_at>:now AND u.status='ACTIVE' AND u.password_hash IS NOT NULL FOR UPDATE OF r,u"""),
                {"hash": _hash_token(token), "now": now},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(
            400,
            "The reset link is invalid or expired. Request a new link.",
            "Bad Request",
        )
    user = row["user_id"]
    await db.execute(
        text(
            "UPDATE users SET password_hash=:password, auth_version=auth_version+1, updated_at=:now WHERE id=:user"
        ),
        {"password": password_hash, "now": now, "user": user},
    )
    await db.execute(
        text(
            "UPDATE password_reset_tokens SET used_at=:now WHERE user_id=:user AND used_at IS NULL"
        ),
        {"now": now, "user": user},
    )
    for table in ("sessions", "personal_api_keys", "mcp_connections"):
        await db.execute(
            text(
                f"UPDATE {table} SET revoked_at=:now WHERE user_id=:user AND revoked_at IS NULL"
            ),
            {"now": now, "user": user},
        )
    await db.commit()
    return user
