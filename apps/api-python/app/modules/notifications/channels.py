from datetime import timedelta
from fastapi import Depends, Query, Request
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import text
from ...core.utc_responses import UtcAPIRouter
from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...db.session import get_session
from ...domains.auth import current_user
from ..access.membership import _workspace_role
from ..identity.reset_delivery import delivery_enabled

router = UtcAPIRouter(prefix="/api/v1/notifications", tags=["notification-delivery"])


class ChannelInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    emailEnabled: bool
    desktopEnabled: bool


class SnoozeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    minutes: int | None = Field(default=None, ge=1, le=43200)


@router.get("/channels")
async def channels(
    request: Request,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _workspace_role(db, workspaceId, user["id"])
    row = (
        (
            await db.execute(
                text(
                    "SELECT email_enabled,desktop_enabled FROM notification_preferences WHERE workspace_id=:workspace AND user_id=:user"
                ),
                {"workspace": workspaceId, "user": user["id"]},
            )
        )
        .mappings()
        .first()
    )
    return {
        "data": {
            "emailAvailable": delivery_enabled(request.app.state.settings),
            "emailEnabled": bool(row and row["email_enabled"]),
            "desktopEnabled": bool(row and row["desktop_enabled"]),
        }
    }


@router.put("/channels")
async def update_channels(
    payload: ChannelInput,
    request: Request,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _workspace_role(db, workspaceId, user["id"])
    if payload.emailEnabled and not delivery_enabled(request.app.state.settings):
        raise ApiError(409, "Private email delivery is not configured.", "Conflict")
    if payload.emailEnabled and not user["email_verified_at"]:
        raise ApiError(
            409, "Verify your email address before enabling notifications.", "Conflict"
        )
    await db.execute(
        text("""INSERT INTO notification_preferences(workspace_id,user_id,email_enabled,desktop_enabled,created_at,updated_at)
        VALUES (:workspace,:user,:email,:desktop,:now,:now) ON CONFLICT(workspace_id,user_id) DO UPDATE SET email_enabled=EXCLUDED.email_enabled,
        desktop_enabled=EXCLUDED.desktop_enabled,updated_at=:now"""),
        {
            "workspace": workspaceId,
            "user": user["id"],
            "email": payload.emailEnabled,
            "desktop": payload.desktopEnabled,
            "now": _utcnow(),
        },
    )
    await db.commit()
    return {"data": payload.model_dump()}


@router.post("/{notification_id}/snooze")
async def snooze(
    notification_id: str,
    payload: SnoozeInput,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _workspace_role(db, workspaceId, user["id"])
    until = _utcnow() + timedelta(minutes=payload.minutes) if payload.minutes else None
    found = (
        await db.execute(
            text(
                "UPDATE notifications SET snoozed_until=:until WHERE id=:id AND workspace_id=:workspace AND user_id=:user RETURNING id"
            ),
            {
                "until": until,
                "id": notification_id,
                "workspace": workspaceId,
                "user": user["id"],
            },
        )
    ).scalar_one_or_none()
    if not found:
        raise ApiError(404, "Notification not found.", "Not Found")
    await db.commit()
    return {"data": {"id": found, "snoozedUntil": until}}


@router.get("/delivery-status")
async def delivery_status(
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _workspace_role(db, workspaceId, user["id"])
    rows = (
        await db.execute(
            text("""SELECT n.id AS "notificationId",e.attempts,e.delivered_at AS "deliveredAt",e.failed_at AS "failedAt",
        e.last_error_code AS "lastErrorCode",e.available_at AS "retryAt" FROM notification_email_deliveries e JOIN notifications n ON n.id=e.notification_id
        WHERE n.workspace_id=:workspace AND n.user_id=:user ORDER BY n.created_at DESC LIMIT 50"""),
            {"workspace": workspaceId, "user": user["id"]},
        )
    ).mappings()
    return {"data": [dict(row) for row in rows]}
