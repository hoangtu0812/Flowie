from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .native_projects import _workspace_access


router = APIRouter(prefix='/api/v1/views', tags=['views'])


class CreateViewInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    entityType: Literal['issue', 'project']
    filters: dict[str, Any] = Field(default_factory=dict)
    isShared: bool = False


async def _view(
    db: AsyncSession, view_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    result = await db.execute(
        text(
            '''SELECT view.id, view.workspace_id, view.created_by, view.name, view.description,
                      view.entity_type, view.filters, view.is_shared, view.created_at, view.updated_at,
                      creator.id AS creator_id, creator.name AS creator_name,
                      creator.avatar_url AS creator_avatar_url
               FROM saved_views view
               JOIN users creator ON creator.id = view.created_by
               WHERE view.id = :view_id AND view.workspace_id = :workspace_id
                 AND (view.is_shared = TRUE OR view.created_by = :user_id)
               LIMIT 1'''
        ),
        {'view_id': view_id, 'workspace_id': workspace_id, 'user_id': user_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Saved view not found.', 'Not Found')
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'createdById': row['created_by'],
        'name': row['name'], 'description': row['description'], 'entityType': row['entity_type'],
        'filters': row['filters'] or {}, 'isShared': row['is_shared'],
        'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'createdBy': {
            'id': row['creator_id'], 'name': row['creator_name'], 'avatarUrl': row['creator_avatar_url'],
        },
    }


@router.get('')
async def list_views(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''SELECT id FROM saved_views
               WHERE workspace_id = :workspace_id
                 AND (is_shared = TRUE OR created_by = :user_id)
               ORDER BY is_shared DESC, updated_at DESC'''
        ),
        {'workspace_id': workspaceId, 'user_id': user['id']},
    )
    return {'data': [
        await _view(db, row['id'], workspaceId, user['id']) for row in result.mappings().all()
    ]}


@router.get('/{view_id}')
async def get_view(
    view_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, workspaceId, user['id'])
    return {'data': await _view(db, view_id, workspaceId, user['id'])}


@router.post('')
async def create_view(
    payload: CreateViewInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user['id'])
    view_id = _cuid()
    await db.execute(
        text(
            '''INSERT INTO saved_views
               (id, workspace_id, created_by, name, description, entity_type, filters, is_shared, created_at, updated_at)
               VALUES (:id, :workspace_id, :created_by, :name, :description, :entity_type,
                       CAST(:filters AS jsonb), :is_shared, :now, :now)'''
        ),
        {
            'id': view_id, 'workspace_id': payload.workspaceId, 'created_by': user['id'],
            'name': payload.name.strip(), 'description': payload.description.strip() if payload.description else None,
            'entity_type': payload.entityType, 'filters': json.dumps(payload.filters),
            'is_shared': payload.isShared, 'now': _utcnow(),
        },
    )
    await db.commit()
    return {'data': await _view(db, view_id, payload.workspaceId, user['id'])}


@router.delete('/{view_id}')
async def delete_view(
    view_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''DELETE FROM saved_views
               WHERE id = :view_id AND workspace_id = :workspace_id AND created_by = :user_id
               RETURNING id'''
        ),
        {'view_id': view_id, 'workspace_id': workspaceId, 'user_id': user['id']},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, 'Only the creator can delete this saved view.', 'Forbidden')
    await db.commit()
    return {'data': {'id': view_id, 'deleted': True}}
