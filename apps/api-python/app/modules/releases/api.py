from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.dates import parse_date
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.projects import workspace_access, workspace_manager
from ..identity.auth import current_user
from .commands import (
    ARCHIVE_RELEASE_UPDATE_RELEASES,
    AUDIT_INSERT_AUDIT_LOGS,
    CREATE_RELEASE_INSERT_RELEASE_PROJECTS,
    CREATE_RELEASE_INSERT_RELEASES,
    UPDATE_RELEASE_DELETE_RELEASE_PROJECTS,
    UPDATE_RELEASE_INSERT_RELEASE_PROJECTS,
    update_release_update_releases_sql,
)
from .queries import (
    LIST_RELEASES_SELECT_RELEASES,
    PROJECT_IDS_SELECT_PROJECTS,
    RELEASE_SELECT_RELEASE_PROJECTS,
    RELEASE_SELECT_RELEASES,
)

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
        AUDIT_INSERT_AUDIT_LOGS,
        {
            'id': cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id,
            'action': action, 'entity_id': release_id,
            'metadata': json.dumps(metadata or {}), 'created_at': utcnow(),
        },
    )


async def _release(
    db: AsyncSession, release_id: str, workspace_id: str
) -> dict[str, Any]:
    result = await db.execute(
        RELEASE_SELECT_RELEASES,
        {'release_id': release_id, 'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Release not found.', 'Not Found')
    links = await db.execute(
        RELEASE_SELECT_RELEASE_PROJECTS,
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
        PROJECT_IDS_SELECT_PROJECTS,
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
    await workspace_access(db, workspaceId, user['id'])
    result = await db.execute(
        LIST_RELEASES_SELECT_RELEASES,
        {'workspace_id': workspaceId},
    )
    return {'data': [await _release(db, row['id'], workspaceId) for row in result.mappings().all()]}


@router.post('')
async def create_release(
    payload: CreateReleaseInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await workspace_manager(db, payload.workspaceId, user['id'])
    project_ids = await _project_ids(db, payload.workspaceId, payload.projectIds)
    release_id, now = cuid(), utcnow()
    try:
        await db.execute(
            CREATE_RELEASE_INSERT_RELEASES,
            {
                'id': release_id, 'workspace_id': payload.workspaceId, 'name': payload.name.strip(),
                'version': payload.version.strip(),
                'description': payload.description.strip() if payload.description else None,
                'status': payload.status, 'target_date': parse_date(payload.targetDate),
                'released_at': now if payload.status == 'released' else None,
                'created_by': user['id'], 'now': now,
            },
        )
        for project_id in project_ids:
            await db.execute(
                CREATE_RELEASE_INSERT_RELEASE_PROJECTS,
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
    await workspace_manager(db, workspaceId, user['id'])
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
    params: dict[str, Any] = {'release_id': release_id, 'now': utcnow()}
    for field, column in column_map.items():
        if field not in values:
            continue
        value = values[field]
        if field in {'name', 'version'} and isinstance(value, str):
            value = value.strip()
        elif field == 'description' and isinstance(value, str):
            value = value.strip() or None
        elif field == 'targetDate':
            value = parse_date(value)
        params[field] = value
        sets.append(f'{column} = :{field}')
    if 'status' in values:
        params['released_at'] = existing['releasedAt'] or utcnow() if values['status'] == 'released' else None
        sets.append('released_at = :released_at')
    try:
        if sets:
            await db.execute(
                update_release_update_releases_sql(sets),
                params,
            )
        if project_ids is not None:
            await db.execute(UPDATE_RELEASE_DELETE_RELEASE_PROJECTS, {'release_id': release_id})
            for project_id in project_ids:
                await db.execute(
                    UPDATE_RELEASE_INSERT_RELEASE_PROJECTS,
                    {'release_id': release_id, 'project_id': project_id, 'now': utcnow()},
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
    await workspace_manager(db, workspaceId, user['id'])
    release = await _release(db, release_id, workspaceId)
    now = utcnow()
    await db.execute(
        ARCHIVE_RELEASE_UPDATE_RELEASES,
        {'release_id': release_id, 'now': now},
    )
    await _audit(db, workspaceId, user['id'], 'release.archived', release_id, {
        'name': release['name'], 'version': release['version'],
    })
    await db.commit()
    return {'data': {'id': release_id, 'archivedAt': now}}
