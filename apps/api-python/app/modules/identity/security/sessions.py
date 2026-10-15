from datetime import timedelta
from secrets import token_urlsafe

import jwt
from sqlalchemy import text

from ....core.clock import _utcnow
from ....core.errors import ApiError
from ....core.identifiers import _cuid, _hash_token
from .events import record_event, request_metadata


def expired():
    return ApiError(
        401, "Your session has expired. Please sign in again.", "Unauthorized"
    )


def decode_access(token, settings):
    try:
        claims = jwt.decode(
            token,
            settings.auth_jwt_secret,
            algorithms=["HS256"],
            audience="flowie-web",
            issuer="flowie",
            options={"require": ["sub", "sid", "ver", "iat", "exp"]},
        )
        if (
            claims.get("token_use") != "access"
            or not isinstance(claims["sub"], str)
            or not isinstance(claims["sid"], str)
            or type(claims["ver"]) is not int
        ):
            raise jwt.InvalidTokenError("Invalid access purpose or identity")
        return claims
    except (jwt.PyJWTError, TypeError, ValueError) as error:
        raise expired() from error


def access_token(user, session, settings):
    now = _utcnow()
    return jwt.encode(
        {
            "sub": user["id"],
            "sid": session,
            "ver": user.get("auth_version", 0),
            "token_use": "access",
            "iss": "flowie",
            "aud": "flowie-web",
            "iat": now,
            "exp": now + timedelta(seconds=settings.auth_access_token_ttl_seconds),
        },
        settings.auth_jwt_secret,
        algorithm="HS256",
    )


async def active_identity(db, claims):
    row = (
        (
            await db.execute(
                text("""SELECT u.*,s.id AS session_id,s.auth_method AS session_auth_method,s.authenticated_at AS session_authenticated_at FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.id=:session AND s.user_id=:user AND s.revoked_at IS NULL AND s.expires_at>:now AND u.status='ACTIVE' AND u.auth_version=:version"""),
                {
                    "session": claims["sid"],
                    "user": claims["sub"],
                    "version": claims["ver"],
                    "now": _utcnow(),
                },
            )
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


async def lock_account(db, identifier):
    row = (
        (
            await db.execute(
                text("SELECT * FROM users WHERE id=:id FOR UPDATE"), {"id": identifier}
            )
        )
        .mappings()
        .first()
    )
    if row is None or row["status"] != "ACTIVE":
        raise expired()
    return dict(row)


async def create_session(
    db, user, request, settings, *, method="PASSWORD", authenticated_at=None
):
    actual = await lock_account(db, user["id"])
    if actual["auth_version"] != user.get("auth_version", 0):
        raise expired()
    identifier, refresh, now = _cuid(), token_urlsafe(48), _utcnow()
    await db.execute(
        text("""INSERT INTO sessions(id,user_id,refresh_token_hash,ip_address,user_agent,expires_at,created_at,last_used_at,authenticated_at,auth_method)
        VALUES (:id,:user,:hash,:ip,:agent,:expires,:now,:now,:authenticated,:method)"""),
        {
            "id": identifier,
            "user": user["id"],
            "hash": _hash_token(refresh),
            **request_metadata(request),
            "expires": now + timedelta(days=settings.auth_refresh_token_ttl_days),
            "now": now,
            "method": method,
            "authenticated": authenticated_at
            or (now if method in {"PASSWORD", "REGISTRATION"} else None),
        },
    )
    await record_event(db, user["id"], "LOGIN_SUCCEEDED", method, request)
    return access_token(actual, identifier, settings), refresh


async def rotate_session(db, refresh, request, settings):
    owner = (
        await db.execute(
            text("SELECT user_id FROM sessions WHERE refresh_token_hash=:hash"),
            {"hash": _hash_token(refresh)},
        )
    ).scalar_one_or_none()
    if owner is None:
        raise expired()
    user = await lock_account(db, owner)
    now = _utcnow()
    row = (
        (
            await db.execute(
                text(
                    "SELECT * FROM sessions WHERE refresh_token_hash=:hash AND user_id=:user AND revoked_at IS NULL AND expires_at>:now FOR UPDATE"
                ),
                {"hash": _hash_token(refresh), "user": owner, "now": now},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise expired()
    replacement = token_urlsafe(48)
    await db.execute(
        text(
            "UPDATE sessions SET refresh_token_hash=:hash,last_used_at=:now,expires_at=:expires WHERE id=:id"
        ),
        {
            "id": row["id"],
            "hash": _hash_token(replacement),
            "now": now,
            "expires": now + timedelta(days=settings.auth_refresh_token_ttl_days),
        },
    )
    return access_token(user, row["id"], settings), replacement, user


async def revoke_sessions(db, user, request, *, identifier=None):
    await lock_account(db, user["id"])
    if (
        await active_identity(
            db,
            {"sub": user["id"], "sid": user["session_id"], "ver": user["auth_version"]},
        )
        is None
    ):
        raise expired()
    if identifier == user["session_id"]:
        raise ApiError(
            400, "Use sign out to revoke the current session.", "Bad Request"
        )
    predicate = "id=:id" if identifier else "id<>:session"
    rows = (
        (
            await db.execute(
                text(
                    "UPDATE sessions SET revoked_at=:now WHERE user_id=:user AND revoked_at IS NULL AND "
                    + predicate
                    + " RETURNING id"
                ),
                {
                    "id": identifier,
                    "session": user["session_id"],
                    "user": user["id"],
                    "now": _utcnow(),
                },
            )
        )
        .scalars()
        .all()
    )
    if identifier and not rows:
        raise ApiError(404, "Session not found.", "Not Found")
    if rows:
        await record_event(db, user["id"], "SESSION_REVOKED", "BROWSER", request)
    return rows


async def logout_session(db, request, settings):
    row = None
    token = request.cookies.get("flowie_access")
    if token:
        try:
            claims = decode_access(token, settings)
            row = (
                (
                    await db.execute(
                        text(
                            "SELECT id,user_id FROM sessions WHERE id=:id AND user_id=:user AND revoked_at IS NULL"
                        ),
                        {"id": claims["sid"], "user": claims["sub"]},
                    )
                )
                .mappings()
                .first()
            )
        except ApiError:
            pass
    refresh = request.cookies.get("flowie_refresh")
    if row is None and refresh:
        row = (
            (
                await db.execute(
                    text(
                        "SELECT id,user_id FROM sessions WHERE refresh_token_hash=:hash AND revoked_at IS NULL AND expires_at>:now"
                    ),
                    {"hash": _hash_token(refresh), "now": _utcnow()},
                )
            )
            .mappings()
            .first()
        )
    if row is None:
        return None
    # A logout authorized before rotation still revokes the same stable device ID.
    await db.execute(
        text("SELECT id FROM users WHERE id=:user FOR UPDATE"), {"user": row["user_id"]}
    )
    changed = (
        await db.execute(
            text(
                "UPDATE sessions SET revoked_at=:now WHERE id=:id AND user_id=:user AND revoked_at IS NULL RETURNING id"
            ),
            {"id": row["id"], "user": row["user_id"], "now": _utcnow()},
        )
    ).scalar_one_or_none()
    if changed:
        await record_event(db, row["user_id"], "LOGGED_OUT", "BROWSER", request)
    return row["user_id"]
