from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .native_projects import _date, _workspace_access, _workspace_manager


router = APIRouter(prefix='/api/v1/releases', tags=['releases'])
ReleaseStatus = Literal['planned', 'in-progress', 'released', 'canceled']


class CreateReleaseInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=160)
    version: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=5000)
    status: ReleaseStatus = 'planned'
    targetDate: str | None = None
    projectIds: list[str] = Field(default_factory=list, max_length=100)


class UpdateReleaseInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    version: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=5000)
    status: ReleaseStatus | None = None
    targetDate: str | None = None
    projectIds: list[str] | None = Field(default=None, max_length=100)


async def _audit(
    db: AsyncSession,
    workspace_id: str,
    actor_id: str,
    action: str,
    release_id: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    await db.execute(
        text(
            '''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :workspace_id, :actor_id, :action, 'release', :entity_id,
                       CAST(:metadata AS jsonb), :created_at)'''
        ),
        {
            'id': _cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id,
            'action': action, 'entity_id': release_id,
            'metadata': json.dumps(metadata or {}), 'created_at': _utcnow(),
        },
    )


async def _release(
    db: AsyncSession, release_id: str, workspace_id: str
) -> dict[str, Any]:
    result = await db.execute(
        text(
            '''SELECT release.id, release.workspace_id, release.name, release.version, release.description,
                      release.status, release.target_date, release.released_at, release.created_by,
                      release.created_at, release.updated_at,
                      creator.id AS creator_id, creator.name AS creator_name, creator.avatar_url AS creator_avatar_url
               FROM releases release
               JOIN users creator ON creator.id = release.created_by
               WHERE release.id = :release_id AND release.workspace_id = :workspace_id
                 AND release.archived_at IS NULL'''
        ),
        {'release_id': release_id, 'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Release not found.', 'Not Found')
    links = await db.execute(
        text(
            '''SELECT link.release_id, link.project_id, link.created_at,
                      project.id AS project_id_value, project.name AS project_name,
                      project.identifier AS project_identifier
               FROM release_projects link
               JOIN projects project ON project.id = link.project_id
               WHERE link.release_id = :release_id AND project.archived_at IS NULL
               ORDER BY link.created_at ASC'''
        ),
        {'release_id': release_id},
    )
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'name': row['name'],
        'version': row['version'], 'description': row['description'], 'status': row['status'],
        'targetDate': row['target_date'], 'releasedAt': row['released_at'],
        'createdById': row['created_by'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'createdBy': {
            'id': row['creator_id'], 'name': row['creator_name'], 'avatarUrl': row['creator_avatar_url'],
        },
        'projectLinks': [
            {
                'releaseId': link['release_id'], 'projectId': link['project_id'],
                'createdAt': link['created_at'],
                'project': {
                    'id': link['project_id_value'], 'name': link['project_name'],
                    'identifier': link['project_identifier'],
                },
            }
            for link in links.mappings().all()
        ],
    }


async def _project_ids(
    db: AsyncSession, workspace_id: str, project_ids: list[str]
) -> list[str]:
    unique_ids = list(dict.fromkeys(project_ids))
    if not unique_ids:
        return []
    result = await db.execute(
        text(
            '''SELECT id FROM projects
               WHERE workspace_id = :workspace_id AND archived_at IS NULL AND id = ANY(:project_ids)'''
        ),
        {'workspace_id': workspace_id, 'project_ids': unique_ids},
    )
    if len(result.mappings().all()) != len(unique_ids):
        raise ApiError(400, 'Every release project must belong to this workspace.', 'Bad Request')
    return unique_ids


@router.get('')
async def list_releases(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''SELECT id FROM releases
               WHERE workspace_id = :workspace_id AND archived_at IS NULL
               ORDER BY target_date DESC NULLS LAST, updated_at DESC'''
        ),
        {'workspace_id': workspaceId},
    )
    return {'data': [await _release(db, row['id'], workspaceId) for row in result.mappings().all()]}


@router.post('')
async def create_release(
    payload: CreateReleaseInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, payload.workspaceId, user['id'])
    project_ids = await _project_ids(db, payload.workspaceId, payload.projectIds)
    release_id, now = _cuid(), _utcnow()
    try:
        await db.execute(
            text(
                '''INSERT INTO releases
                   (id, workspace_id, name, version, description, status, target_date, released_at,
                    created_by, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :version, :description, :status, :target_date,
                           :released_at, :created_by, :now, :now)'''
            ),
            {
                'id': release_id, 'workspace_id': payload.workspaceId, 'name': payload.name.strip(),
                'version': payload.version.strip(),
                'description': payload.description.strip() if payload.description else None,
                'status': payload.status, 'target_date': _date(payload.targetDate),
                'released_at': now if payload.status == 'released' else None,
                'created_by': user['id'], 'now': now,
            },
        )
        for project_id in project_ids:
            await db.execute(
                text('INSERT INTO release_projects (release_id, project_id, created_at) VALUES (:release_id, :project_id, :now)'),
                {'release_id': release_id, 'project_id': project_id, 'now': now},
            )
        await _audit(db, payload.workspaceId, user['id'], 'release.created', release_id, {
            'name': payload.name.strip(), 'version': payload.version.strip(), 'projectIds': project_ids,
        })
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A release with this version already exists.', 'Conflict') from error
    return {'data': await _release(db, release_id, payload.workspaceId)}


@router.patch('/{release_id}')
async def update_release(
    release_id: str,
    payload: UpdateReleaseInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    existing = await _release(db, release_id, workspaceId)
    values = payload.model_dump(exclude_unset=True)
    project_ids = None
    if 'projectIds' in values:
        project_ids = await _project_ids(db, workspaceId, values.pop('projectIds') or [])
    column_map = {
        'name': 'name', 'version': 'version', 'description': 'description', 'status': 'status',
        'targetDate': 'target_date',
    }
    sets: list[str] = []
    params: dict[str, Any] = {'release_id': release_id, 'now': _utcnow()}
    for field, column in column_map.items():
        if field not in values:
            continue
        value = values[field]
        if field in {'name', 'version'} and isinstance(value, str):
            value = value.strip()
        elif field == 'description' and isinstance(value, str):
            value = value.strip() or None
        elif field == 'targetDate':
            value = _date(value)
        params[field] = value
        sets.append(f'{column} = :{field}')
    if 'status' in values:
        params['released_at'] = existing['releasedAt'] or _utcnow() if values['status'] == 'released' else None
        sets.append('released_at = :released_at')
    try:
        if sets:
            await db.execute(
                text(f"UPDATE releases SET {', '.join(sets)}, updated_at = :now WHERE id = :release_id"),
                params,
            )
        if project_ids is not None:
            await db.execute(text('DELETE FROM release_projects WHERE release_id = :release_id'), {'release_id': release_id})
            for project_id in project_ids:
                await db.execute(
                    text('INSERT INTO release_projects (release_id, project_id, created_at) VALUES (:release_id, :project_id, :now)'),
                    {'release_id': release_id, 'project_id': project_id, 'now': _utcnow()},
                )
        if sets or project_ids is not None:
            await _audit(db, workspaceId, user['id'], 'release.updated', release_id, {
                **values, **({'projectIds': project_ids} if project_ids is not None else {}),
            })
            await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A release with this version already exists.', 'Conflict') from error
    return {'data': await _release(db, release_id, workspaceId)}


@router.delete('/{release_id}')
async def archive_release(
    release_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    release = await _release(db, release_id, workspaceId)
    now = _utcnow()
    await db.execute(
        text('UPDATE releases SET archived_at = :now, updated_at = :now WHERE id = :release_id'),
        {'release_id': release_id, 'now': now},
    )
    await _audit(db, workspaceId, user['id'], 'release.archived', release_id, {
        'name': release['name'], 'version': release['version'],
    })
    await db.commit()
    return {'data': {'id': release_id, 'archivedAt': now}}
