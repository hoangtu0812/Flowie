from typing import Annotated

from fastapi import Depends, Query, Request

from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from ..identity.password_reset import limit_request
from .contracts import WorkflowReport
from .repository import workflow_report, workload_page
from .breakdowns import change_page, project_page

router = UtcAPIRouter(prefix="/api/v1/reports", tags=["workflow-reports"])


@router.post("/workflow")
async def workflow(
    payload: WorkflowReport,
    workspaceId: str,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await limit_request(
        db,
        request.app.state.settings.auth_jwt_secret,
        "workflow-report",
        user["id"],
        60,
    )
    result = await workflow_report(db, workspaceId, user, payload)
    await db.commit()
    return result


@router.post("/workload")
async def workload(
    payload: WorkflowReport,
    workspaceId: str,
    request: Request,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await workload_page(
        db,
        workspaceId,
        user,
        payload,
        request.app.state.settings.auth_jwt_secret,
        cursor=cursor,
        limit=limit,
    )


@router.post("/{kind}")
async def breakdown(
    kind: str,
    payload: WorkflowReport,
    workspaceId: str,
    request: Request,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    user=Depends(current_user),
    db=Depends(get_session),
):
    from ...core.errors import ApiError

    service = {"changes": change_page, "projects": project_page}.get(kind)
    if service is None:
        raise ApiError(404, "Report not found.", "Not Found")
    return await service(
        db,
        workspaceId,
        user,
        payload,
        request.app.state.settings.auth_jwt_secret,
        cursor=cursor,
        limit=limit,
    )
