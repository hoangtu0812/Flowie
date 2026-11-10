from __future__ import annotations

import asyncio
from datetime import timedelta
from hashlib import sha256
from secrets import token_urlsafe

from argon2 import PasswordHasher
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid, hash_token
from .commands import (
    CONSUME_RESET_UPDATE_PASSWORD_RESET_TOKENS,
    CONSUME_RESET_UPDATE_USERS,
    ISSUE_RESET_INSERT_PASSWORD_RESET_TOKENS,
    ISSUE_RESET_UPDATE_PASSWORD_RESET_TOKENS,
    LIMIT_REQUEST_DELETE_AUTH_RATE_LIMITS,
    LIMIT_REQUEST_INSERT_AUTH_RATE_LIMITS,
    consume_reset_update_sql,
)
from .queries import (
    CONSUME_RESET_SELECT_PASSWORD_RESET_TOKENS,
    CONSUME_RESET_SELECT_PASSWORD_RESET_TOKENS_2,
    CONSUME_RESET_SELECT_USERS,
    ISSUE_RESET_SELECT_USERS,
)


async def limit_request(
    db: AsyncSession, secret: str, kind: str, identity: str, limit: int
) -> None:
    now = utcnow()
    key = sha256(f"{secret}:{kind}:{identity}".encode()).hexdigest()
    count = (
        await db.execute(
            LIMIT_REQUEST_INSERT_AUTH_RATE_LIMITS,
            {"key": key, "now": now, "cutoff": now - timedelta(hours=1)},
        )
    ).scalar_one()
    await db.execute(
        LIMIT_REQUEST_DELETE_AUTH_RATE_LIMITS,
        {"cutoff": now - timedelta(days=1)},
    )
    await db.commit()
    if count > limit:
        raise ApiError(429, "Too many requests. Try again later.", "Too Many Requests")


async def issue_reset(db: AsyncSession, email: str) -> str | None:
    user = (
        (
            await db.execute(
                ISSUE_RESET_SELECT_USERS,
                {"email": email},
            )
        )
        .mappings()
        .first()
    )
    if not user:
        return None
    now, token = utcnow(), token_urlsafe(48)
    await db.execute(
        ISSUE_RESET_UPDATE_PASSWORD_RESET_TOKENS,
        {"now": now, "user": user["id"]},
    )
    await db.execute(
        ISSUE_RESET_INSERT_PASSWORD_RESET_TOKENS,
        {
            "id": cuid(),
            "user": user["id"],
            "hash": hash_token(token),
            "expires": now + timedelta(minutes=15),
            "now": now,
        },
    )
    await db.commit()
    return token


async def consume_reset(db: AsyncSession, token: str, password: str) -> str:
    # Hash before selecting a valid token so invalid tokens perform comparable password work.
    password_hash = await asyncio.to_thread(PasswordHasher().hash, password)
    now = utcnow()
    # Issuing and consuming resets lock the user before any token to avoid lock inversion.
    candidate = (
        await db.execute(
            CONSUME_RESET_SELECT_PASSWORD_RESET_TOKENS,
            {"hash": hash_token(token)},
        )
    ).scalar_one_or_none()
    if candidate:
        await db.execute(
            CONSUME_RESET_SELECT_USERS, {"id": candidate}
        )
    row = (
        (
            await db.execute(
                CONSUME_RESET_SELECT_PASSWORD_RESET_TOKENS_2,
                {"hash": hash_token(token), "now": now},
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
        CONSUME_RESET_UPDATE_USERS,
        {"password": password_hash, "now": now, "user": user},
    )
    await db.execute(
        CONSUME_RESET_UPDATE_PASSWORD_RESET_TOKENS,
        {"now": now, "user": user},
    )
    for table in ("sessions", "personal_api_keys", "mcp_connections"):
        await db.execute(
            consume_reset_update_sql(table),
            {"now": now, "user": user},
        )
    await db.commit()
    return user
