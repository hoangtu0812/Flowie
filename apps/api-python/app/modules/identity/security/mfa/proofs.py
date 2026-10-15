import asyncio
import json
from datetime import timedelta
from hmac import compare_digest

from sqlalchemy import text

from .....core.clock import _utcnow
from .....core.errors import ApiError
from ..events import record_event
from .crypto import decrypt_secret, matching_counter, recovery_hash


async def reject(db, user, request, method="AUTHENTICATOR"):
    await record_event(db, user, "MFA_FAILED", method, request)
    # Failed attempts must survive the request dependency's rollback on ApiError.
    await db.commit()
    raise ApiError(
        401,
        "Verification failed or expired. Try another code or sign in again.",
        "Unauthorized",
    )


async def first_factor(db, user, actor, password, request):
    from .....core.passwords import verify_password

    if user["password_hash"]:
        if not await asyncio.to_thread(
            verify_password, user["password_hash"], password or ""
        ):
            await reject(db, user["id"], request, "PASSWORD")
        return "PASSWORD", _utcnow()
    proof = actor.get("session_authenticated_at")
    if (
        actor.get("session_auth_method") != "MICROSOFT"
        or proof is None
        or not _utcnow() - timedelta(minutes=5)
        <= proof
        <= _utcnow() + timedelta(seconds=60)
    ):
        raise ApiError(
            403, "Sign in with Microsoft again to verify your identity.", "Forbidden"
        )
    return "MICROSOFT", proof


async def consume_factor(db, configured, user, code, kind, settings):
    if kind == "RECOVERY":
        hashes = configured["recovery_hashes"]
        wanted = recovery_hash(user, code)
        matched = [value for value in hashes if compare_digest(value, wanted)]
        if not matched:
            return False
        await db.execute(
            text(
                "UPDATE account_mfa SET recovery_hashes=CAST(:hashes AS jsonb) WHERE user_id=:user"
            ),
            {
                "user": user,
                "hashes": json.dumps(
                    [value for value in hashes if not compare_digest(value, wanted)]
                ),
            },
        )
        return True
    secret = decrypt_secret(settings, user, configured["secret_cipher"])
    counter = matching_counter(secret, code, _utcnow(), configured["last_counter"])
    if counter is None:
        return False
    await db.execute(
        text("UPDATE account_mfa SET last_counter=:counter WHERE user_id=:user"),
        {"user": user, "counter": counter},
    )
    return True
