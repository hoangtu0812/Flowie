from typing import Annotated, Literal

from fastapi import Depends, Query, Request

from ...core.clock import _utcnow
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from ..identity.password_reset import limit_request
from .calendar import upcoming
from .contracts import ScheduleRule, CreateSchedule, UpdateSchedule, ScheduleCommand
from .repository import schedules, schedule_row, public_schedule, run_history
from .service import create_schedule, update_schedule, schedule_command

router = UtcAPIRouter(prefix="/api/v1/recurring-schedules", tags=["recurring-issues"])


@router.post("/preview")
async def preview(payload: ScheduleRule, user=Depends(current_user)):
    return {"data": {"occurrences": upcoming(payload, _utcnow())}}


@router.get("")
async def list_schedules(
    workspaceId: str,
    request: Request,
    teamId: Annotated[str | None, Query(max_length=100)] = None,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await schedules(
        db,
        workspaceId,
        user,
        request.app.state.settings.auth_jwt_secret,
        team=teamId,
        cursor=cursor,
        limit=limit,
    )


@router.post("")
async def create(
    payload: CreateSchedule,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await limit_request(
        db,
        request.app.state.settings.auth_jwt_secret,
        "recurring-write",
        user["id"],
        60,
    )
    result = await create_schedule(db, user, payload)
    await db.commit()
    return {"data": result}


@router.get("/{identifier}")
async def detail(
    identifier: str,
    workspaceId: str,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return {
        "data": await public_schedule(
            db, workspaceId, user, await schedule_row(db, workspaceId, user, identifier)
        )
    }


@router.put("/{identifier}")
async def update(
    identifier: str,
    workspaceId: str,
    payload: UpdateSchedule,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await limit_request(
        db,
        request.app.state.settings.auth_jwt_secret,
        "recurring-write",
        user["id"],
        60,
    )
    result = await update_schedule(db, user, workspaceId, identifier, payload)
    await db.commit()
    return {"data": result}


@router.get("/{identifier}/runs")
async def runs(
    identifier: str,
    workspaceId: str,
    request: Request,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await run_history(
        db,
        workspaceId,
        user,
        request.app.state.settings.auth_jwt_secret,
        identifier,
        cursor,
        limit=limit,
    )


@router.post("/{identifier}/{command}")
async def command(
    identifier: str,
    command: Literal["pause", "resume", "run-now"],
    workspaceId: str,
    payload: ScheduleCommand,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await limit_request(
        db,
        request.app.state.settings.auth_jwt_secret,
        "recurring-write",
        user["id"],
        60,
    )
    result = await schedule_command(db, user, workspaceId, identifier, command, payload)
    await db.commit()
    return {"data": result}
