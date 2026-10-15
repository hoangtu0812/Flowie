from typing import Annotated, Literal

from fastapi import Depends, Query, Request

from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from ..identity.password_reset import limit_request
from ..work_items.query_contract import IssueSelectionQuery
from .calendar import add_working_seconds
from .commands import apply_current_policy, retry_job
from .contracts import (
    CalendarPreview,
    CreatePolicy,
    PolicyCommand,
    PolicyValues,
    UpdatePolicy,
    IssueSlaCommand,
    RetrySlaJob,
)
from .policies import (
    create_policy,
    list_policies,
    update_policy,
    policy_command,
    policy_history,
)
from .queries import issue_sla, sla_report
from .options import policy_options

router = UtcAPIRouter(prefix="/api/v1/slas", tags=["slas"])


@router.get("/options")
async def options(
    workspaceId: str,
    teamId: Annotated[str | None, Query(max_length=100)] = None,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await policy_options(db, workspaceId, user, teamId)


async def write_limit(db, request, user):
    await limit_request(
        db, request.app.state.settings.auth_jwt_secret, "sla-write", user["id"], 60
    )


@router.get("")
async def policies(
    workspaceId: str,
    request: Request,
    includeArchived: bool = False,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await list_policies(
        db,
        workspaceId,
        user,
        request.app.state.settings.auth_jwt_secret,
        include_archived=includeArchived,
        cursor=cursor,
        limit=limit,
    )


@router.post("/preview")
async def preview(payload: CalendarPreview, user=Depends(current_user)):
    return {
        "data": {
            "dueAt": add_working_seconds(
                payload.startAt, payload.deadlineMinutes * 60, payload.calendar
            )
        }
    }


@router.post("/report")
async def report(
    payload: IssueSelectionQuery,
    workspaceId: str,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await sla_report(db, workspaceId, user, payload.options())


@router.post("")
async def create(
    payload: CreatePolicy,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await write_limit(db, request, user)
    values = PolicyValues.model_validate(payload.model_dump(exclude={"workspaceId"}))
    result = await create_policy(db, payload.workspaceId, user, values)
    await db.commit()
    return {"data": result}


@router.put("/{identifier}")
async def update(
    identifier: str,
    payload: UpdatePolicy,
    workspaceId: str,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await write_limit(db, request, user)
    result = await update_policy(db, workspaceId, user, identifier, payload)
    await db.commit()
    return {"data": result}


@router.get("/{identifier}/revisions")
async def revisions(
    identifier: str,
    workspaceId: str,
    before: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await policy_history(
        db, workspaceId, user, identifier, before=before, limit=limit
    )


@router.post("/{identifier}/{command}")
async def command(
    identifier: str,
    command: Literal["archive", "restore"],
    payload: PolicyCommand,
    workspaceId: str,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await write_limit(db, request, user)
    result = await policy_command(
        db, workspaceId, user, identifier, command, payload.expectedVersion
    )
    await db.commit()
    return {"data": result}


@router.get("/issues/{identifier}/clock")
async def clock(
    identifier: str,
    workspaceId: str,
    before: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await issue_sla(
        db, workspaceId, user, identifier, before=before, limit=limit
    )


@router.post("/issues/{identifier}/apply")
async def apply(
    identifier: str,
    payload: IssueSlaCommand,
    workspaceId: str,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await write_limit(db, request, user)
    await apply_current_policy(db, workspaceId, user, identifier, payload)
    await db.commit()
    return await issue_sla(db, workspaceId, user, identifier)


@router.post("/issues/{identifier}/retry")
async def retry(
    identifier: str,
    payload: RetrySlaJob,
    workspaceId: str,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await write_limit(db, request, user)
    await retry_job(db, workspaceId, user, identifier, payload)
    await db.commit()
    return await issue_sla(db, workspaceId, user, identifier)
