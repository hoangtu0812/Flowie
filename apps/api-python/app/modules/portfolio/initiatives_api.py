from __future__ import annotations

import json
from typing import Annotated, Any, Literal
from urllib.parse import urlparse

from fastapi import Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.audit_context import audit_source
from ...core.clock import utcnow
from ...core.dates import parse_date
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.membership import manager
from ..access.project_scope import project_read_scope
from ..access.projects import workspace_access
from ..identity.auth import current_user
from .commands import (
    ADD_RESOURCE_INSERT_INITIATIVE_RESOURCES,
    ARCHIVE_INITIATIVE_UPDATE_INITIATIVES,
    AUDIT_INSERT_AUDIT_LOGS,
    CREATE_INITIATIVE_INSERT_INITIATIVES,
    CREATE_UPDATE_INSERT_INITIATIVE_UPDATES,
    CREATE_UPDATE_UPDATE_INITIATIVES,
    LINK_LABEL_INSERT_INITIATIVE_LABEL_LINKS,
    LINK_PROJECT_INSERT_INITIATIVE_PROJECTS,
    UNLINK_LABEL_DELETE_INITIATIVE_LABEL_LINKS,
    UNLINK_PROJECT_DELETE_INITIATIVE_PROJECTS,
    update_initiative_update_initiatives_sql,
)
from .queries import (
    ACTIVE_MEMBER_SELECT_WORKSPACE_MEMBERS,
    INITIATIVE_SELECT_INITIATIVE_LABEL_LINKS,
    INITIATIVE_SELECT_INITIATIVE_PROJECTS,
    INITIATIVE_SELECT_INITIATIVE_RESOURCES,
    INITIATIVE_SELECT_INITIATIVE_UPDATES,
    INITIATIVE_SELECT_INITIATIVES,
    LINK_LABEL_SELECT_LABELS,
    link_project_select_projects_sql,
)

router = APIRouter(prefix='/api/v1/_native/initiatives', tags=['native-initiatives'])
public_router = APIRouter(prefix='/api/v1/initiatives', tags=['initiatives'])
InitiativeStatus = Literal['planned', 'active', 'completed', 'canceled']


class CreateInitiativeInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    status: InitiativeStatus = 'planned'
    priority: str = Field(default='none', max_length=32)
    health: str = Field(default='no-update', max_length=32)
    icon: str | None = Field(default='🎯', max_length=16)
    ownerId: str | None = None
    targetDate: str | None = None


class UpdateInitiativeInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    status: InitiativeStatus | None = None
    priority: str | None = Field(default=None, max_length=32)
    health: str | None = Field(default=None, max_length=32)
    icon: str | None = Field(default=None, max_length=16)
    ownerId: str | None = None
    targetDate: str | None = None


class ProjectLinkInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    projectId: str = Field(min_length=1)


class InitiativeLabelLinkInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    labelId: str = Field(min_length=1)


class InitiativeUpdateInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    body: str = Field(min_length=1, max_length=5000)
    health: str | None = Field(default=None, max_length=32)


class InitiativeResourceInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=1, max_length=2000)


async def _active_member(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        ACTIVE_MEMBER_SELECT_WORKSPACE_MEMBERS,
        {'workspace_id': workspace_id, 'user_id': user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(404, 'Initiative owner must be an active workspace member.', 'Not Found')


async def _audit(
    db: AsyncSession, workspace_id: str, actor_id: str, action: str, initiative_id: str, metadata: dict[str, Any] | None = None
) -> None:
    await db.execute(
        AUDIT_INSERT_AUDIT_LOGS,
        {
            'id': cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id, 'action': action,
            'entity_id': initiative_id, 'metadata': json.dumps({**(metadata or {}),'source':audit_source.get()}), 'now': utcnow(),
        },
    )


async def _project(db: AsyncSession, project_id: str, workspace_id: str, user_id: str) -> dict[str, Any] | None:
    from .projects import project_summaries
    return (await project_summaries(db,workspace_id,user_id,[project_id])).get(project_id)


async def _initiative(db: AsyncSession, initiative_id: str, workspace_id: str, user_id: str) -> dict[str, Any]:
    await workspace_access(db, workspace_id, user_id)
    result = await db.execute(
        INITIATIVE_SELECT_INITIATIVES,
        {'initiative_id': initiative_id, 'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Initiative not found.', 'Not Found')
    links = await db.execute(
        INITIATIVE_SELECT_INITIATIVE_PROJECTS,
        {'initiative_id': initiative_id},
    )
    from .projects import project_summaries
    link_rows=links.mappings().all()
    projects=await project_summaries(db,workspace_id,user_id,[link['project_id'] for link in link_rows])
    project_links=[{'initiativeId':initiative_id,'projectId':link['project_id'],'createdAt':link['created_at'],'project':projects[link['project_id']]}
        for link in link_rows if link['project_id'] in projects]
    labels = await db.execute(
        INITIATIVE_SELECT_INITIATIVE_LABEL_LINKS,
        {'initiative_id': initiative_id, 'workspace_id': workspace_id},
    )
    updates = await db.execute(
        INITIATIVE_SELECT_INITIATIVE_UPDATES,
        {'initiative_id': initiative_id},
    )
    resources = await db.execute(
        INITIATIVE_SELECT_INITIATIVE_RESOURCES,
        {'initiative_id': initiative_id},
    )
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'name': row['name'], 'description': row['description'],
        'status': row['status'], 'priority': row['priority'], 'health': row['health'], 'icon': row['icon'],
        'ownerId': row['owner_id'], 'targetDate': row['target_date'], 'archivedAt': row['archived_at'],
        'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'owner': {'id': row['owner_id_value'], 'name': row['owner_name'], 'avatarUrl': row['owner_avatar_url']} if row['owner_id_value'] else None,
        'projectLinks': project_links,
        'labelLinks': [
            {
                'initiativeId': initiative_id,
                'labelId': label['id'],
                'createdAt': label['linked_at'],
                'label': {
                    'id': label['id'], 'workspaceId': label['workspace_id'], 'name': label['name'],
                    'color': label['color'], 'description': label['description'],
                    'createdAt': label['created_at'], 'updatedAt': label['updated_at'],
                },
            }
            for label in labels.mappings().all()
        ],
        'updates': [
            {'id': update['id'], 'workspaceId': update['workspace_id'], 'initiativeId': update['initiative_id'], 'body': update['body'], 'health': update['health'], 'createdAt': update['created_at'], 'updatedAt': update['updated_at'], 'author': {'id': update['author_id_value'], 'name': update['author_name'], 'avatarUrl': update['author_avatar_url']}}
            for update in updates.mappings().all()
        ],
        'resources': [
            {'id': resource['id'], 'workspaceId': resource['workspace_id'], 'initiativeId': resource['initiative_id'], 'label': resource['label'], 'url': resource['url'], 'createdAt': resource['created_at'], 'updatedAt': resource['updated_at'], 'createdBy': {'id': resource['creator_id_value'], 'name': resource['creator_name'], 'avatarUrl': resource['creator_avatar_url']}}
            for resource in resources.mappings().all()
        ],
        '_count': {'projectLinks': len(project_links)},
    }


@router.get('')
@public_router.get('')
async def list_initiatives(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session), *,
    # FastAPI injects the request through the plain `Request` annotation; None is only for direct
    # calls outside a request, which read settings from the environment.
    # VI: FastAPI inject request qua annotation `Request` thuần; None chỉ dành cho lời gọi trực tiếp
    # VI: ngoài request, khi đó settings lấy từ biến môi trường.
    request: Request = None,  # type: ignore[assignment]
    limit: Annotated[int, Query(ge=1,le=100)] = 100, cursor: Annotated[str | None, Query(max_length=2000)] = None) -> dict:
    from ...core.config import Settings
    from .initiatives import initiative_page
    await workspace_access(db,workspaceId,user['id'])
    settings=request.app.state.settings if request else Settings.from_environment()
    return await initiative_page(db,workspaceId,user['id'],settings.auth_jwt_secret,limit=limit,cursor=cursor)


@router.post('')
@public_router.post('')
async def create_initiative(payload: CreateInitiativeInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, payload.workspaceId, user['id'])
    owner_id = payload.ownerId or user['id']
    await _active_member(db, payload.workspaceId, owner_id)
    initiative_id, now = cuid(), utcnow()
    await db.execute(
        CREATE_INITIATIVE_INSERT_INITIATIVES,
        {'id': initiative_id, 'workspace_id': payload.workspaceId, 'name': payload.name.strip(), 'description': payload.description, 'status': payload.status, 'priority': payload.priority, 'health': payload.health, 'icon': payload.icon, 'owner_id': owner_id, 'target_date': parse_date(payload.targetDate), 'now': now},
    )
    await _audit(db, payload.workspaceId, user['id'], 'initiative.created', initiative_id, {'name': payload.name.strip()})
    await db.commit()
    return {'data': await _initiative(db, initiative_id, payload.workspaceId, user['id'])}


@router.get('/{initiative_id}')
@public_router.get('/{initiative_id}')
async def get_initiative(initiative_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return {'data': await _initiative(db, initiative_id, workspaceId, user['id'])}


@router.patch('/{initiative_id}')
@public_router.patch('/{initiative_id}')
async def update_initiative(initiative_id: str, payload: UpdateInitiativeInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, workspaceId, user['id'])
    await _initiative(db, initiative_id, workspaceId, user['id'])
    values = payload.model_dump(exclude_unset=True)
    if 'ownerId' in values and values['ownerId']:
        await _active_member(db, workspaceId, values['ownerId'])
    column_map = {'name': 'name', 'description': 'description', 'status': 'status', 'priority': 'priority', 'health': 'health', 'icon': 'icon', 'ownerId': 'owner_id', 'targetDate': 'target_date'}
    params: dict[str, Any] = {'initiative_id': initiative_id, 'now': utcnow()}
    sets = []
    for field, column in column_map.items():
        if field in values:
            value = parse_date(values[field]) if field == 'targetDate' else values[field]
            params[field] = value.strip() if field in {'name', 'description'} and isinstance(value, str) else value
            sets.append(f'{column} = :{field}')
    if sets:
        await db.execute(update_initiative_update_initiatives_sql(sets), params)
        await _audit(db, workspaceId, user['id'], 'initiative.updated', initiative_id, values)
        await db.commit()
    return {'data': await _initiative(db, initiative_id, workspaceId, user['id'])}


@router.delete('/{initiative_id}')
@public_router.delete('/{initiative_id}')
async def archive_initiative(initiative_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, workspaceId, user['id'])
    await _initiative(db, initiative_id, workspaceId, user['id'])
    now = utcnow()
    await db.execute(ARCHIVE_INITIATIVE_UPDATE_INITIATIVES, {'initiative_id': initiative_id, 'now': now})
    await _audit(db, workspaceId, user['id'], 'initiative.archived', initiative_id)
    await db.commit()
    return {'data': {'id': initiative_id, 'archivedAt': now}}


@router.post('/{initiative_id}/projects')
@public_router.post('/{initiative_id}/projects')
async def link_project(initiative_id: str, payload: ProjectLinkInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, payload.workspaceId, user['id'])
    await _initiative(db, initiative_id, payload.workspaceId, user['id'])
    project = await db.execute(link_project_select_projects_sql(project_read_scope), {'project_id': payload.projectId, 'workspace': payload.workspaceId, 'user': user['id']})
    row = project.mappings().first()
    if not row:
        raise ApiError(404, 'Initiative or project not found.', 'Not Found')
    await db.execute(LINK_PROJECT_INSERT_INITIATIVE_PROJECTS, {'initiative_id': initiative_id, 'project_id': payload.projectId})
    await _audit(db, payload.workspaceId, user['id'], 'initiative.project.linked', initiative_id, {'projectId': payload.projectId, 'projectName': row['name']})
    await db.commit()
    return {'data': {'initiativeId': initiative_id, 'projectId': payload.projectId}}


@router.delete('/{initiative_id}/projects/{project_id}')
@public_router.delete('/{initiative_id}/projects/{project_id}')
async def unlink_project(initiative_id: str, project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, workspaceId, user['id'])
    await _initiative(db, initiative_id, workspaceId, user['id'])
    await db.execute(UNLINK_PROJECT_DELETE_INITIATIVE_PROJECTS, {'initiative_id': initiative_id, 'project_id': project_id})
    await _audit(db, workspaceId, user['id'], 'initiative.project.unlinked', initiative_id, {'projectId': project_id})
    await db.commit()
    return {'data': {'initiativeId': initiative_id, 'projectId': project_id, 'removed': True}}


@router.post('/{initiative_id}/labels')
@public_router.post('/{initiative_id}/labels')
async def link_label(initiative_id: str, payload: InitiativeLabelLinkInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, payload.workspaceId, user['id'])
    await _initiative(db, initiative_id, payload.workspaceId, user['id'])
    result = await db.execute(
        LINK_LABEL_SELECT_LABELS,
        {'label_id': payload.labelId, 'workspace_id': payload.workspaceId},
    )
    label = result.mappings().first()
    if not label:
        raise ApiError(404, 'Label not found.', 'Not Found')
    await db.execute(
        LINK_LABEL_INSERT_INITIATIVE_LABEL_LINKS,
        {'initiative_id': initiative_id, 'label_id': payload.labelId},
    )
    await _audit(db, payload.workspaceId, user['id'], 'initiative.label.linked', initiative_id, {'labelId': payload.labelId, 'labelName': label['name']})
    await db.commit()
    return {'data': {'initiativeId': initiative_id, 'labelId': payload.labelId}}


@router.delete('/{initiative_id}/labels/{label_id}')
@public_router.delete('/{initiative_id}/labels/{label_id}')
async def unlink_label(initiative_id: str, label_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, workspaceId, user['id'])
    await _initiative(db, initiative_id, workspaceId, user['id'])
    await db.execute(
        UNLINK_LABEL_DELETE_INITIATIVE_LABEL_LINKS,
        {'initiative_id': initiative_id, 'label_id': label_id},
    )
    await _audit(db, workspaceId, user['id'], 'initiative.label.unlinked', initiative_id, {'labelId': label_id})
    await db.commit()
    return {'data': {'initiativeId': initiative_id, 'labelId': label_id, 'removed': True}}


@router.get('/{initiative_id}/activity')
@public_router.get('/{initiative_id}/activity')
async def initiative_activity(initiative_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session), *,
    # FastAPI injects the request through the plain `Request` annotation; None is only for direct
    # calls outside a request, which read settings from the environment.
    # VI: FastAPI inject request qua annotation `Request` thuần; None chỉ dành cho lời gọi trực tiếp
    # VI: ngoài request, khi đó settings lấy từ biến môi trường.
    request: Request = None,  # type: ignore[assignment]
    limit: Annotated[int, Query(ge=1,le=100)] = 50, cursor: Annotated[str | None, Query(max_length=2000)] = None) -> dict:
    from ...core.config import Settings
    from .history import history_page
    settings=request.app.state.settings if request else Settings.from_environment()
    return await history_page(db,workspaceId,user['id'],settings.auth_jwt_secret,'initiative_activity',initiative_id,limit=limit,cursor=cursor)


@router.get('/{initiative_id}/updates')
@public_router.get('/{initiative_id}/updates')
async def initiative_updates(initiative_id: str,workspaceId: str = Query(min_length=1),user: Any = Depends(current_user),db: AsyncSession = Depends(get_session), *,
    # FastAPI injects the request through the plain `Request` annotation; None is only for direct
    # calls outside a request, which read settings from the environment.
    # VI: FastAPI inject request qua annotation `Request` thuần; None chỉ dành cho lời gọi trực tiếp
    # VI: ngoài request, khi đó settings lấy từ biến môi trường.
    request: Request = None,  # type: ignore[assignment]
    limit: Annotated[int, Query(ge=1,le=100)] = 50, cursor: Annotated[str | None, Query(max_length=2000)] = None) -> dict:
    from ...core.config import Settings
    from .history import history_page
    settings=request.app.state.settings if request else Settings.from_environment()
    return await history_page(db,workspaceId,user['id'],settings.auth_jwt_secret,'initiative_updates',initiative_id,limit=limit,cursor=cursor)


@router.post('/{initiative_id}/updates')
@public_router.post('/{initiative_id}/updates')
async def create_update(initiative_id: str, payload: InitiativeUpdateInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, payload.workspaceId, user['id'])
    initiative = await _initiative(db, initiative_id, payload.workspaceId, user['id'])
    update_id, now = cuid(), utcnow()
    health = payload.health or initiative['health']
    await db.execute(CREATE_UPDATE_INSERT_INITIATIVE_UPDATES, {'id': update_id, 'workspace_id': payload.workspaceId, 'initiative_id': initiative_id, 'author_id': user['id'], 'body': payload.body.strip(), 'health': health, 'now': now})
    if payload.health:
        await db.execute(CREATE_UPDATE_UPDATE_INITIATIVES, {'health': health, 'now': now, 'initiative_id': initiative_id})
    await _audit(db, payload.workspaceId, user['id'], 'initiative.update.posted', initiative_id, {'body': payload.body.strip(), 'health': health, 'updateId': update_id})
    await db.commit()
    return {'data': (await _initiative(db, initiative_id, payload.workspaceId, user['id']))['updates'][0]}


@router.post('/{initiative_id}/resources')
@public_router.post('/{initiative_id}/resources')
async def add_resource(initiative_id: str, payload: InitiativeResourceInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, payload.workspaceId, user['id'])
    await _initiative(db, initiative_id, payload.workspaceId, user['id'])
    parsed = urlparse(payload.url.strip())
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        raise ApiError(400, 'Resource URL must be a valid HTTP or HTTPS URL.', 'Bad Request')
    resource_id, now = cuid(), utcnow()
    await db.execute(ADD_RESOURCE_INSERT_INITIATIVE_RESOURCES, {'id': resource_id, 'workspace_id': payload.workspaceId, 'initiative_id': initiative_id, 'created_by': user['id'], 'label': payload.label.strip(), 'url': payload.url.strip(), 'now': now})
    await _audit(db, payload.workspaceId, user['id'], 'initiative.resource.added', initiative_id, {'resourceId': resource_id, 'label': payload.label.strip(), 'url': payload.url.strip()})
    await db.commit()
    initiative = await _initiative(db, initiative_id, payload.workspaceId, user['id'])
    return {'data': next(resource for resource in initiative['resources'] if resource['id'] == resource_id)}
