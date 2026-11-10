"""SharePoint publishing routes: workspace connection (administrators), connection test
and the SharePoint folder of each project.
VI: Route phát hành SharePoint: kết nối của workspace (quản trị viên), kiểm tra kết nối và
VI: thư mục SharePoint của từng dự án.
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..identity.auth import current_user
from ..integrations.api import integration_manager
from ..work_items.document_tree import project_document_team
from .commands import (
    PUT_PROJECT_FOLDER_UPDATE_PROJECTS,
)
from .graph import SharePointError
from .service import (
    checked_folder_url,
    connection_payload,
    connection_row,
    graph_client,
    project_publishing,
    save_connection,
)

router = APIRouter(prefix="/api/v1/integrations/sharepoint", tags=["sharepoint"])


class ConnectionInput(BaseModel):
    tenantId: str = Field(min_length=2, max_length=100)
    clientId: str = Field(min_length=2, max_length=100)
    clientSecret: str | None = Field(default=None, max_length=500)
    enabled: bool = True
    publishAttachments: bool = False


class FolderInput(BaseModel):
    folderUrl: str | None = Field(default=None, max_length=2000)


@router.get("")
async def get_connection(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await integration_manager(db, workspaceId, user["id"])
    return {"data": connection_payload(await connection_row(db, workspaceId))}


@router.put("")
async def put_connection(
    payload: ConnectionInput,
    request: Request,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await integration_manager(db, workspaceId, user["id"])
    data = await save_connection(
        db, request.app.state.settings, workspaceId, user["id"],
        tenant_id=payload.tenantId.strip(), client_id=payload.clientId.strip(),
        client_secret=(payload.clientSecret or "").strip() or None, enabled=payload.enabled,
        publish_attachments=payload.publishAttachments,
    )
    await db.commit()
    return {"data": data}


@router.post("/test")
async def test_folder(
    payload: FolderInput,
    request: Request,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Sign in with the saved connection and resolve a folder URL without uploading.
    VI: Đăng nhập bằng kết nối đã lưu và phân giải URL thư mục mà không tải file lên."""
    await integration_manager(db, workspaceId, user["id"])
    row = await connection_row(db, workspaceId)
    if not row:
        raise ApiError(400, "Save the SharePoint connection first.", "Bad Request")
    url = checked_folder_url(payload.folderUrl)
    if not url:
        raise ApiError(400, "A folder URL is required.", "Bad Request")
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            target = await graph_client(http, request.app.state.settings, row).resolve_folder(url)
    except SharePointError as error:
        raise ApiError(400, str(error), "Bad Request") from error
    except httpx.HTTPError as error:
        raise ApiError(502, "SharePoint could not be reached from the server.", "Bad Gateway") from error
    return {"data": {"library": target["library"], "folderPath": target["folderPath"]}}


@router.get("/projects/{projectId}")
async def get_project_folder(
    projectId: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await project_document_team(db, workspaceId, projectId, user["id"])
    return {"data": await project_publishing(db, workspaceId, projectId)}


@router.put("/projects/{projectId}")
async def put_project_folder(
    projectId: str,
    payload: FolderInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await integration_manager(db, workspaceId, user["id"])
    updated = (
        await db.execute(
            PUT_PROJECT_FOLDER_UPDATE_PROJECTS,
            {"url": checked_folder_url(payload.folderUrl), "now": utcnow(), "id": projectId, "workspace": workspaceId},
        )
    ).scalar_one_or_none()
    if not updated:
        raise ApiError(404, "Project not found.", "Not Found")
    await db.commit()
    return {"data": await project_publishing(db, workspaceId, projectId)}
