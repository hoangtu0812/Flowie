import json
from datetime import timedelta

from sqlalchemy import text

from .....core.clock import _utcnow
from .....core.errors import ApiError
from ..events import record_event
from ..sessions import active_identity, create_session, expired, lock_account
from .crypto import encrypt_secret, new_secret, new_recovery, enrollment_image
from .proofs import first_factor, consume_factor, reject
from .repository import factor, invalidate_sessions


async def locked_actor(db, actor):
    user = await lock_account(db, actor["id"])
    if (
        await active_identity(
            db,
            {
                "sub": actor["id"],
                "sid": actor["session_id"],
                "ver": actor["auth_version"],
            },
        )
        is None
    ):
        raise expired()
    return user


async def setup(db, actor, password, request, settings):
    user = await locked_actor(db, actor)
    configured = await factor(db, user["id"], lock=True)
    if configured and configured["enabled_at"]:
        raise ApiError(409, "Authenticator is already enabled.", "Conflict")
    await first_factor(db, user, actor, password, request, settings)
    secret, expires = new_secret(), _utcnow() + timedelta(minutes=10)
    cipher = encrypt_secret(settings, user["id"], secret)
    await db.execute(
        text(
            """INSERT INTO account_mfa(user_id,secret_cipher,pending_until) VALUES (:user,:cipher,:expires)
    ON CONFLICT(user_id) DO UPDATE SET secret_cipher=EXCLUDED.secret_cipher,pending_until=EXCLUDED.pending_until,last_counter=NULL,recovery_hashes='[]' """
        ),
        {"user": user["id"], "cipher": cipher, "expires": expires},
    )
    await record_event(db, user["id"], "MFA_SETUP_STARTED", "AUTHENTICATOR", request)
    uri, image = enrollment_image(user["email"], secret)
    await db.commit()
    return {"secret": secret, "uri": uri, "qr": image, "expiresAt": expires}


async def enable(db, actor, payload, request, settings):
    user = await locked_actor(db, actor)
    configured = await factor(db, user["id"], lock=True)
    if configured and configured["enabled_at"]:
        raise ApiError(409, "Authenticator is already enabled.", "Conflict")
    method, proof = await first_factor(db, user, actor, payload.password, request, settings)
    if (
        not configured
        or not configured["pending_until"]
        or configured["pending_until"] <= _utcnow()
    ):
        await reject(db, user["id"], request)
    if not await consume_factor(
        db, configured, user["id"], payload.code, "AUTHENTICATOR", settings
    ):
        await reject(db, user["id"], request)
    codes, hashes = new_recovery(user["id"])
    now = _utcnow()
    now = now.replace(microsecond=now.microsecond // 1000 * 1000)
    await db.execute(
        text(
            "UPDATE account_mfa SET enabled_at=:now,pending_until=NULL,recovery_hashes=CAST(:hashes AS jsonb) WHERE user_id=:user"
        ),
        {"user": user["id"], "now": now, "hashes": json.dumps(hashes)},
    )
    await invalidate_sessions(db, user["id"], now)
    tokens = await create_session(
        db,
        user,
        request,
        settings,
        method=method,
        authenticated_at=proof,
        mfa_verified_at=now,
    )
    await record_event(db, user["id"], "MFA_ENABLED", "AUTHENTICATOR", request)
    await db.commit()
    return codes, tokens


async def change(db, actor, payload, request, settings, *, disable=False):
    user = await locked_actor(db, actor)
    configured = await factor(db, user["id"], lock=True)
    if not configured or not configured["enabled_at"]:
        raise ApiError(409, "Authenticator is not enabled.", "Conflict")
    await first_factor(db, user, actor, payload.password, request, settings)
    if not await consume_factor(
        db, configured, user["id"], payload.code, payload.kind, settings
    ):
        await reject(db, user["id"], request, payload.kind)
    codes, hashes = new_recovery(user["id"])
    if disable:
        await db.execute(
            text("DELETE FROM account_mfa WHERE user_id=:user"), {"user": user["id"]}
        )
    else:
        await db.execute(
            text(
                "UPDATE account_mfa SET recovery_hashes=CAST(:hashes AS jsonb) WHERE user_id=:user"
            ),
            {"user": user["id"], "hashes": json.dumps(hashes)},
        )
    await invalidate_sessions(
        db, user["id"], _utcnow(), except_session=actor["session_id"]
    )
    await record_event(
        db,
        user["id"],
        "MFA_DISABLED" if disable else "MFA_RECOVERY_REPLACED",
        payload.kind,
        request,
    )
    await db.commit()
    return [] if disable else codes
