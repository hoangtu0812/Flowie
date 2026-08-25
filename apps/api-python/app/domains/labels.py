from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .native_projects import _workspace_access
from .teams import _manager


router = APIRouter(prefix='/api/v1/labels', tags=['labels'])


class CreateLabelInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    description: str | None = Field(default=None, max_length=500)
    groupId: str | None = None


class UpdateLabelInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=r'^#[0-9a-fA-F]{6}$')
    description: str | None = Field(default=None, max_length=500)
    groupId: str | None = None


class CreateLabelGroupInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)


class UpdateLabelGroupInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)


def _clean_name(value: str, field: str = 'name') -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ApiError(400, f'{field} must not be empty.', 'Bad Request')
    return cleaned


def _clean_description(value: str | None) -> str | None:
    return value.strip() or None if value is not None else None


async def _group_exists(db: AsyncSession, group_id: str, workspace_id: str) -> None:
    result = await db.execute(
        text('SELECT 1 FROM label_groups WHERE id = :id AND workspace_id = :workspace_id'),
        {'id': group_id, 'workspace_id': workspace_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(404, 'Label group not found.', 'Not Found')


async def _label_record(
    db: AsyncSession, label_id: str, workspace_id: str
) -> dict[str, Any]:
    result = await db.execute(
        text(
            '''SELECT l.id, l.workspace_id, l.group_id, l.name, l.color, l.description,
                      l.created_at, l.updated_at, g.name AS group_name,
                      COUNT(il.label_id)::int AS issue_count, MAX(il.created_at) AS last_applied
               FROM labels l
               LEFT JOIN label_groups g ON g.id = l.group_id
               LEFT JOIN issue_labels il ON il.label_id = l.id
               WHERE l.id = :label_id AND l.workspace_id = :workspace_id
               GROUP BY l.id, g.name
               LIMIT 1'''
        ),
        {'label_id': label_id, 'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Label not found.', 'Not Found')
    return {
        'id': row['id'],
        'workspaceId': row['workspace_id'],
        'groupId': row['group_id'],
        'name': row['name'],
        'color': row['color'],
        'description': row['description'],
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
        'lastApplied': row['last_applied'],
        'group': (
            {'id': row['group_id'], 'name': row['group_name']}
            if row['group_id']
            else None
        ),
        '_count': {'issueLinks': row['issue_count']},
    }


async def _group_record(
    db: AsyncSession, group_id: str, workspace_id: str
) -> dict[str, Any]:
    result = await db.execute(
        text(
            '''SELECT g.id, g.workspace_id, g.name, g.description, g.created_at, g.updated_at,
                      COUNT(l.id)::int AS label_count
               FROM label_groups g
               LEFT JOIN labels l ON l.group_id = g.id
               WHERE g.id = :group_id AND g.workspace_id = :workspace_id
               GROUP BY g.id
               LIMIT 1'''
        ),
        {'group_id': group_id, 'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Label group not found.', 'Not Found')
    return {
        'id': row['id'],
        'workspaceId': row['workspace_id'],
        'name': row['name'],
        'description': row['description'],
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
        '_count': {'labels': row['label_count']},
    }


@router.get('')
async def list_labels(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''SELECT l.id FROM labels l
               WHERE l.workspace_id = :workspace_id
               ORDER BY l.name ASC'''
        ),
        {'workspace_id': workspaceId},
    )
    return {'data': [await _label_record(db, row['id'], workspaceId) for row in result.mappings().all()]}


@router.post('')
async def create_label(
    payload: CreateLabelInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager(db, payload.workspaceId, user['id'])
    if payload.groupId:
        await _group_exists(db, payload.groupId, payload.workspaceId)
    label_id, now = _cuid(), _utcnow()
    try:
        await db.execute(
            text(
                '''INSERT INTO labels
                   (id, workspace_id, group_id, name, color, description, created_at, updated_at)
                   VALUES (:id, :workspace_id, :group_id, :name, :color, :description, :now, :now)'''
            ),
            {
                'id': label_id,
                'workspace_id': payload.workspaceId,
                'group_id': payload.groupId,
                'name': _clean_name(payload.name),
                'color': payload.color,
                'description': _clean_description(payload.description),
                'now': now,
            },
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A label with this name already exists.', 'Conflict') from error
    return {'data': await _label_record(db, label_id, payload.workspaceId)}


@router.patch('/{label_id}')
async def update_label(
    label_id: str,
    payload: UpdateLabelInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    await _label_record(db, label_id, workspaceId)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return {'data': await _label_record(db, label_id, workspaceId)}
    if 'name' in values:
        values['name'] = _clean_name(values['name'])
    if 'description' in values:
        values['description'] = _clean_description(values['description'])
    if values.get('groupId'):
        await _group_exists(db, values['groupId'], workspaceId)
    column_names = {'groupId': 'group_id'}
    assignments, params = [], {'id': label_id, 'now': _utcnow()}
    for key, value in values.items():
        column = column_names.get(key, key)
        assignments.append(f'{column} = :{key}')
        params[key] = value
    try:
        await db.execute(
            text(f"UPDATE labels SET {', '.join(assignments)}, updated_at = :now WHERE id = :id"),
            params,
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A label with this name already exists.', 'Conflict') from error
    return {'data': await _label_record(db, label_id, workspaceId)}


@router.delete('/{label_id}')
async def delete_label(
    label_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    await _label_record(db, label_id, workspaceId)
    await db.execute(text('DELETE FROM labels WHERE id = :id'), {'id': label_id})
    await db.commit()
    return {'data': {'id': label_id, 'deleted': True}}


@router.get('/groups')
async def list_label_groups(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(
        text('SELECT id FROM label_groups WHERE workspace_id = :workspace_id ORDER BY name ASC'),
        {'workspace_id': workspaceId},
    )
    return {'data': [await _group_record(db, row['id'], workspaceId) for row in result.mappings().all()]}


@router.post('/groups')
async def create_label_group(
    payload: CreateLabelGroupInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager(db, payload.workspaceId, user['id'])
    group_id, now = _cuid(), _utcnow()
    try:
        await db.execute(
            text(
                '''INSERT INTO label_groups
                   (id, workspace_id, name, description, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :description, :now, :now)'''
            ),
            {
                'id': group_id,
                'workspace_id': payload.workspaceId,
                'name': _clean_name(payload.name),
                'description': _clean_description(payload.description),
                'now': now,
            },
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A label group with this name already exists.', 'Conflict') from error
    return {'data': await _group_record(db, group_id, payload.workspaceId)}


@router.patch('/groups/{group_id}')
async def update_label_group(
    group_id: str,
    payload: UpdateLabelGroupInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    await _group_record(db, group_id, workspaceId)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return {'data': await _group_record(db, group_id, workspaceId)}
    if 'name' in values:
        values['name'] = _clean_name(values['name'])
    if 'description' in values:
        values['description'] = _clean_description(values['description'])
    assignments = ', '.join(f'{key} = :{key}' for key in values)
    try:
        await db.execute(
            text(f'UPDATE label_groups SET {assignments}, updated_at = :now WHERE id = :id'),
            {**values, 'id': group_id, 'now': _utcnow()},
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A label group with this name already exists.', 'Conflict') from error
    return {'data': await _group_record(db, group_id, workspaceId)}


@router.delete('/groups/{group_id}')
async def delete_label_group(
    group_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    await _group_record(db, group_id, workspaceId)
    await db.execute(text('DELETE FROM label_groups WHERE id = :id'), {'id': group_id})
    await db.commit()
    return {'data': {'id': group_id, 'deleted': True}}
