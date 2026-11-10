from datetime import timedelta
from secrets import token_urlsafe

import jwt

from ....core.clock import utcnow
from ....core.errors import ApiError
from ....core.identifiers import cuid, hash_token
from .commands import (
    CREATE_SESSION_INSERT_SESSIONS,
    LOGOUT_SESSION_UPDATE_SESSIONS,
    ROTATE_SESSION_UPDATE_SESSIONS,
    revoke_sessions_update_sessions_sql,
)
from .events import record_event, request_metadata
from .queries import (
    ACTIVE_IDENTITY_SELECT_SESSIONS,
    LOCK_ACCOUNT_SELECT_USERS,
    LOGOUT_SESSION_SELECT_SESSIONS,
    LOGOUT_SESSION_SELECT_SESSIONS_2,
    LOGOUT_SESSION_SELECT_USERS,
    ROTATE_SESSION_SELECT_SESSIONS,
    ROTATE_SESSION_SELECT_SESSIONS_2,
)


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
    now = utcnow()
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
                ACTIVE_IDENTITY_SELECT_SESSIONS,
                {
                    "session": claims["sid"],
                    "user": claims["sub"],
                    "version": claims["ver"],
                    "now": utcnow(),
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
                LOCK_ACCOUNT_SELECT_USERS, {"id": identifier}
            )
        )
        .mappings()
        .first()
    )
    if row is None or row["status"] != "ACTIVE":
        raise expired()
    return dict(row)


async def create_session(
    db,
    user,
    request,
    settings,
    *,
    method="PASSWORD",
    authenticated_at=None,
    mfa_verified_at=None
):
    actual = await lock_account(db, user["id"])
    if actual["auth_version"] != user.get("auth_version", 0):
        raise expired()
    from .mfa.repository import factor

    configured = await factor(db, user["id"])
    if (
        configured
        and configured["enabled_at"]
        and (mfa_verified_at is None or mfa_verified_at < configured["enabled_at"])
    ):
        raise expired()
    identifier, refresh, now = cuid(), token_urlsafe(48), utcnow()
    await db.execute(
        CREATE_SESSION_INSERT_SESSIONS,
        {
            "id": identifier,
            "user": user["id"],
            "hash": hash_token(refresh),
            **request_metadata(request),
            "expires": now + timedelta(days=settings.auth_refresh_token_ttl_days),
            "now": now,
            "method": method,
            "mfa": mfa_verified_at,
            "authenticated": authenticated_at
            or (now if method in {"PASSWORD", "REGISTRATION"} else None),
        },
    )
    await record_event(db, user["id"], "LOGIN_SUCCEEDED", method, request)
    return access_token(actual, identifier, settings), refresh


async def rotate_session(db, refresh, request, settings):
    owner = (
        await db.execute(
            ROTATE_SESSION_SELECT_SESSIONS,
            {"hash": hash_token(refresh)},
        )
    ).scalar_one_or_none()
    if owner is None:
        raise expired()
    user = await lock_account(db, owner)
    now = utcnow()
    row = (
        (
            await db.execute(
                ROTATE_SESSION_SELECT_SESSIONS_2,
                {"hash": hash_token(refresh), "user": owner, "now": now},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise expired()
    from .mfa.repository import factor

    configured = await factor(db, owner)
    if (
        configured
        and configured["enabled_at"]
        and (
            row["mfa_verified_at"] is None
            or row["mfa_verified_at"] < configured["enabled_at"]
        )
    ):
        raise expired()
    replacement = token_urlsafe(48)
    await db.execute(
        ROTATE_SESSION_UPDATE_SESSIONS,
        {
            "id": row["id"],
            "hash": hash_token(replacement),
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
                revoke_sessions_update_sessions_sql(predicate),
                {
                    "id": identifier,
                    "session": user["session_id"],
                    "user": user["id"],
                    "now": utcnow(),
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
                        LOGOUT_SESSION_SELECT_SESSIONS_2,
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
                    LOGOUT_SESSION_SELECT_SESSIONS,
                    {"hash": hash_token(refresh), "now": utcnow()},
                )
            )
            .mappings()
            .first()
        )
    if row is None:
        return None
    # A logout authorized before rotation still revokes the same stable device ID.
    await db.execute(
        LOGOUT_SESSION_SELECT_USERS, {"user": row["user_id"]}
    )
    changed = (
        await db.execute(
            LOGOUT_SESSION_UPDATE_SESSIONS,
            {"id": row["id"], "user": row["user_id"], "now": utcnow()},
        )
    ).scalar_one_or_none()
    if changed:
        await record_event(db, row["user_id"], "LOGGED_OUT", "BROWSER", request)
    return row["user_id"]
