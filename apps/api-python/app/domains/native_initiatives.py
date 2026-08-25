from __future__ import annotations

import json
from typing import Any, Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .native_projects import _date, _workspace_access
from .teams import _manager


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
        text("SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"),
        {'workspace_id': workspace_id, 'user_id': user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(404, 'Initiative owner must be an active workspace member.', 'Not Found')


async def _audit(
    db: AsyncSession, workspace_id: str, actor_id: str, action: str, initiative_id: str, metadata: dict[str, Any] | None = None
) -> None:
    await db.execute(
        text(
            """INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :workspace_id, :actor_id, :action, 'initiative', :entity_id, CAST(:metadata AS jsonb), :now)"""
        ),
        {
            'id': _cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id, 'action': action,
            'entity_id': initiative_id, 'metadata': json.dumps(metadata or {}), 'now': _utcnow(),
        },
    )


async def _project(db: AsyncSession, project_id: str) -> dict[str, Any] | None:
    result = await db.execute(
        text(
            """SELECT p.*, t.id AS team_id_value, t.name AS team_name, t.identifier AS team_identifier, t.icon AS team_icon,
                      lead.id AS lead_id_value, lead.name AS lead_name, lead.avatar_url AS lead_avatar_url
               FROM projects p
               LEFT JOIN teams t ON t.id = p.team_id
               LEFT JOIN users lead ON lead.id = p.lead_id
               WHERE p.id = :project_id AND p.archived_at IS NULL"""
        ),
        {'project_id': project_id},
    )
    row = result.mappings().first()
    if not row:
        return None
    issues = await db.execute(
        text(
            """SELECT issue.id, status.category
               FROM issues issue JOIN issue_statuses status ON status.id = issue.status_id
               WHERE issue.project_id = :project_id AND issue.archived_at IS NULL"""
        ),
        {'project_id': project_id},
    )
    return {
        'id': row['id'], 'name': row['name'], 'identifier': row['identifier'],
        'status': row['status'], 'priority': row['priority'], 'health': row['health'],
        'targetDate': row['target_date'], 'startDate': row['start_date'], 'createdAt': row['created_at'],
        'team': {'id': row['team_id_value'], 'name': row['team_name'], 'identifier': row['team_identifier'], 'icon': row['team_icon']} if row['team_id_value'] else None,
        'lead': {'id': row['lead_id_value'], 'name': row['lead_name'], 'avatarUrl': row['lead_avatar_url']} if row['lead_id_value'] else None,
        'issues': [{'id': issue['id'], 'status': {'category': str(issue['category']).lower()}} for issue in issues.mappings().all()],
    }


async def _initiative(db: AsyncSession, initiative_id: str, workspace_id: str, user_id: str) -> dict[str, Any]:
    await _workspace_access(db, workspace_id, user_id)
    result = await db.execute(
        text(
            """SELECT initiative.*, owner.id AS owner_id_value, owner.name AS owner_name, owner.avatar_url AS owner_avatar_url
               FROM initiatives initiative LEFT JOIN users owner ON owner.id = initiative.owner_id
               WHERE initiative.id = :initiative_id AND initiative.workspace_id = :workspace_id AND initiative.archived_at IS NULL"""
        ),
        {'initiative_id': initiative_id, 'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Initiative not found.', 'Not Found')
    links = await db.execute(
        text('SELECT project_id, created_at FROM initiative_projects WHERE initiative_id = :initiative_id ORDER BY created_at'),
        {'initiative_id': initiative_id},
    )
    project_links = []
    for link in links.mappings().all():
        project = await _project(db, link['project_id'])
        if project:
            project_links.append({'initiativeId': initiative_id, 'projectId': link['project_id'], 'createdAt': link['created_at'], 'project': project})
    labels = await db.execute(
        text(
            '''SELECT label.id, label.workspace_id, label.name, label.color, label.description, label.created_at, label.updated_at,
                      initiative_label.created_at AS linked_at
               FROM initiative_label_links initiative_label
               JOIN labels label ON label.id = initiative_label.label_id
               WHERE initiative_label.initiative_id = :initiative_id AND label.workspace_id = :workspace_id
               ORDER BY label.name ASC'''
        ),
        {'initiative_id': initiative_id, 'workspace_id': workspace_id},
    )
    updates = await db.execute(
        text(
            """SELECT initiative_update.*, author.id AS author_id_value, author.name AS author_name, author.avatar_url AS author_avatar_url
               FROM initiative_updates initiative_update JOIN users author ON author.id = initiative_update.author_id
               WHERE initiative_update.initiative_id = :initiative_id ORDER BY initiative_update.created_at DESC LIMIT 100"""
        ),
        {'initiative_id': initiative_id},
    )
    resources = await db.execute(
        text(
            """SELECT initiative_resource.*, creator.id AS creator_id_value, creator.name AS creator_name, creator.avatar_url AS creator_avatar_url
               FROM initiative_resources initiative_resource JOIN users creator ON creator.id = initiative_resource.created_by
               WHERE initiative_resource.initiative_id = :initiative_id ORDER BY initiative_resource.created_at ASC"""
        ),
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
async def list_initiatives(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(text('SELECT id FROM initiatives WHERE workspace_id = :workspace_id AND archived_at IS NULL ORDER BY updated_at DESC'), {'workspace_id': workspaceId})
    return {'data': [await _initiative(db, row['id'], workspaceId, user['id']) for row in result.mappings().all()]}


@router.post('')
@public_router.post('')
async def create_initiative(payload: CreateInitiativeInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, payload.workspaceId, user['id'])
    owner_id = payload.ownerId or user['id']
    await _active_member(db, payload.workspaceId, owner_id)
    initiative_id, now = _cuid(), _utcnow()
    await db.execute(
        text('''INSERT INTO initiatives (id, workspace_id, name, description, status, priority, health, icon, owner_id, target_date, created_at, updated_at)
                VALUES (:id, :workspace_id, :name, :description, :status, :priority, :health, :icon, :owner_id, :target_date, :now, :now)'''),
        {'id': initiative_id, 'workspace_id': payload.workspaceId, 'name': payload.name.strip(), 'description': payload.description, 'status': payload.status, 'priority': payload.priority, 'health': payload.health, 'icon': payload.icon, 'owner_id': owner_id, 'target_date': _date(payload.targetDate), 'now': now},
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
    await _manager(db, workspaceId, user['id'])
    await _initiative(db, initiative_id, workspaceId, user['id'])
    values = payload.model_dump(exclude_unset=True)
    if 'ownerId' in values and values['ownerId']:
        await _active_member(db, workspaceId, values['ownerId'])
    column_map = {'name': 'name', 'description': 'description', 'status': 'status', 'priority': 'priority', 'health': 'health', 'icon': 'icon', 'ownerId': 'owner_id', 'targetDate': 'target_date'}
    params: dict[str, Any] = {'initiative_id': initiative_id, 'now': _utcnow()}
    sets = []
    for field, column in column_map.items():
        if field in values:
            value = _date(values[field]) if field == 'targetDate' else values[field]
            params[field] = value.strip() if field in {'name', 'description'} and isinstance(value, str) else value
            sets.append(f'{column} = :{field}')
    if sets:
        await db.execute(text(f"UPDATE initiatives SET {', '.join(sets)}, updated_at = :now WHERE id = :initiative_id"), params)
        await _audit(db, workspaceId, user['id'], 'initiative.updated', initiative_id, values)
        await db.commit()
    return {'data': await _initiative(db, initiative_id, workspaceId, user['id'])}


@router.delete('/{initiative_id}')
@public_router.delete('/{initiative_id}')
async def archive_initiative(initiative_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    await _initiative(db, initiative_id, workspaceId, user['id'])
    now = _utcnow()
    await db.execute(text('UPDATE initiatives SET archived_at = :now, updated_at = :now WHERE id = :initiative_id'), {'initiative_id': initiative_id, 'now': now})
    await _audit(db, workspaceId, user['id'], 'initiative.archived', initiative_id)
    await db.commit()
    return {'data': {'id': initiative_id, 'archivedAt': now}}


@router.post('/{initiative_id}/projects')
@public_router.post('/{initiative_id}/projects')
async def link_project(initiative_id: str, payload: ProjectLinkInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, payload.workspaceId, user['id'])
    await _initiative(db, initiative_id, payload.workspaceId, user['id'])
    project = await db.execute(text('SELECT id, name FROM projects WHERE id = :project_id AND workspace_id = :workspace_id AND archived_at IS NULL'), {'project_id': payload.projectId, 'workspace_id': payload.workspaceId})
    row = project.mappings().first()
    if not row:
        raise ApiError(404, 'Initiative or project not found.', 'Not Found')
    await db.execute(text('INSERT INTO initiative_projects (initiative_id, project_id) VALUES (:initiative_id, :project_id) ON CONFLICT DO NOTHING'), {'initiative_id': initiative_id, 'project_id': payload.projectId})
    await _audit(db, payload.workspaceId, user['id'], 'initiative.project.linked', initiative_id, {'projectId': payload.projectId, 'projectName': row['name']})
    await db.commit()
    return {'data': {'initiativeId': initiative_id, 'projectId': payload.projectId}}


@router.delete('/{initiative_id}/projects/{project_id}')
@public_router.delete('/{initiative_id}/projects/{project_id}')
async def unlink_project(initiative_id: str, project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    await _initiative(db, initiative_id, workspaceId, user['id'])
    await db.execute(text('DELETE FROM initiative_projects WHERE initiative_id = :initiative_id AND project_id = :project_id'), {'initiative_id': initiative_id, 'project_id': project_id})
    await _audit(db, workspaceId, user['id'], 'initiative.project.unlinked', initiative_id, {'projectId': project_id})
    await db.commit()
    return {'data': {'initiativeId': initiative_id, 'projectId': project_id, 'removed': True}}


@router.post('/{initiative_id}/labels')
@public_router.post('/{initiative_id}/labels')
async def link_label(initiative_id: str, payload: InitiativeLabelLinkInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, payload.workspaceId, user['id'])
    await _initiative(db, initiative_id, payload.workspaceId, user['id'])
    result = await db.execute(
        text('SELECT id, name FROM labels WHERE id = :label_id AND workspace_id = :workspace_id'),
        {'label_id': payload.labelId, 'workspace_id': payload.workspaceId},
    )
    label = result.mappings().first()
    if not label:
        raise ApiError(404, 'Label not found.', 'Not Found')
    await db.execute(
        text('INSERT INTO initiative_label_links (initiative_id, label_id) VALUES (:initiative_id, :label_id) ON CONFLICT DO NOTHING'),
        {'initiative_id': initiative_id, 'label_id': payload.labelId},
    )
    await _audit(db, payload.workspaceId, user['id'], 'initiative.label.linked', initiative_id, {'labelId': payload.labelId, 'labelName': label['name']})
    await db.commit()
    return {'data': {'initiativeId': initiative_id, 'labelId': payload.labelId}}


@router.delete('/{initiative_id}/labels/{label_id}')
@public_router.delete('/{initiative_id}/labels/{label_id}')
async def unlink_label(initiative_id: str, label_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    await _initiative(db, initiative_id, workspaceId, user['id'])
    await db.execute(
        text('DELETE FROM initiative_label_links WHERE initiative_id = :initiative_id AND label_id = :label_id'),
        {'initiative_id': initiative_id, 'label_id': label_id},
    )
    await _audit(db, workspaceId, user['id'], 'initiative.label.unlinked', initiative_id, {'labelId': label_id})
    await db.commit()
    return {'data': {'initiativeId': initiative_id, 'labelId': label_id, 'removed': True}}


@router.get('/{initiative_id}/activity')
@public_router.get('/{initiative_id}/activity')
async def initiative_activity(initiative_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _initiative(db, initiative_id, workspaceId, user['id'])
    result = await db.execute(text('''SELECT audit.*, actor.id AS actor_id_value, actor.name AS actor_name, actor.avatar_url AS actor_avatar_url
        FROM audit_logs audit LEFT JOIN users actor ON actor.id = audit.actor_id
        WHERE audit.workspace_id = :workspace_id AND audit.entity_type = 'initiative' AND audit.entity_id = :initiative_id
        ORDER BY audit.created_at DESC LIMIT 100'''), {'workspace_id': workspaceId, 'initiative_id': initiative_id})
    return {'data': [{'id': row['id'], 'action': row['action'], 'metadata': row['metadata'] or {}, 'createdAt': row['created_at'], 'actor': {'id': row['actor_id_value'], 'name': row['actor_name'], 'avatarUrl': row['actor_avatar_url']} if row['actor_id_value'] else None} for row in result.mappings().all()]}


@router.post('/{initiative_id}/updates')
@public_router.post('/{initiative_id}/updates')
async def create_update(initiative_id: str, payload: InitiativeUpdateInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, payload.workspaceId, user['id'])
    initiative = await _initiative(db, initiative_id, payload.workspaceId, user['id'])
    update_id, now = _cuid(), _utcnow()
    health = payload.health or initiative['health']
    await db.execute(text('''INSERT INTO initiative_updates (id, workspace_id, initiative_id, author_id, body, health, created_at, updated_at)
        VALUES (:id, :workspace_id, :initiative_id, :author_id, :body, :health, :now, :now)'''), {'id': update_id, 'workspace_id': payload.workspaceId, 'initiative_id': initiative_id, 'author_id': user['id'], 'body': payload.body.strip(), 'health': health, 'now': now})
    if payload.health:
        await db.execute(text('UPDATE initiatives SET health = :health, updated_at = :now WHERE id = :initiative_id'), {'health': health, 'now': now, 'initiative_id': initiative_id})
    await _audit(db, payload.workspaceId, user['id'], 'initiative.update.posted', initiative_id, {'body': payload.body.strip(), 'health': health, 'updateId': update_id})
    await db.commit()
    return {'data': (await _initiative(db, initiative_id, payload.workspaceId, user['id']))['updates'][0]}


@router.post('/{initiative_id}/resources')
@public_router.post('/{initiative_id}/resources')
async def add_resource(initiative_id: str, payload: InitiativeResourceInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, payload.workspaceId, user['id'])
    await _initiative(db, initiative_id, payload.workspaceId, user['id'])
    parsed = urlparse(payload.url.strip())
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        raise ApiError(400, 'Resource URL must be a valid HTTP or HTTPS URL.', 'Bad Request')
    resource_id, now = _cuid(), _utcnow()
    await db.execute(text('''INSERT INTO initiative_resources (id, workspace_id, initiative_id, created_by, label, url, created_at, updated_at)
        VALUES (:id, :workspace_id, :initiative_id, :created_by, :label, :url, :now, :now)'''), {'id': resource_id, 'workspace_id': payload.workspaceId, 'initiative_id': initiative_id, 'created_by': user['id'], 'label': payload.label.strip(), 'url': payload.url.strip(), 'now': now})
    await _audit(db, payload.workspaceId, user['id'], 'initiative.resource.added', initiative_id, {'resourceId': resource_id, 'label': payload.label.strip(), 'url': payload.url.strip()})
    await db.commit()
    initiative = await _initiative(db, initiative_id, payload.workspaceId, user['id'])
    return {'data': next(resource for resource in initiative['resources'] if resource['id'] == resource_id)}
