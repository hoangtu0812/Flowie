from fastapi import BackgroundTasks, Depends, Request
from pydantic import BaseModel, Field
from ...core.utc_responses import UtcAPIRouter
from ...core.errors import ApiError
from ...db.session import get_session
from .password_reset import consume_reset, issue_reset, limit_request
from .reset_delivery import delivery_enabled, deliver_reset

router = UtcAPIRouter(prefix="/api/v1/auth/password-reset", tags=["password-reset"])


class ResetRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class ResetConfirm(BaseModel):
    token: str = Field(min_length=20, max_length=128)
    password: str = Field(min_length=12, max_length=128)


@router.get("/configuration")
async def configuration(request: Request):
    return {"data": {"enabled": delivery_enabled(request.app.state.settings)}}


@router.post("/request", status_code=202)
async def request_reset(
    payload: ResetRequest,
    request: Request,
    background: BackgroundTasks,
    db=Depends(get_session),
):
    settings = request.app.state.settings
    if not delivery_enabled(settings):
        raise ApiError(
            503,
            "Password recovery email is not configured. Contact your workspace administrator.",
            "Service Unavailable",
        )
    email = payload.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    await limit_request(db, settings.auth_jwt_secret, "reset-ip", ip, 10)
    await limit_request(db, settings.auth_jwt_secret, "reset-email", email, 3)
    token = await issue_reset(db, email)
    if token:
        background.add_task(deliver_reset, settings, email, token)
    return {
        "data": {
            "message": "If the account can use password recovery, a reset link will be emailed. Check your inbox."
        }
    }


@router.post("/confirm")
async def confirm_reset(
    payload: ResetConfirm, request: Request, db=Depends(get_session)
):
    settings = request.app.state.settings
    await limit_request(
        db,
        settings.auth_jwt_secret,
        "reset-confirm",
        request.client.host if request.client else "unknown",
        10,
    )
    user_id = await consume_reset(db, payload.token, payload.password)
    from ...services.notification_events import notification_hub

    await notification_hub.close_user(user_id)
    return {
        "data": {
            "message": "Password updated. Sign in again; previous sessions and API/MCP tokens have been revoked."
        }
    }
