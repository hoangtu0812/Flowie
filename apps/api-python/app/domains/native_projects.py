from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user

# This router is deliberately private until the complete Projects contract is
# ported. It lets us exercise real Python/database behavior without switching
# any Circle screen away from the stable legacy facade mid-migration.
router = APIRouter(prefix='/api/v1/_native/projects', tags=['native-projects'])
ProjectType = Literal['GENERAL', 'PRODUCT', 'MARKETING', 'OPERATIONS', 'EVENT', 'CLIENT', 'RESEARCH', 'CUSTOM']


class CreateProjectInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    templateId: str | None = None
    teamId: str | None = None
    name: str = Field(min_length=2, max_length=120)
    identifier: str = Field(min_length=1, max_length=24)
    description: str | None = Field(default=None, max_length=2000)
    type: ProjectType | None = None


class UpdateProjectInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, max_length=32)
    priority: str | None = Field(default=None, max_length=32)
    health: str | None = Field(default=None, max_length=32)
    leadId: str | None = None
    teamId: str | None = None
    startDate: str | None = None
    targetDate: str | None = None
    labelIds: list[str] | None = None
    type: ProjectType | None = None


class ProjectMembersInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    userIds: list[str] = Field(max_length=100)


class MilestoneInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    title: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    targetDate: str | None = None
    position: int | None = Field(default=None, ge=0)


class UpdateMilestoneInput(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    targetDate: str | None = None
    completed: bool | None = None
    position: int | None = Field(default=None, ge=0)


class ProjectUpdateInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    body: str = Field(min_length=1, max_length=4000)
    kind: Literal['update', 'comment'] | None = None
    health: Literal['on-track', 'at-risk', 'off-track'] | None = None


class ProjectResourceInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=1, max_length=2000)


async def _workspace_access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(text("SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"), {'workspace_id': workspace_id, 'user_id': user_id})
    if result.scalar_one_or_none() is None:
        raise ApiError(403, 'You do not have access to this workspace.', 'Forbidden')


async def _team_access(db: AsyncSession, workspace_id: str, team_id: str, user_id: str) -> None:
    result = await db.execute(text('''SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.id = :team_id AND t.workspace_id = :workspace_id AND t.archived_at IS NULL AND tm.user_id = :user_id'''), {'team_id': team_id, 'workspace_id': workspace_id, 'user_id': user_id})
    if result.scalar_one_or_none() is None:
        raise ApiError(403, 'You do not have access to this team.', 'Forbidden')


def _date(value: str | None) -> datetime | None:
    if value is None: return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise ApiError(400, 'date must be a valid ISO 8601 datetime', 'Bad Request') from error
    return parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed


def _url(value: str) -> str:
    normalized = value.strip()
    parsed = urlparse(normalized)
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        raise ApiError(400, 'Resource URL must be a valid HTTP or HTTPS URL.', 'Bad Request')
    return normalized


async def _members(db: AsyncSession, project_id: str) -> list[dict[str, Any]]:
    members = await db.execute(text('''SELECT pm.project_id, pm.user_id, pm.created_at, u.id, u.name, u.avatar_url FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = :project_id ORDER BY pm.created_at'''), {'project_id': project_id})
    return [{'projectId': member['project_id'], 'userId': member['user_id'], 'createdAt': member['created_at'], 'user': {'id': member['id'], 'name': member['name'], 'avatarUrl': member['avatar_url']}} for member in members.mappings().all()]


async def _activity(db: AsyncSession, project_id: str) -> list[dict[str, Any]]:
    rows = await db.execute(text('''SELECT a.*, u.id AS actor_id_value, u.name AS actor_name, u.avatar_url AS actor_avatar_url FROM activities a LEFT JOIN users u ON u.id = a.actor_id WHERE a.project_id = :project_id ORDER BY a.created_at DESC LIMIT 100'''), {'project_id': project_id})
    return [{'id': row['id'], 'workspaceId': row['workspace_id'], 'projectId': row['project_id'], 'actorId': row['actor_id'], 'type': row['type'], 'data': row['data'], 'createdAt': row['created_at'], 'actor': {'id': row['actor_id_value'], 'name': row['actor_name'], 'avatarUrl': row['actor_avatar_url']} if row['actor_id_value'] else None} for row in rows.mappings().all()]


async def _project(db: AsyncSession, project_id: str, workspace_id: str, user_id: str) -> dict[str, Any]:
    result = await db.execute(text('''SELECT p.*, t.id AS team_id_value, t.name AS team_name, t.identifier AS team_identifier, t.icon AS team_icon, u.id AS lead_id_value, u.name AS lead_name, u.avatar_url AS lead_avatar_url, (SELECT COUNT(*) FROM issues i WHERE i.project_id = p.id) AS issue_count, EXISTS(SELECT 1 FROM project_favorites f WHERE f.project_id = p.id AND f.user_id = :user_id) AS is_favorite FROM projects p LEFT JOIN teams t ON t.id = p.team_id LEFT JOIN users u ON u.id = p.lead_id WHERE p.id = :project_id AND p.workspace_id = :workspace_id AND p.archived_at IS NULL LIMIT 1'''), {'project_id': project_id, 'workspace_id': workspace_id, 'user_id': user_id})
    row = result.mappings().first()
    if not row: raise ApiError(404, 'Project not found.', 'Not Found')
    if row['team_id']:
        await _team_access(db, workspace_id, row['team_id'], user_id)
    labels = await db.execute(text('''SELECT l.* FROM project_label_links pl JOIN project_labels l ON l.id = pl.label_id WHERE pl.project_id = :project_id ORDER BY l.name'''), {'project_id': project_id})
    resources = await db.execute(text('''SELECT r.*, u.id AS creator_id_value, u.name AS creator_name, u.avatar_url AS creator_avatar_url FROM project_resources r JOIN users u ON u.id = r.created_by WHERE r.project_id = :project_id ORDER BY r.created_at'''), {'project_id': project_id})
    initiatives = await db.execute(text('''SELECT ip.initiative_id, ip.project_id, ip.created_at, i.id, i.name FROM initiative_projects ip JOIN initiatives i ON i.id = ip.initiative_id WHERE ip.project_id = :project_id'''), {'project_id': project_id})
    issues = await db.execute(text('''SELECT i.id, i.identifier, i.title, i.priority, i.updated_at, s.id AS status_id_value, s.name AS status_name, s.category AS status_category, s.color AS status_color, a.id AS assignee_id_value, a.name AS assignee_name, a.avatar_url AS assignee_avatar_url FROM issues i JOIN issue_statuses s ON s.id = i.status_id LEFT JOIN users a ON a.id = i.assignee_id WHERE i.project_id = :project_id AND i.archived_at IS NULL ORDER BY i.updated_at DESC'''), {'project_id': project_id})
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'teamId': row['team_id'], 'name': row['name'], 'identifier': row['identifier'], 'description': row['description'], 'type': row['type'], 'status': row['status'], 'priority': row['priority'], 'health': row['health'], 'leadId': row['lead_id'], 'startDate': row['start_date'], 'targetDate': row['target_date'], 'archivedAt': row['archived_at'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'team': {'id': row['team_id_value'], 'name': row['team_name'], 'identifier': row['team_identifier'], 'icon': row['team_icon']} if row['team_id_value'] else None,
        'lead': {'id': row['lead_id_value'], 'name': row['lead_name'], 'avatarUrl': row['lead_avatar_url']} if row['lead_id_value'] else None,
        '_count': {'issues': row['issue_count']}, 'labelLinks': [{'label': {'id': label['id'], 'workspaceId': label['workspace_id'], 'name': label['name'], 'color': label['color'], 'description': label['description'], 'createdAt': label['created_at'], 'updatedAt': label['updated_at']}} for label in labels.mappings().all()],
        'members': await _members(db, project_id),
        'favorites': [{'userId': user_id}] if row['is_favorite'] else [],
        'issues': [{'id': issue['id'], 'identifier': issue['identifier'], 'title': issue['title'], 'priority': issue['priority'], 'updatedAt': issue['updated_at'], 'status': {'id': issue['status_id_value'], 'name': issue['status_name'], 'category': issue['status_category'], 'color': issue['status_color']}, 'assignee': {'id': issue['assignee_id_value'], 'name': issue['assignee_name'], 'avatarUrl': issue['assignee_avatar_url']} if issue['assignee_id_value'] else None} for issue in issues.mappings().all()],
        'initiativeLinks': [{'initiativeId': link['initiative_id'], 'projectId': link['project_id'], 'createdAt': link['created_at'], 'initiative': {'id': link['id'], 'name': link['name']}} for link in initiatives.mappings().all()],
        'resources': [{'id': resource['id'], 'workspaceId': resource['workspace_id'], 'projectId': resource['project_id'], 'createdById': resource['created_by'], 'label': resource['label'], 'url': resource['url'], 'createdAt': resource['created_at'], 'updatedAt': resource['updated_at'], 'createdBy': {'id': resource['creator_id_value'], 'name': resource['creator_name'], 'avatarUrl': resource['creator_avatar_url']}} for resource in resources.mappings().all()],
    }


@router.get('')
async def list_projects(workspaceId: str = Query(min_length=1), teamId: str | None = None, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    if teamId:
        await _team_access(db, workspaceId, teamId, user['id'])
        result = await db.execute(text('SELECT id FROM projects WHERE workspace_id = :workspace_id AND team_id = :team_id AND archived_at IS NULL ORDER BY created_at DESC'), {'workspace_id': workspaceId, 'team_id': teamId})
    else:
        result = await db.execute(text('SELECT id FROM projects WHERE workspace_id = :workspace_id AND archived_at IS NULL ORDER BY created_at DESC'), {'workspace_id': workspaceId})
    return {'data': [await _project(db, row['id'], workspaceId, user['id']) for row in result.mappings().all()]}


@router.post('')
async def create_project(payload: CreateProjectInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user['id'])
    if payload.teamId: await _team_access(db, payload.workspaceId, payload.teamId, user['id'])
    if payload.templateId:
        template = await db.execute(text('SELECT 1 FROM project_templates WHERE id = :id AND workspace_id = :workspace_id'), {'id': payload.templateId, 'workspace_id': payload.workspaceId})
        if template.scalar_one_or_none() is None: raise ApiError(404, 'Project template not found.', 'Not Found')
    project_id, now = _cuid(), _utcnow()
    try:
        await db.execute(text('''INSERT INTO projects (id, workspace_id, team_id, name, identifier, description, type, created_at, updated_at) VALUES (:id, :workspace_id, :team_id, :name, :identifier, :description, :type, :now, :now)'''), {'id': project_id, 'workspace_id': payload.workspaceId, 'team_id': payload.teamId, 'name': payload.name.strip(), 'identifier': payload.identifier.strip().upper(), 'description': payload.description, 'type': payload.type or 'GENERAL', 'now': now})
        await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.created', CAST(:data AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': payload.workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'data': '{"source":"python"}', 'now': now})
        await db.commit()
    except IntegrityError as error:
        await db.rollback(); raise ApiError(409, 'A project with this identifier already exists.', 'Conflict') from error
    return {'data': await _project(db, project_id, payload.workspaceId, user['id'])}


@router.get('/{project_id}')
async def get_project(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, workspaceId, user['id'])
    return {'data': await _project(db, project_id, workspaceId, user['id'])}


@router.patch('/{project_id}')
async def update_project(project_id: str, payload: UpdateProjectInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    current = await _project(db, project_id, workspaceId, user['id'])
    values = payload.model_dump(exclude_unset=True)
    if values.get('leadId'):
        lead = await db.execute(text("SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"), {'workspace_id': workspaceId, 'user_id': values['leadId']})
        if lead.scalar_one_or_none() is None: raise ApiError(404, 'Project lead must be an active workspace member.', 'Not Found')
    if values.get('teamId'): await _team_access(db, workspaceId, values['teamId'], user['id'])
    if values.get('status'):
        status = await db.execute(text('SELECT 1 FROM project_statuses WHERE workspace_id = :workspace_id AND name = :name'), {'workspace_id': workspaceId, 'name': values['status']})
        if status.scalar_one_or_none() is None: raise ApiError(404, 'Project status is not configured in this workspace.', 'Not Found')
    label_ids = values.pop('labelIds', None)
    if label_ids is not None:
        ids = list(set(label_ids))
        if ids:
            labels = await db.execute(text('SELECT COUNT(*) FROM project_labels WHERE workspace_id = :workspace_id AND id = ANY(:ids)'), {'workspace_id': workspaceId, 'ids': ids})
            if labels.scalar_one() != len(ids): raise ApiError(404, 'One or more project labels are not available in this workspace.', 'Not Found')
    column_map = {'name':'name','description':'description','status':'status','priority':'priority','health':'health','leadId':'lead_id','teamId':'team_id','startDate':'start_date','targetDate':'target_date','type':'type'}
    params, sets = {'id': project_id, 'now': _utcnow()}, []
    for key, column in column_map.items():
        if key in values:
            value = _date(values[key]) if key in {'startDate','targetDate'} else values[key]
            params[key] = value.strip() if key in {'name','description'} and isinstance(value, str) else value; sets.append(f'{column} = :{key}')
    if sets: await db.execute(text(f"UPDATE projects SET {', '.join(sets)}, updated_at = :now WHERE id = :id"), params)
    if label_ids is not None:
        await db.execute(text('DELETE FROM project_label_links WHERE project_id = :project_id'), {'project_id': project_id})
        for label_id in set(label_ids): await db.execute(text('INSERT INTO project_label_links (project_id, label_id) VALUES (:project_id, :label_id)'), {'project_id': project_id, 'label_id': label_id})
    await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.updated', CAST('{}' AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'now': _utcnow()})
    await db.commit()
    return {'data': await _project(db, project_id, workspaceId, user['id'])}


@router.delete('/{project_id}')
async def archive_project(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, workspaceId, user['id']); now = _utcnow()
    await db.execute(text('UPDATE issues SET archived_at = :now, updated_at = :now WHERE project_id = :project_id AND workspace_id = :workspace_id AND archived_at IS NULL'), {'project_id': project_id, 'workspace_id': workspaceId, 'now': now})
    await db.execute(text('UPDATE projects SET archived_at = :now, updated_at = :now WHERE id = :project_id AND workspace_id = :workspace_id'), {'project_id': project_id, 'workspace_id': workspaceId, 'now': now})
    await db.commit()
    return {'data': {'id': project_id, 'archivedAt': now}}


@router.get('/{project_id}/activity')
async def project_activity(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _project(db, project_id, workspaceId, user['id'])
    return {'data': await _activity(db, project_id)}


@router.get('/{project_id}/issues')
async def project_issues(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    return {'data': (await _project(db, project_id, workspaceId, user['id']))['issues']}


@router.patch('/{project_id}/members')
async def update_members(project_id: str, payload: ProjectMembersInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _project(db, project_id, payload.workspaceId, user['id'])
    member_ids = list(set(payload.userIds))
    if len(member_ids) != len(payload.userIds):
        raise ApiError(400, 'Project members must be unique.', 'Bad Request')
    if member_ids:
        active = await db.execute(text("SELECT COUNT(*) FROM workspace_members WHERE workspace_id = :workspace_id AND status = 'ACTIVE' AND user_id = ANY(:user_ids)"), {'workspace_id': payload.workspaceId, 'user_ids': member_ids})
        if active.scalar_one() != len(member_ids):
            raise ApiError(400, 'Project members must be active workspace members.', 'Bad Request')
    now = _utcnow()
    await db.execute(text('DELETE FROM project_members WHERE project_id = :project_id'), {'project_id': project_id})
    for member_id in member_ids:
        await db.execute(text('INSERT INTO project_members (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now)'), {'project_id': project_id, 'user_id': member_id, 'now': now})
    await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.members.updated', CAST(:data AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': payload.workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'data': json.dumps({'memberIds': member_ids}), 'now': now})
    await db.commit()
    return {'data': await _members(db, project_id)}


@router.get('/{project_id}/subscription')
async def subscription(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await _project(db, project_id, workspaceId, user['id'])
    result = await db.execute(text('SELECT created_at FROM project_subscriptions WHERE project_id = :project_id AND user_id = :user_id'), {'project_id': project_id, 'user_id': user['id']})
    created_at = result.scalar_one_or_none()
    return {'data': {'subscribed': created_at is not None, 'subscribedAt': created_at}}


@router.post('/{project_id}/subscription')
async def subscribe(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await _project(db, project_id, workspaceId, user['id'])
    now = _utcnow()
    await db.execute(text('INSERT INTO project_subscriptions (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now) ON CONFLICT (project_id, user_id) DO NOTHING'), {'project_id': project_id, 'user_id': user['id'], 'now': now})
    await db.commit()
    result = await db.execute(text('SELECT created_at FROM project_subscriptions WHERE project_id = :project_id AND user_id = :user_id'), {'project_id': project_id, 'user_id': user['id']})
    return {'data': {'subscribed': True, 'subscribedAt': result.scalar_one()}}


@router.delete('/{project_id}/subscription')
async def unsubscribe(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await _project(db, project_id, workspaceId, user['id'])
    await db.execute(text('DELETE FROM project_subscriptions WHERE project_id = :project_id AND user_id = :user_id'), {'project_id': project_id, 'user_id': user['id']})
    await db.commit()
    return {'data': {'subscribed': False, 'subscribedAt': None}}


@router.post('/{project_id}/favorite')
async def favorite(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await _project(db, project_id, workspaceId, user['id'])
    now = _utcnow()
    await db.execute(text('INSERT INTO project_favorites (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now) ON CONFLICT (project_id, user_id) DO NOTHING'), {'project_id': project_id, 'user_id': user['id'], 'now': now})
    await db.commit()
    result = await db.execute(text('SELECT created_at FROM project_favorites WHERE project_id = :project_id AND user_id = :user_id'), {'project_id': project_id, 'user_id': user['id']})
    return {'data': {'favorite': True, 'favoritedAt': result.scalar_one()}}


@router.delete('/{project_id}/favorite')
async def unfavorite(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await _project(db, project_id, workspaceId, user['id'])
    await db.execute(text('DELETE FROM project_favorites WHERE project_id = :project_id AND user_id = :user_id'), {'project_id': project_id, 'user_id': user['id']})
    await db.commit()
    return {'data': {'favorite': False, 'favoritedAt': None}}


@router.get('/{project_id}/milestones')
async def list_milestones(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _project(db, project_id, workspaceId, user['id'])
    result = await db.execute(text('SELECT * FROM project_milestones WHERE project_id = :project_id AND workspace_id = :workspace_id ORDER BY position, target_date'), {'project_id': project_id, 'workspace_id': workspaceId})
    return {'data': [dict(row) for row in result.mappings().all()]}


@router.post('/{project_id}/milestones')
async def create_milestone(project_id: str, payload: MilestoneInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, payload.workspaceId, user['id'])
    milestone_id, now = _cuid(), _utcnow()
    await db.execute(text('''INSERT INTO project_milestones (id, workspace_id, project_id, title, description, target_date, position, created_at, updated_at) VALUES (:id, :workspace_id, :project_id, :title, :description, :target_date, :position, :now, :now)'''), {'id': milestone_id, 'workspace_id': payload.workspaceId, 'project_id': project_id, 'title': payload.title.strip(), 'description': payload.description, 'target_date': _date(payload.targetDate), 'position': payload.position or 0, 'now': now})
    await db.commit()
    result = await db.execute(text('SELECT * FROM project_milestones WHERE id = :id'), {'id': milestone_id})
    return {'data': dict(result.mappings().one())}


@router.patch('/{project_id}/milestones/{milestone_id}')
async def update_milestone(project_id: str, milestone_id: str, payload: UpdateMilestoneInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, workspaceId, user['id'])
    exists = await db.execute(text('SELECT 1 FROM project_milestones WHERE id = :id AND project_id = :project_id AND workspace_id = :workspace_id'), {'id': milestone_id, 'project_id': project_id, 'workspace_id': workspaceId})
    if exists.scalar_one_or_none() is None: raise ApiError(404, 'Project milestone not found.', 'Not Found')
    values, sets, params = payload.model_dump(exclude_unset=True), [], {'id': milestone_id, 'now': _utcnow()}
    for key, column in {'title': 'title', 'description': 'description', 'position': 'position'}.items():
        if key in values:
            params[key] = values[key].strip() if key == 'title' and isinstance(values[key], str) else values[key]; sets.append(f'{column} = :{key}')
    if 'targetDate' in values: params['targetDate'] = _date(values['targetDate']); sets.append('target_date = :targetDate')
    if 'completed' in values: params['completedAt'] = _utcnow() if values['completed'] else None; sets.append('completed_at = :completedAt')
    if sets: await db.execute(text(f"UPDATE project_milestones SET {', '.join(sets)}, updated_at = :now WHERE id = :id"), params); await db.commit()
    result = await db.execute(text('SELECT * FROM project_milestones WHERE id = :id'), {'id': milestone_id})
    return {'data': dict(result.mappings().one())}


@router.delete('/{project_id}/milestones/{milestone_id}')
async def remove_milestone(project_id: str, milestone_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, workspaceId, user['id'])
    deleted = await db.execute(text('DELETE FROM project_milestones WHERE id = :id AND project_id = :project_id AND workspace_id = :workspace_id RETURNING id'), {'id': milestone_id, 'project_id': project_id, 'workspace_id': workspaceId})
    if deleted.scalar_one_or_none() is None: raise ApiError(404, 'Project milestone not found.', 'Not Found')
    await db.commit()
    return {'data': {'id': milestone_id, 'deleted': True}}


@router.get('/{project_id}/updates')
async def list_updates(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _project(db, project_id, workspaceId, user['id'])
    result = await db.execute(text('''SELECT pu.*, u.id AS author_id_value, u.name AS author_name, u.avatar_url AS author_avatar_url FROM project_updates pu JOIN users u ON u.id = pu.author_id WHERE pu.project_id = :project_id AND pu.workspace_id = :workspace_id ORDER BY pu.created_at DESC LIMIT 25'''), {'project_id': project_id, 'workspace_id': workspaceId})
    return {'data': [{**dict(row), 'author': {'id': row['author_id_value'], 'name': row['author_name'], 'avatarUrl': row['author_avatar_url']}, 'attachments': []} for row in result.mappings().all()]}


@router.post('/{project_id}/updates')
async def create_update(project_id: str, payload: ProjectUpdateInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    project = await _project(db, project_id, payload.workspaceId, user['id']); body = payload.body.strip()
    if not body: raise ApiError(400, 'Project update cannot be empty.', 'Bad Request')
    update_id, now, kind = _cuid(), _utcnow(), payload.kind or 'update'
    await db.execute(text('''INSERT INTO project_updates (id, workspace_id, project_id, author_id, body, kind, health, created_at, updated_at) VALUES (:id, :workspace_id, :project_id, :author_id, :body, :kind, :health, :now, :now)'''), {'id': update_id, 'workspace_id': payload.workspaceId, 'project_id': project_id, 'author_id': user['id'], 'body': body, 'kind': kind, 'health': None if kind == 'comment' else (payload.health or 'on-track'), 'now': now})
    if kind != 'comment' and payload.health: await db.execute(text('UPDATE projects SET health = :health, updated_at = :now WHERE id = :id'), {'id': project_id, 'health': payload.health, 'now': now})
    await db.execute(text('INSERT INTO project_subscriptions (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now) ON CONFLICT (project_id, user_id) DO NOTHING'), {'project_id': project_id, 'user_id': user['id'], 'now': now})
    await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.update.created', CAST(:data AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': payload.workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'data': json.dumps({'updateId': update_id, 'preview': body[:200]}), 'now': now})
    await db.commit()
    return {'data': {'id': update_id, 'workspaceId': payload.workspaceId, 'projectId': project_id, 'authorId': user['id'], 'body': body, 'kind': kind, 'health': None if kind == 'comment' else (payload.health or 'on-track'), 'createdAt': now, 'updatedAt': now, 'author': {'id': user['id'], 'name': user['name'], 'avatarUrl': user['avatar_url']}, 'attachments': []}}


@router.post('/{project_id}/resources')
async def create_resource(project_id: str, payload: ProjectResourceInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, payload.workspaceId, user['id'])
    resource_id, now, label, resource_url = _cuid(), _utcnow(), payload.label.strip(), _url(payload.url)
    await db.execute(text('''INSERT INTO project_resources (id, workspace_id, project_id, created_by, label, url, created_at, updated_at) VALUES (:id, :workspace_id, :project_id, :created_by, :label, :url, :now, :now)'''), {'id': resource_id, 'workspace_id': payload.workspaceId, 'project_id': project_id, 'created_by': user['id'], 'label': label, 'url': resource_url, 'now': now})
    await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.resource.created', CAST(:data AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': payload.workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'data': json.dumps({'resourceId': resource_id, 'label': label, 'url': resource_url}), 'now': now})
    await db.commit()
    return {'data': {'id': resource_id, 'workspaceId': payload.workspaceId, 'projectId': project_id, 'createdById': user['id'], 'label': label, 'url': resource_url, 'createdAt': now, 'updatedAt': now, 'createdBy': {'id': user['id'], 'name': user['name'], 'avatarUrl': user['avatar_url']}}}
