from typing import Literal
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from ..identity.password_reset import limit_request
from .bulk_contracts import BulkPreview
from .bulk_service import bulk_preview, bulk_result, bulk_command
from ..access.projects import _workspace_access

router = UtcAPIRouter(prefix="/api/v1/bulk-issues", tags=["bulk-issues"])


@router.get("")
async def recent(
    workspaceId: str,
    user=Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await _workspace_access(db, workspaceId, user["id"])
    rows = (
        (
            await db.execute(
                text("""SELECT id,state,created_at AS "createdAt",expires_at AS "expiresAt"
        FROM bulk_operations WHERE workspace_id=:workspace AND actor_id=:user ORDER BY created_at DESC,id DESC LIMIT 20"""),
                {"workspace": workspaceId, "user": user["id"]},
            )
        )
        .mappings()
        .all()
    )
    return {"data": [dict(row) for row in rows]}


@router.post("/preview")
async def preview(
    payload: BulkPreview,
    request: Request,
    user=Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await limit_request(
        db, request.app.state.settings.auth_jwt_secret, "bulk-preview", user["id"], 60
    )
    result = await bulk_preview(db, user, payload)
    await db.commit()
    return {"data": result}


@router.get("/{identifier}")
async def result(
    identifier: str,
    workspaceId: str,
    user=Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    return {"data": await bulk_result(db, user, workspaceId, identifier)}


@router.post("/{identifier}/{command}")
async def command(
    identifier: str,
    command: Literal["execute", "cancel"],
    workspaceId: str,
    user=Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    result = await bulk_command(db, user, workspaceId, identifier, command)
    await db.commit()
    return {"data": result}
