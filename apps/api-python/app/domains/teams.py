from __future__ import annotations

from datetime import timedelta
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

router = APIRouter(prefix='/api/v1/teams', tags=['teams'])
RESTORE_WINDOW_DAYS = 30


class CreateTeamInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=80)
    identifier: str = Field(min_length=1, max_length=12)
    description: str | None = Field(default=None, max_length=500)
    icon: str | None = Field(default=None, max_length=16)
    color: str | None = Field(default=None, pattern=r'^#[0-9a-fA-F]{6}$')


class UpdateTeamInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    icon: str | None = Field(default=None, max_length=16)
    color: str | None = Field(default=None, pattern=r'^#[0-9a-fA-F]{6}$')
    triageEnabled: bool | None = None
    joinPolicy: Literal['OPEN', 'INVITE_ONLY'] | None = None
    cycleCadenceWeeks: int | None = Field(default=None, ge=1, le=12)
    autoCloseDays: int | None = Field(default=None, ge=1, le=3650)
    autoArchiveDays: int | None = Field(default=None, ge=1, le=3650)
    parentTeamId: str | None = None
    defaultIssueTemplateId: str | None = None


class TeamMemberInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    userId: str = Field(min_length=1)
    role: Literal['LEAD', 'MEMBER']


class TeamMemberRoleInput(BaseModel):
    role: Literal['LEAD', 'MEMBER']


def _team(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'name': row['name'],
        'identifier': row['identifier'], 'description': row['description'], 'icon': row['icon'],
        'color': row['color'], 'joinPolicy': row['join_policy'], 'triageEnabled': row['triage_enabled'],
        'cycleCadenceWeeks': row['cycle_cadence_weeks'], 'autoCloseDays': row['auto_close_days'],
        'autoArchiveDays': row['auto_archive_days'], 'parentTeamId': row['parent_team_id'],
        'defaultIssueTemplateId': row['default_issue_template_id'], 'archivedAt': row['archived_at'],
        'deletedAt': row['deleted_at'], 'issueSequence': row['issue_sequence'],
        'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
    }


async def _workspace_role(db: AsyncSession, workspace_id: str, user_id: str) -> str:
    result = await db.execute(text("SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"), {'workspace_id': workspace_id, 'user_id': user_id})
    role = result.scalar_one_or_none()
    if not role:
        raise ApiError(403, 'You do not have access to this workspace.', 'Forbidden')
    return role


async def _manager(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    if await _workspace_role(db, workspace_id, user_id) not in {'OWNER', 'ADMIN'}:
        raise ApiError(403, 'Workspace administrator access is required.', 'Forbidden')


async def _team_row(db: AsyncSession, team_id: str, workspace_id: str, *, include_archived: bool = False) -> Any | None:
    condition = '' if include_archived else 'AND archived_at IS NULL'
    result = await db.execute(text(f'SELECT * FROM teams WHERE id = :team_id AND workspace_id = :workspace_id {condition} LIMIT 1'), {'team_id': team_id, 'workspace_id': workspace_id})
    return result.mappings().first()


async def _members(db: AsyncSession, team_id: str) -> list[dict[str, Any]]:
    result = await db.execute(text('''SELECT tm.team_id, tm.user_id, tm.role, tm.created_at, u.id, u.name, u.email, u.avatar_url, u.title FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = :team_id ORDER BY tm.created_at ASC'''), {'team_id': team_id})
    return [{'teamId': row['team_id'], 'userId': row['user_id'], 'role': row['role'], 'createdAt': row['created_at'], 'user': {'id': row['id'], 'name': row['name'], 'email': row['email'], 'avatarUrl': row['avatar_url'], 'title': row['title']}} for row in result.mappings().all()]


async def _counts(db: AsyncSession, team_id: str) -> dict[str, int]:
    result = await db.execute(text('''SELECT (SELECT COUNT(*) FROM issues WHERE team_id = :team_id) AS issues, (SELECT COUNT(*) FROM projects WHERE team_id = :team_id) AS projects, (SELECT COUNT(*) FROM cycles WHERE team_id = :team_id) AS cycles, (SELECT COUNT(*) FROM documents WHERE team_id = :team_id) AS documents'''), {'team_id': team_id})
    row = result.mappings().one()
    return {'issues': row['issues'], 'projects': row['projects'], 'cycles': row['cycles'], 'documents': row['documents']}


async def _detail(db: AsyncSession, team_id: str, workspace_id: str) -> dict[str, Any]:
    row = await _team_row(db, team_id, workspace_id)
    if not row:
        raise ApiError(404, 'Team not found.', 'Not Found')
    record = _team(row)
    record['members'] = await _members(db, team_id)
    record['_count'] = await _counts(db, team_id)
    return record


async def _audit(db: AsyncSession, workspace_id: str, actor_id: str, action: str, team_id: str, metadata: str = '{}') -> None:
    await db.execute(text("INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at) VALUES (:id, :workspace_id, :actor_id, :action, 'team', :team_id, CAST(:metadata AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id, 'action': action, 'team_id': team_id, 'metadata': metadata, 'now': _utcnow()})


@router.get('')
async def list_teams(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_role(db, workspaceId, user['id'])
    result = await db.execute(text('SELECT * FROM teams WHERE workspace_id = :workspace_id AND archived_at IS NULL ORDER BY name ASC'), {'workspace_id': workspaceId})
    teams = []
    for row in result.mappings().all():
        record = _team(row)
        record['members'] = await _members(db, row['id'])
        counts = await _counts(db, row['id'])
        record['_count'] = {'projects': counts['projects'], 'cycles': counts['cycles']}
        record['joined'] = any(member['user']['id'] == user['id'] for member in record['members'])
        teams.append(record)
    return {'data': teams}


@router.post('')
async def create_team(payload: CreateTeamInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, payload.workspaceId, user['id'])
    name, identifier = payload.name.strip(), payload.identifier.strip().upper()
    if not identifier:
        raise ApiError(400, 'identifier must not be empty', 'Bad Request')
    team_id, now = _cuid(), _utcnow()
    try:
        await db.execute(text('''INSERT INTO teams (id, workspace_id, name, identifier, description, icon, color, created_at, updated_at) VALUES (:id, :workspace_id, :name, :identifier, :description, :icon, :color, :now, :now)'''), {'id': team_id, 'workspace_id': payload.workspaceId, 'name': name, 'identifier': identifier, 'description': payload.description, 'icon': payload.icon or '👥', 'color': payload.color or '#6366f1', 'now': now})
        await db.execute(text("INSERT INTO team_members (team_id, user_id, role) VALUES (:team_id, :user_id, 'LEAD')"), {'team_id': team_id, 'user_id': user['id']})
        await db.execute(text("INSERT INTO document_folders (id, workspace_id, team_id, name, icon, position, created_at, updated_at) VALUES (:id, :workspace_id, :team_id, 'Team documents', '📁', 0, :now, :now)"), {'id': _cuid(), 'workspace_id': payload.workspaceId, 'team_id': team_id, 'now': now})
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A team with this identifier already exists.', 'Conflict') from error
    return {'data': await _detail(db, team_id, payload.workspaceId)}


@router.get('/deleted')
async def list_deleted(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _manager(db, workspaceId, user['id'])
    since = _utcnow() - timedelta(days=RESTORE_WINDOW_DAYS)
    result = await db.execute(text('SELECT id, name, identifier, icon, deleted_at FROM teams WHERE workspace_id = :workspace_id AND deleted_at >= :since ORDER BY deleted_at DESC'), {'workspace_id': workspaceId, 'since': since})
    return {'data': [{'id': row['id'], 'name': row['name'], 'identifier': row['identifier'], 'icon': row['icon'], 'deletedAt': row['deleted_at']} for row in result.mappings().all()]}


@router.get('/{team_id}')
async def get_team(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_role(db, workspaceId, user['id'])
    membership = await db.execute(text('SELECT 1 FROM team_members WHERE team_id = :team_id AND user_id = :user_id'), {'team_id': team_id, 'user_id': user['id']})
    if membership.scalar_one_or_none() is None:
        raise ApiError(404, 'Team not found.', 'Not Found')
    return {'data': await _detail(db, team_id, workspaceId)}


@router.patch('/{team_id}')
async def update_team(team_id: str, payload: UpdateTeamInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    current = await _team_row(db, team_id, workspaceId)
    if not current:
        raise ApiError(404, 'Team not found.', 'Not Found')
    values = payload.model_dump(exclude_unset=True)
    if values.get('defaultIssueTemplateId'):
        template = await db.execute(text('SELECT 1 FROM issue_templates WHERE id = :id AND workspace_id = :workspace_id'), {'id': values['defaultIssueTemplateId'], 'workspace_id': workspaceId})
        if template.scalar_one_or_none() is None: raise ApiError(404, 'Issue template not found.', 'Not Found')
    parent_id = values.get('parentTeamId')
    if parent_id:
        if parent_id == team_id: raise ApiError(400, 'A team cannot be its own parent.', 'Bad Request')
        cursor = parent_id
        while cursor:
            parent = await db.execute(text('SELECT id, parent_team_id FROM teams WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL'), {'id': cursor, 'workspace_id': workspaceId})
            parent_row = parent.mappings().first()
            if not parent_row: raise ApiError(404, 'Parent team not found.', 'Not Found')
            if parent_row['parent_team_id'] == team_id: raise ApiError(400, 'Team hierarchy cannot contain a cycle.', 'Bad Request')
            cursor = parent_row['parent_team_id']
    close_days = values.get('autoCloseDays', current['auto_close_days'])
    archive_days = values.get('autoArchiveDays', current['auto_archive_days'])
    if close_days and archive_days and archive_days < close_days: raise ApiError(400, 'Auto-archive must not run before auto-close.', 'Bad Request')
    columns = {'name': 'name', 'description': 'description', 'icon': 'icon', 'color': 'color', 'triageEnabled': 'triage_enabled', 'joinPolicy': 'join_policy', 'cycleCadenceWeeks': 'cycle_cadence_weeks', 'autoCloseDays': 'auto_close_days', 'autoArchiveDays': 'auto_archive_days', 'parentTeamId': 'parent_team_id', 'defaultIssueTemplateId': 'default_issue_template_id'}
    sets, params = [], {'id': team_id, 'now': _utcnow()}
    for field, column in columns.items():
        if field in values:
            params[field] = values[field].strip() if field in {'name', 'description', 'icon'} and isinstance(values[field], str) else values[field]
            sets.append(f'{column} = :{field}')
    if sets:
        await db.execute(text(f"UPDATE teams SET {', '.join(sets)}, updated_at = :now WHERE id = :id"), params)
        await db.commit()
    return {'data': await _detail(db, team_id, workspaceId)}


async def _retire(db: AsyncSession, team_id: str, workspace_id: str, user_id: str, *, deletion: bool) -> dict[str, Any]:
    now = _utcnow()
    if deletion:
        result = await db.execute(text('UPDATE teams SET archived_at = :now, deleted_at = :now, updated_at = :now WHERE id = :id AND workspace_id = :workspace_id AND deleted_at IS NULL RETURNING *'), {'id': team_id, 'workspace_id': workspace_id, 'now': now})
        action, metadata = 'team.deletion_scheduled', '{"restoreWindowDays":30}'
    else:
        result = await db.execute(text('UPDATE teams SET archived_at = :now, updated_at = :now WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL RETURNING *'), {'id': team_id, 'workspace_id': workspace_id, 'now': now})
        action, metadata = 'team.retired', '{}'
    row = result.mappings().first()
    if not row: raise ApiError(404, 'Team not found.', 'Not Found')
    await _audit(db, workspace_id, user_id, action, team_id, metadata)
    await db.commit()
    return _team(row)


@router.delete('/{team_id}')
async def archive_team(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    return {'data': await _retire(db, team_id, workspaceId, user['id'], deletion=False)}


@router.post('/{team_id}/schedule-deletion')
async def schedule_deletion(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    return {'data': await _retire(db, team_id, workspaceId, user['id'], deletion=True)}


@router.post('/{team_id}/restore')
async def restore_team(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    row = await _team_row(db, team_id, workspaceId, include_archived=True)
    if not row or not row['deleted_at']: raise ApiError(404, 'Deleted team not found.', 'Not Found')
    if row['deleted_at'] + timedelta(days=RESTORE_WINDOW_DAYS) <= _utcnow(): raise ApiError(400, 'The 30-day restoration window has expired.', 'Bad Request')
    result = await db.execute(text('UPDATE teams SET archived_at = NULL, deleted_at = NULL, updated_at = :now WHERE id = :id RETURNING *'), {'id': team_id, 'now': _utcnow()})
    restored = result.mappings().one()
    await _audit(db, workspaceId, user['id'], 'team.restored', team_id)
    await db.commit()
    return {'data': _team(restored)}


@router.post('/{team_id}/members')
async def add_member(team_id: str, payload: TeamMemberInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _manager(db, payload.workspaceId, user['id'])
    if not await _team_row(db, team_id, payload.workspaceId): raise ApiError(404, 'Team not found.', 'Not Found')
    active = await db.execute(text("SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"), {'workspace_id': payload.workspaceId, 'user_id': payload.userId})
    if active.scalar_one_or_none() is None: raise ApiError(404, 'Workspace member not found.', 'Not Found')
    try:
        await db.execute(text('INSERT INTO team_members (team_id, user_id, role) VALUES (:team_id, :user_id, :role)'), {'team_id': team_id, 'user_id': payload.userId, 'role': payload.role})
        await db.commit()
    except IntegrityError as error:
        await db.rollback(); raise ApiError(409, 'This person is already in the team.', 'Conflict') from error
    return {'data': next(entry for entry in await _members(db, team_id) if entry['userId'] == payload.userId)}


@router.post('/{team_id}/join')
async def join_team(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    role = await _workspace_role(db, workspaceId, user['id'])
    team = await _team_row(db, team_id, workspaceId)
    if not team: raise ApiError(404, 'Team not found.', 'Not Found')
    existing = await db.execute(text('SELECT 1 FROM team_members WHERE team_id = :team_id AND user_id = :user_id'), {'team_id': team_id, 'user_id': user['id']})
    if team['join_policy'] == 'INVITE_ONLY' and existing.scalar_one_or_none() is None and role not in {'OWNER', 'ADMIN'}: raise ApiError(403, 'This team is invite-only. Ask a workspace administrator to add you.', 'Forbidden')
    await db.execute(text("INSERT INTO team_members (team_id, user_id, role) VALUES (:team_id, :user_id, 'MEMBER') ON CONFLICT (team_id, user_id) DO NOTHING"), {'team_id': team_id, 'user_id': user['id']})
    await db.commit()
    member = [entry for entry in await _members(db, team_id) if entry['userId'] == user['id']][0]
    return {'data': member}


@router.post('/{team_id}/leave')
async def leave_team(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_role(db, workspaceId, user['id'])
    result = await db.execute(text('DELETE FROM team_members WHERE team_id = :team_id AND user_id = :user_id AND EXISTS (SELECT 1 FROM teams WHERE id = :team_id AND workspace_id = :workspace_id AND archived_at IS NULL) RETURNING team_id'), {'team_id': team_id, 'user_id': user['id'], 'workspace_id': workspaceId})
    if not result.scalar_one_or_none(): raise ApiError(404, 'Team membership not found.', 'Not Found')
    await _audit(db, workspaceId, user['id'], 'team.member.left', team_id, json.dumps({'userId': user['id']}))
    await db.commit()
    return {'data': {'teamId': team_id, 'userId': user['id'], 'removed': True}}


async def _change_member(team_id: str, target_id: str, workspace_id: str, actor_id: str, *, role: str | None) -> dict[str, Any]:
    await _manager(db, workspace_id, actor_id)
    if not await _team_row(db, team_id, workspace_id): raise ApiError(404, 'Team not found.', 'Not Found')
    if role:
        result = await db.execute(text('UPDATE team_members SET role = :role WHERE team_id = :team_id AND user_id = :user_id RETURNING user_id'), {'role': role, 'team_id': team_id, 'user_id': target_id})
    else:
        result = await db.execute(text('DELETE FROM team_members WHERE team_id = :team_id AND user_id = :user_id RETURNING user_id'), {'team_id': team_id, 'user_id': target_id})
    if not result.scalar_one_or_none(): raise ApiError(404, 'Team member not found.', 'Not Found')
    await db.commit()
    if role: return next(entry for entry in await _members(db, team_id) if entry['userId'] == target_id)
    return {'teamId': team_id, 'userId': target_id, 'removed': True}


@router.patch('/{team_id}/members/{user_id}')
async def update_member(team_id: str, user_id: str, payload: TeamMemberRoleInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return {'data': await _change_member(team_id, user_id, workspaceId, user['id'], role=payload.role)}


@router.delete('/{team_id}/members/{user_id}')
async def remove_member(team_id: str, user_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return {'data': await _change_member(team_id, user_id, workspaceId, user['id'], role=None)}
