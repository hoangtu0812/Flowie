from datetime import timedelta
from secrets import token_urlsafe

from sqlalchemy import text

from .....core.clock import _utcnow
from .....core.identifiers import _cuid, _hash_token
from .....core.errors import ApiError
from ..events import record_event
from ..sessions import create_session, lock_account, expired
from .repository import factor
from .proofs import consume_factor, reject

COOKIE = "flowie_mfa_challenge"
COOKIE_PATH = "/api/v1/auth/mfa"


def challenge_cookie(response, token, settings):
    response.headers["Cache-Control"] = "private, no-store"
    response.set_cookie(
        COOKIE,
        token,
        max_age=300,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path=COOKIE_PATH,
    )


def clear_challenge(response, settings):
    response.delete_cookie(
        COOKIE,
        path=COOKIE_PATH,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
    )


async def begin_login(
    db, user, request, *, method, authenticated_at=None, next_path=None
):
    actual = await lock_account(db, user["id"])
    if actual["auth_version"] != user["auth_version"]:
        raise expired()
    configured = await factor(db, user["id"], lock=True)
    if not configured or not configured["enabled_at"]:
        return None
    now, raw = _utcnow(), token_urlsafe(48)
    await db.execute(
        text(
            """INSERT INTO mfa_challenges(id,user_id,token_hash,auth_version,auth_method,authenticated_at,next_path,expires_at,created_at)
    VALUES (:id,:user,:hash,:version,:method,:proof,:next,:expires,:now)"""
        ),
        {
            "id": _cuid(),
            "user": user["id"],
            "hash": _hash_token(raw),
            "version": actual["auth_version"],
            "method": method,
            "proof": authenticated_at or (now if method == "PASSWORD" else None),
            "next": next_path,
            "expires": now + timedelta(minutes=5),
            "now": now,
        },
    )
    await record_event(db, user["id"], "MFA_CHALLENGE_STARTED", method, request)
    return raw


async def finish_login(db, raw, code, kind, request, settings):
    owner = (
        await db.execute(
            text("SELECT user_id FROM mfa_challenges WHERE token_hash=:hash"),
            {"hash": _hash_token(raw)},
        )
    ).scalar_one_or_none()
    if owner is None:
        await reject(db, None, request, kind)
    from ...password_reset import limit_request

    await limit_request(db, settings.auth_jwt_secret, "mfa-login-account", owner, 20)
    user = await lock_account(db, owner)
    configured = await factor(db, owner, lock=True)
    challenge = (
        (
            await db.execute(
                text("SELECT * FROM mfa_challenges WHERE token_hash=:hash FOR UPDATE"),
                {"hash": _hash_token(raw)},
            )
        )
        .mappings()
        .first()
    )
    now = _utcnow()
    if (
        not challenge
        or not configured
        or not configured["enabled_at"]
        or challenge["consumed_at"]
        or challenge["expires_at"] <= now
        or challenge["attempts"] >= 5
        or challenge["auth_version"] != user["auth_version"]
    ):
        await reject(db, owner, request, kind)
    # Commit the failure budget even if a missing encryption key returns 503.
    await db.execute(
        text("UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=:id"),
        {"id": challenge["id"]},
    )
    try:
        accepted = await consume_factor(db, configured, owner, code, kind, settings)
    except ApiError:
        await db.commit()
        raise
    if not accepted:
        await reject(db, owner, request, kind)
    await db.execute(
        text("UPDATE mfa_challenges SET consumed_at=:now WHERE id=:id"),
        {"id": challenge["id"], "now": now},
    )
    tokens = await create_session(
        db,
        user,
        request,
        settings,
        method=challenge["auth_method"],
        authenticated_at=challenge["authenticated_at"],
        mfa_verified_at=now,
    )
    await record_event(db, owner, "MFA_VERIFIED", kind, request)
    return user, tokens, challenge["next_path"]
