from typing import Annotated

from fastapi import Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from .contracts import ArchiveKind, RestoreInput
from .repository import archive_page
from .service import restore_preview, restore

router = UtcAPIRouter(prefix="/api/v1/archive", tags=["archive"])


@router.get("")
async def archived(
    workspaceId: str,
    kind: ArchiveKind,
    request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    user=Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    return await archive_page(
        db,
        workspaceId,
        user["id"],
        kind,
        request.app.state.settings.auth_jwt_secret,
        limit=limit,
        cursor=cursor,
    )


@router.get("/{kind}/{identifier}/preview")
async def preview(
    kind: ArchiveKind,
    identifier: str,
    workspaceId: str,
    user=Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    return {"data": await restore_preview(db, workspaceId, user, kind, identifier)}


@router.post("/{kind}/{identifier}/restore")
async def restore_record(
    kind: ArchiveKind,
    identifier: str,
    workspaceId: str,
    payload: RestoreInput,
    user=Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    result = await restore(
        db, workspaceId, user, kind, identifier, payload.expectedUpdatedAt
    )
    await db.commit()
    return {"data": result}
