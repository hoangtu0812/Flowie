from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.csv_export import csv_bytes
from ...core.downloads import private_download
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...core.xlsx_export import xlsx_bytes
from ...db.session import get_session
from ..identity.auth import current_user
from . import service
from .service import TIMESHEET_COLUMNS, WorklogInput

router = APIRouter(prefix="/api/v1", tags=["worklogs"])


@router.get("/issues/{issue_id}/worklogs")
async def list_worklogs(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    return {"data": await service.list_worklogs(db, issue_id, workspaceId, user["id"])}


@router.post("/issues/{issue_id}/worklogs")
async def create_worklog(
    issue_id: str,
    payload: WorklogInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    data = await service.create_worklog(db, issue_id, payload, user["id"])
    await db.commit()
    return {"data": data}


@router.put("/issues/{issue_id}/worklogs/{worklog_id}")
async def update_worklog(
    issue_id: str,
    worklog_id: str,
    payload: WorklogInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    data = await service.update_worklog(db, issue_id, worklog_id, payload, user["id"])
    await db.commit()
    return {"data": data}


@router.delete("/issues/{issue_id}/worklogs/{worklog_id}")
async def delete_worklog(
    issue_id: str,
    worklog_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    data = await service.delete_worklog(db, issue_id, worklog_id, workspaceId, user["id"])
    await db.commit()
    return {"data": data}


@router.get("/timesheet")
async def timesheet(
    workspaceId: str = Query(min_length=1),
    weekStart: date | None = None,
    teamId: str | None = None,
    projectId: str | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    return {"data": await service.timesheet(db, workspaceId, user["id"], weekStart, teamId, projectId)}


@router.get("/timesheet/export")
async def export_timesheet(
    workspaceId: str = Query(min_length=1),
    format: Literal["csv", "xlsx"] = "csv",
    weekStart: date | None = None,
    teamId: str | None = None,
    projectId: str | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> Response:
    start, rows = await service.timesheet_entries(db, workspaceId, user["id"], weekStart, teamId, projectId)
    name = f"flowie-timesheet-{start.isoformat()}"
    if format == "xlsx":
        return private_download(
            xlsx_bytes("Timesheet", TIMESHEET_COLUMNS, rows),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            f"{name}.xlsx",
        )
    return private_download(csv_bytes(TIMESHEET_COLUMNS, rows), "text/csv", f"{name}.csv")
