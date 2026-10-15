from datetime import datetime
from typing import Annotated, Literal

from fastapi import Depends, Query, Request
from ...core.downloads import private_download
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.csv_export import csv_bytes
from ...core.errors import ApiError
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from ..identity.password_reset import limit_request
from .contracts import AuditFilters
from .query import audit_page

router = UtcAPIRouter(prefix="/api/v1/audit", tags=["workspace-audit"])


def filter_input(
    actorId: Annotated[str | None, Query(max_length=100)] = None,
    entityType: Annotated[
        str | None, Query(max_length=40, pattern=r"^[a-z-]+$")
    ] = None,
    source: Literal["WEB", "AI", "SYSTEM", "UNKNOWN"] | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
):
    try:
        return AuditFilters(
            actorId=actorId,
            entityType=entityType,
            source=source,
            since=since,
            until=until,
        )
    except ValidationError as error:
        raise ApiError(
            400, "Audit end time must be after start time.", "Bad Request"
        ) from error


@router.get("")
async def events(
    workspaceId: str,
    request: Request,
    filters: AuditFilters = Depends(filter_input),
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    user=Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    return await audit_page(
        db,
        workspaceId,
        user["id"],
        request.app.state.settings.auth_jwt_secret,
        filters,
        limit=limit,
        cursor=cursor,
    )


@router.get("/export")
async def export(
    workspaceId: str,
    request: Request,
    filters: AuditFilters = Depends(filter_input),
    user=Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await limit_request(
        db, request.app.state.settings.auth_jwt_secret, "audit-export", user["id"], 20
    )
    result = await audit_page(
        db,
        workspaceId,
        user["id"],
        request.app.state.settings.auth_jwt_secret,
        filters,
        export=True,
    )
    content = csv_bytes(
        [
            "Event ID",
            "Created at (UTC)",
            "Source",
            "Action",
            "Actor",
            "Entity type",
            "Entity ID",
        ],
        [
            [
                row["id"],
                row["createdAt"].isoformat() + "Z",
                row["source"],
                row["action"],
                row["actor"]["name"] if row["actor"] else "System",
                row["entityType"],
                row["entityId"],
            ]
            for row in result["data"]
        ],
    )
    await db.commit()
    return private_download(content, "text/csv", "flowie-audit.csv")
