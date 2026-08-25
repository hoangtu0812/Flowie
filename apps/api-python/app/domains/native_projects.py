from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

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


async def _project(db: AsyncSession, project_id: str, workspace_id: str, user_id: str) -> dict[str, Any]:
    result = await db.execute(text('''SELECT p.*, t.id AS team_id_value, t.name AS team_name, t.identifier AS team_identifier, t.icon AS team_icon, u.id AS lead_id_value, u.name AS lead_name, u.avatar_url AS lead_avatar_url, (SELECT COUNT(*) FROM issues i WHERE i.project_id = p.id) AS issue_count, EXISTS(SELECT 1 FROM project_favorites f WHERE f.project_id = p.id AND f.user_id = :user_id) AS is_favorite FROM projects p LEFT JOIN teams t ON t.id = p.team_id LEFT JOIN users u ON u.id = p.lead_id WHERE p.id = :project_id AND p.workspace_id = :workspace_id AND p.archived_at IS NULL LIMIT 1'''), {'project_id': project_id, 'workspace_id': workspace_id, 'user_id': user_id})
    row = result.mappings().first()
    if not row: raise ApiError(404, 'Project not found.', 'Not Found')
    if row['team_id']:
        await _team_access(db, workspace_id, row['team_id'], user_id)
    labels = await db.execute(text('''SELECT l.* FROM project_label_links pl JOIN project_labels l ON l.id = pl.label_id WHERE pl.project_id = :project_id ORDER BY l.name'''), {'project_id': project_id})
    members = await db.execute(text('''SELECT pm.project_id, pm.user_id, pm.created_at, u.id, u.name, u.avatar_url FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = :project_id ORDER BY pm.created_at'''), {'project_id': project_id})
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'teamId': row['team_id'], 'name': row['name'], 'identifier': row['identifier'], 'description': row['description'], 'type': row['type'], 'status': row['status'], 'priority': row['priority'], 'health': row['health'], 'leadId': row['lead_id'], 'startDate': row['start_date'], 'targetDate': row['target_date'], 'archivedAt': row['archived_at'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'team': {'id': row['team_id_value'], 'name': row['team_name'], 'identifier': row['team_identifier'], 'icon': row['team_icon']} if row['team_id_value'] else None,
        'lead': {'id': row['lead_id_value'], 'name': row['lead_name'], 'avatarUrl': row['lead_avatar_url']} if row['lead_id_value'] else None,
        '_count': {'issues': row['issue_count']}, 'labelLinks': [{'label': {'id': label['id'], 'workspaceId': label['workspace_id'], 'name': label['name'], 'color': label['color'], 'description': label['description'], 'createdAt': label['created_at'], 'updatedAt': label['updated_at']}} for label in labels.mappings().all()],
        'members': [{'projectId': member['project_id'], 'userId': member['user_id'], 'createdAt': member['created_at'], 'user': {'id': member['id'], 'name': member['name'], 'avatarUrl': member['avatar_url']}} for member in members.mappings().all()],
        'favorites': [{'userId': user_id}] if row['is_favorite'] else [], 'issues': [], 'initiativeLinks': [], 'resources': [],
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
