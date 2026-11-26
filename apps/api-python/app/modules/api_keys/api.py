from __future__ import annotations

from typing import Any

from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ..identity.auth import current_user
from . import service
from .service import SCOPES, ApiKeyInput

router = UtcAPIRouter(prefix="/api/v1/api-keys", tags=["api-keys"])


@router.get("")
async def list_keys(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    return {"data": await service.list_keys(db, workspaceId, user), "meta": {"scopes": sorted(SCOPES)}}


@router.post("", status_code=201)
async def create_key(
    payload: ApiKeyInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    return {"data": await service.create(db, workspaceId, user, payload)}


@router.delete("/{key_id}")
async def revoke_key(
    key_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await service.revoke(db, workspaceId, user, key_id)
    return {"data": {"id": key_id, "revoked": True}}


# Permanently removes a revoked or expired key; DELETE /{id} only revokes.
# VI: Xoá hẳn key đã thu hồi hoặc hết hạn; DELETE /{id} chỉ thu hồi.
@router.delete("/{key_id}/record")
async def delete_key(
    key_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await service.delete(db, workspaceId, user, key_id)
    return {"data": {"id": key_id, "deleted": True}}
