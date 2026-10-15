from typing import Literal

from fastapi import Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .....core.errors import ApiError
from .....core.utc_responses import UtcAPIRouter
from .....db.session import get_session
from .....domains.auth import (
    current_user,
    _set_cookies,
    _authenticated_user,
    _first_workspace,
    _runtime_user,
)
from ...password_reset import limit_request
from ..api import private_response
from . import commands
from .crypto import keyring
from .repository import factor
from .login import finish_login, COOKIE, clear_challenge

router = UtcAPIRouter(tags=["mfa"], dependencies=[Depends(private_response)])


class Proof(BaseModel):
    password: str | None = Field(default=None, max_length=128)


class Verification(Proof):
    code: str = Field(min_length=1, max_length=128)
    kind: Literal["AUTHENTICATOR", "RECOVERY"] = "AUTHENTICATOR"


async def account_limit(db, request, user):
    await limit_request(
        db, request.app.state.settings.auth_jwt_secret, "mfa-manage", user["id"], 20
    )


async def close_sockets(request, user):
    from .....services.notification_events import notification_hub

    await notification_hub.close_user(user["id"])


@router.get("/api/v1/account-security/mfa")
async def status(request: Request, user=Depends(current_user), db=Depends(get_session)):
    configured = await factor(db, user["id"])
    return {
        "data": {
            "available": keyring(request.app.state.settings) is not None,
            "enabled": bool(configured and configured["enabled_at"]),
            "hasPassword": bool(user["password_hash"]),
            "recoveryRemaining": (
                len(configured["recovery_hashes"])
                if configured and configured["enabled_at"]
                else 0
            ),
        }
    }


@router.post("/api/v1/account-security/mfa/setup")
async def setup(
    payload: Proof,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await account_limit(db, request, user)
    return {
        "data": await commands.setup(
            db, user, payload.password, request, request.app.state.settings
        )
    }


@router.post("/api/v1/account-security/mfa/enable")
async def enable(
    payload: Verification,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await account_limit(db, request, user)
    codes, tokens = await commands.enable(
        db, user, payload, request, request.app.state.settings
    )
    response = JSONResponse({"data": {"recoveryCodes": codes}})
    _set_cookies(response, *tokens, request.app.state.settings)
    await close_sockets(request, user)
    return response


@router.post("/api/v1/account-security/mfa/{action}")
async def change(
    action: Literal["disable", "recovery-codes"],
    payload: Verification,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await account_limit(db, request, user)
    codes = await commands.change(
        db,
        user,
        payload,
        request,
        request.app.state.settings,
        disable=action == "disable",
    )
    await close_sockets(request, user)
    return {"data": {"recoveryCodes": codes}}


@router.post("/api/v1/auth/mfa/verify")
async def verify(payload: Verification, request: Request, db=Depends(get_session)):
    settings = request.app.state.settings
    await limit_request(
        db,
        settings.auth_jwt_secret,
        "mfa-login-ip",
        request.client.host if request.client else "unknown",
        100,
    )
    raw = request.cookies.get(COOKIE)
    if not raw:
        raise ApiError(401, "Sign in again to start verification.", "Unauthorized")
    from .....core.identifiers import _hash_token

    await limit_request(
        db, settings.auth_jwt_secret, "mfa-challenge", _hash_token(raw), 20
    )
    user, tokens, next_path = await finish_login(
        db, raw, payload.code, payload.kind, request, settings
    )
    workspace = await _first_workspace(db, user["id"])
    await db.commit()
    response = JSONResponse(
        jsonable_encoder(
            {
                "data": {
                    "user": _authenticated_user(_runtime_user(user, settings)),
                    "workspace": workspace,
                    "next": next_path,
                }
            }
        )
    )
    _set_cookies(response, *tokens, settings)
    clear_challenge(response, settings)
    return response
