from datetime import timedelta

from fastapi import Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...services.microsoft_teams import teams_available
from ..access.membership import workspace_role
from ..identity.auth import current_user
from ..identity.reset_delivery import delivery_enabled
from .access import notification_scope
from .commands import (
    UPDATE_CHANNELS_INSERT_NOTIFICATION_PREFERENCES,
    snooze_update_notifications_sql,
)
from .queries import (
    CHANNELS_SELECT_NOTIFICATION_PREFERENCES,
    delivery_status_select_notification_email_deliveries_sql,
)

router = UtcAPIRouter(prefix="/api/v1/notifications", tags=["notification-delivery"])


class ChannelInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    emailEnabled: bool
    desktopEnabled: bool
    # Omitted by older clients, which must not switch Teams back on or off.
    # VI: Client cũ không gửi trường này và không được làm bật/tắt lại Teams.
    teamsEnabled: bool | None = None
    # Omitted means unchanged, so the Settings page and the Service Desk page cannot undo each other.
    # VI: Không gửi nghĩa là giữ nguyên, để trang Settings và trang Service Desk không ghi đè nhau.
    ticketEmailEnabled: bool | None = None


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
    await workspace_role(db, workspaceId, user["id"])
    row = (
        (
            await db.execute(
                CHANNELS_SELECT_NOTIFICATION_PREFERENCES,
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
            "teamsAvailable": teams_available(request.app.state.settings),
            # Teams mentions are on until the person turns them off.
            # VI: @mention Teams bật cho tới khi người dùng tự tắt.
            "teamsEnabled": not row or row["teams_enabled"],
            "ticketEmailEnabled": not row or row["ticket_email_enabled"],
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
    await workspace_role(db, workspaceId, user["id"])
    if payload.emailEnabled and not delivery_enabled(request.app.state.settings):
        raise ApiError(409, "Private email delivery is not configured.", "Conflict")
    if payload.emailEnabled and not user["email_verified_at"]:
        raise ApiError(
            409, "Verify your email address before enabling notifications.", "Conflict"
        )
    await db.execute(
        UPDATE_CHANNELS_INSERT_NOTIFICATION_PREFERENCES,
        {
            "workspace": workspaceId,
            "user": user["id"],
            "email": payload.emailEnabled,
            "desktop": payload.desktopEnabled,
            "teams": payload.teamsEnabled,
            "tickets": payload.ticketEmailEnabled,
            "now": utcnow(),
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
    await workspace_role(db, workspaceId, user["id"])
    until = utcnow() + timedelta(minutes=payload.minutes) if payload.minutes else None
    found = (
        await db.execute(
            snooze_update_notifications_sql(notification_scope),
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
    await workspace_role(db, workspaceId, user["id"])
    rows = (
        await db.execute(
            delivery_status_select_notification_email_deliveries_sql(notification_scope),
            {"workspace": workspaceId, "user": user["id"]},
        )
    ).mappings()
    return {"data": [dict(row) for row in rows]}
