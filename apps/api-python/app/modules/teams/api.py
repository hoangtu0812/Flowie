from __future__ import annotations

import json
import re
from datetime import timedelta
from typing import Any, Literal

from fastapi import Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.membership import manager, owner, workspace_role
from ..identity.auth import current_user
from .commands import (
    ADD_MEMBER_INSERT_TEAM_MEMBERS,
    AUDIT_INSERT_AUDIT_LOGS,
    CHANGE_MEMBER_DELETE_TEAM_MEMBERS,
    CHANGE_MEMBER_UPDATE_TEAM_MEMBERS,
    CREATE_TEAM_INSERT_DOCUMENT_FOLDERS,
    CREATE_TEAM_INSERT_TEAM_MEMBERS,
    CREATE_TEAM_INSERT_TEAMS,
    JOIN_TEAM_INSERT_TEAM_MEMBERS,
    LEAVE_TEAM_DELETE_TEAM_MEMBERS,
    RESTORE_TEAM_UPDATE_TEAMS,
    RETIRE_UPDATE_TEAMS,
    RETIRE_UPDATE_TEAMS_2,
    UPDATE_TEAM_UPDATE_ISSUES,
    UPDATE_TEAM_UPDATE_ISSUES_2,
    update_team_update_teams_sql,
)
from .queries import (
    ADD_MEMBER_SELECT_WORKSPACE_MEMBERS,
    COUNTS_SELECT_ISSUES,
    GET_TEAM_SELECT_TEAM_MEMBERS,
    LIST_DELETED_SELECT_TEAMS,
    LIST_TEAMS_SELECT_TEAMS,
    MEMBERS_SELECT_TEAM_MEMBERS,
    UPDATE_TEAM_SELECT_ISSUE_TEMPLATES,
    UPDATE_TEAM_SELECT_TEAMS,
    team_row_select_teams_sql,
)

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
    # The identifier is the issue prefix (GEN-1, GEN-2). Renaming it renumbers
    # nothing: only the printed prefix of the team's existing issues changes.
    identifier: str | None = Field(default=None, min_length=1, max_length=12)
    description: str | None = Field(default=None, max_length=500)
    icon: str | None = Field(default=None, max_length=16)
    color: str | None = Field(default=None, pattern=r'^#[0-9a-fA-F]{6}$')
    triageEnabled: bool | None = None
    joinPolicy: Literal['INVITE_ONLY'] | None = None
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


def team_record(row: Any) -> dict[str, Any]:
    # Owner-managed membership also applies to legacy teams stored with OPEN access.
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'name': row['name'],
        'identifier': row['identifier'], 'description': row['description'], 'icon': row['icon'],
        'color': row['color'], 'joinPolicy': 'INVITE_ONLY', 'triageEnabled': row['triage_enabled'],
        'cycleCadenceWeeks': row['cycle_cadence_weeks'], 'autoCloseDays': row['auto_close_days'],
        'autoArchiveDays': row['auto_archive_days'], 'parentTeamId': row['parent_team_id'],
        'defaultIssueTemplateId': row['default_issue_template_id'], 'archivedAt': row['archived_at'],
        'deletedAt': row['deleted_at'], 'issueSequence': row['issue_sequence'],
        'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
    }


async def _team_row(db: AsyncSession, team_id: str, workspace_id: str, *, include_archived: bool = False) -> Any | None:
    condition = '' if include_archived else 'AND archived_at IS NULL'
    result = await db.execute(team_row_select_teams_sql(condition), {'team_id': team_id, 'workspace_id': workspace_id})
    return result.mappings().first()


async def _members(db: AsyncSession, team_id: str) -> list[dict[str, Any]]:
    result = await db.execute(MEMBERS_SELECT_TEAM_MEMBERS, {'team_id': team_id})
    return [{'teamId': row['team_id'], 'userId': row['user_id'], 'role': row['role'], 'createdAt': row['created_at'], 'user': {'id': row['id'], 'name': row['name'], 'email': row['email'], 'avatarUrl': row['avatar_url'], 'title': row['title']}} for row in result.mappings().all()]


async def _counts(db: AsyncSession, team_id: str) -> dict[str, int]:
    result = await db.execute(COUNTS_SELECT_ISSUES, {'team_id': team_id})
    row = result.mappings().one()
    return {'issues': row['issues'], 'projects': row['projects'], 'cycles': row['cycles'], 'documents': row['documents']}


async def _detail(db: AsyncSession, team_id: str, workspace_id: str) -> dict[str, Any]:
    row = await _team_row(db, team_id, workspace_id)
    if not row:
        raise ApiError(404, 'Team not found.', 'Not Found')
    record = team_record(row)
    record['members'] = await _members(db, team_id)
    record['_count'] = await _counts(db, team_id)
    return record


async def _audit(db: AsyncSession, workspace_id: str, actor_id: str, action: str, team_id: str, metadata: str = '{}') -> None:
    await db.execute(AUDIT_INSERT_AUDIT_LOGS, {'id': cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id, 'action': action, 'team_id': team_id, 'metadata': metadata, 'now': utcnow()})


@router.get('')
async def list_teams(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await workspace_role(db, workspaceId, user['id'])
    result = await db.execute(LIST_TEAMS_SELECT_TEAMS, {'workspace_id': workspaceId})
    teams = []
    for row in result.mappings().all():
        record = team_record(row)
        record['members'] = await _members(db, row['id'])
        counts = await _counts(db, row['id'])
        record['_count'] = {'projects': counts['projects'], 'cycles': counts['cycles']}
        record['joined'] = any(member['user']['id'] == user['id'] for member in record['members'])
        teams.append(record)
    return {'data': teams}


@router.post('')
async def create_team(payload: CreateTeamInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, payload.workspaceId, user['id'])
    name, identifier = payload.name.strip(), payload.identifier.strip().upper()
    if not identifier:
        raise ApiError(400, 'identifier must not be empty', 'Bad Request')
    team_id, now = cuid(), utcnow()
    try:
        await db.execute(CREATE_TEAM_INSERT_TEAMS, {'id': team_id, 'workspace_id': payload.workspaceId, 'name': name, 'identifier': identifier, 'description': payload.description, 'icon': payload.icon or '👥', 'color': payload.color or '#6366f1', 'now': now})
        # Administrators may create teams, but only an owner can grant membership.
        if await workspace_role(db, payload.workspaceId, user['id']) == 'OWNER':
            await owner(db, payload.workspaceId, user['id'])
            await db.execute(CREATE_TEAM_INSERT_TEAM_MEMBERS, {'team_id': team_id, 'user_id': user['id']})
        await db.execute(CREATE_TEAM_INSERT_DOCUMENT_FOLDERS, {'id': cuid(), 'workspace_id': payload.workspaceId, 'team_id': team_id, 'now': now})
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A team with this identifier already exists.', 'Conflict') from error
    return {'data': await _detail(db, team_id, payload.workspaceId)}


@router.get('/deleted')
async def list_deleted(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await manager(db, workspaceId, user['id'])
    since = utcnow() - timedelta(days=RESTORE_WINDOW_DAYS)
    result = await db.execute(LIST_DELETED_SELECT_TEAMS, {'workspace_id': workspaceId, 'since': since})
    return {'data': [{'id': row['id'], 'name': row['name'], 'identifier': row['identifier'], 'icon': row['icon'], 'deletedAt': row['deleted_at']} for row in result.mappings().all()]}


@router.get('/{team_id}')
async def get_team(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await workspace_role(db, workspaceId, user['id'])
    membership = await db.execute(GET_TEAM_SELECT_TEAM_MEMBERS, {'team_id': team_id, 'user_id': user['id']})
    if membership.scalar_one_or_none() is None:
        raise ApiError(404, 'Team not found.', 'Not Found')
    return {'data': await _detail(db, team_id, workspaceId)}


@router.patch('/{team_id}')
async def update_team(team_id: str, payload: UpdateTeamInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, workspaceId, user['id'])
    current = await _team_row(db, team_id, workspaceId)
    if not current:
        raise ApiError(404, 'Team not found.', 'Not Found')
    values = payload.model_dump(exclude_unset=True)
    if values.get('defaultIssueTemplateId'):
        template = await db.execute(UPDATE_TEAM_SELECT_ISSUE_TEMPLATES, {'id': values['defaultIssueTemplateId'], 'workspace_id': workspaceId})
        if template.scalar_one_or_none() is None: raise ApiError(404, 'Issue template not found.', 'Not Found')
    parent_id = values.get('parentTeamId')
    if parent_id:
        if parent_id == team_id: raise ApiError(400, 'A team cannot be its own parent.', 'Bad Request')
        cursor = parent_id
        while cursor:
            parent = await db.execute(UPDATE_TEAM_SELECT_TEAMS, {'id': cursor, 'workspace_id': workspaceId})
            parent_row = parent.mappings().first()
            if not parent_row: raise ApiError(404, 'Parent team not found.', 'Not Found')
            if parent_row['parent_team_id'] == team_id: raise ApiError(400, 'Team hierarchy cannot contain a cycle.', 'Bad Request')
            cursor = parent_row['parent_team_id']
    identifier = None
    if 'identifier' in values:
        identifier = (values.pop('identifier') or '').strip().upper()
        if not re.fullmatch(r'[A-Z0-9]{1,12}', identifier):
            raise ApiError(400, 'The issue prefix must be 1 to 12 letters or digits.', 'Bad Request')
        if identifier == current['identifier']:
            identifier = None
    close_days = values.get('autoCloseDays', current['auto_close_days'])
    archive_days = values.get('autoArchiveDays', current['auto_archive_days'])
    if close_days and archive_days and archive_days < close_days: raise ApiError(400, 'Auto-archive must not run before auto-close.', 'Bad Request')
    columns = {'name': 'name', 'description': 'description', 'icon': 'icon', 'color': 'color', 'triageEnabled': 'triage_enabled', 'joinPolicy': 'join_policy', 'cycleCadenceWeeks': 'cycle_cadence_weeks', 'autoCloseDays': 'auto_close_days', 'autoArchiveDays': 'auto_archive_days', 'parentTeamId': 'parent_team_id', 'defaultIssueTemplateId': 'default_issue_template_id'}
    sets, params = [], {'id': team_id, 'now': utcnow()}
    for field, column in columns.items():
        if field in values:
            params[field] = values[field].strip() if field in {'name', 'description', 'icon'} and isinstance(values[field], str) else values[field]
            sets.append(f'{column} = :{field}')
    if identifier:
        params['identifier'] = identifier
        sets.append('identifier = :identifier')
    if sets:
        try:
            await db.execute(update_team_update_teams_sql(sets), params)
            if identifier:
                # Issue identifiers are stored, not derived, so the printed code of
                # every existing issue has to follow the team prefix. The sequence
                # number is kept, which keeps every issue's history recognisable.
                await db.execute(
                    UPDATE_TEAM_UPDATE_ISSUES,
                    {'identifier': identifier, 'id': team_id, 'workspace_id': workspaceId, 'now': params['now']},
                )
                # Inbox entries deep-link by identifier, so repoint them at the new
                # code instead of leaving the notification on a dead URL.
                await db.execute(
                    UPDATE_TEAM_UPDATE_ISSUES_2,
                    {'id': team_id},
                )
                await _audit(db, workspaceId, user['id'], 'team.identifier_changed', team_id, json.dumps({'from': current['identifier'], 'to': identifier}))
            await db.commit()
        except IntegrityError as error:
            await db.rollback()
            raise ApiError(409, 'A team with this issue prefix already exists.', 'Conflict') from error
    return {'data': await _detail(db, team_id, workspaceId)}


async def _retire(db: AsyncSession, team_id: str, workspace_id: str, user_id: str, *, deletion: bool) -> dict[str, Any]:
    now = utcnow()
    if deletion:
        result = await db.execute(RETIRE_UPDATE_TEAMS, {'id': team_id, 'workspace_id': workspace_id, 'now': now})
        action, metadata = 'team.deletion_scheduled', '{"restoreWindowDays":30}'
    else:
        result = await db.execute(RETIRE_UPDATE_TEAMS_2, {'id': team_id, 'workspace_id': workspace_id, 'now': now})
        action, metadata = 'team.retired', '{}'
    row = result.mappings().first()
    if not row: raise ApiError(404, 'Team not found.', 'Not Found')
    await _audit(db, workspace_id, user_id, action, team_id, metadata)
    await db.commit()
    return team_record(row)


@router.delete('/{team_id}')
async def archive_team(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, workspaceId, user['id'])
    return {'data': await _retire(db, team_id, workspaceId, user['id'], deletion=False)}


@router.post('/{team_id}/schedule-deletion')
async def schedule_deletion(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, workspaceId, user['id'])
    return {'data': await _retire(db, team_id, workspaceId, user['id'], deletion=True)}


@router.post('/{team_id}/restore')
async def restore_team(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await manager(db, workspaceId, user['id'])
    row = await _team_row(db, team_id, workspaceId, include_archived=True)
    if not row or not row['deleted_at']: raise ApiError(404, 'Deleted team not found.', 'Not Found')
    if row['deleted_at'] + timedelta(days=RESTORE_WINDOW_DAYS) <= utcnow(): raise ApiError(400, 'The 30-day restoration window has expired.', 'Bad Request')
    result = await db.execute(RESTORE_TEAM_UPDATE_TEAMS, {'id': team_id, 'now': utcnow()})
    restored = result.mappings().one()
    await _audit(db, workspaceId, user['id'], 'team.restored', team_id)
    await db.commit()
    return {'data': team_record(restored)}


@router.post('/{team_id}/members')
async def add_member(team_id: str, payload: TeamMemberInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await owner(db, payload.workspaceId, user['id'])
    if not await _team_row(db, team_id, payload.workspaceId): raise ApiError(404, 'Team not found.', 'Not Found')
    active = await db.execute(ADD_MEMBER_SELECT_WORKSPACE_MEMBERS, {'workspace_id': payload.workspaceId, 'user_id': payload.userId})
    if active.scalar_one_or_none() is None: raise ApiError(404, 'Workspace member not found.', 'Not Found')
    try:
        await db.execute(ADD_MEMBER_INSERT_TEAM_MEMBERS, {'team_id': team_id, 'user_id': payload.userId, 'role': payload.role})
        await db.commit()
    except IntegrityError as error:
        await db.rollback(); raise ApiError(409, 'This person is already in the team.', 'Conflict') from error
    return {'data': next(entry for entry in await _members(db, team_id) if entry['userId'] == payload.userId)}


@router.post('/{team_id}/join')
async def join_team(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await owner(db, workspaceId, user['id'])
    team = await _team_row(db, team_id, workspaceId)
    if not team: raise ApiError(404, 'Team not found.', 'Not Found')
    await db.execute(JOIN_TEAM_INSERT_TEAM_MEMBERS, {'team_id': team_id, 'user_id': user['id']})
    await db.commit()
    member = [entry for entry in await _members(db, team_id) if entry['userId'] == user['id']][0]
    return {'data': member}


@router.post('/{team_id}/leave')
async def leave_team(team_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await workspace_role(db, workspaceId, user['id'])
    result = await db.execute(LEAVE_TEAM_DELETE_TEAM_MEMBERS, {'team_id': team_id, 'user_id': user['id'], 'workspace_id': workspaceId})
    if not result.scalar_one_or_none(): raise ApiError(404, 'Team membership not found.', 'Not Found')
    await _audit(db, workspaceId, user['id'], 'team.member.left', team_id, json.dumps({'userId': user['id']}))
    await db.commit()
    return {'data': {'teamId': team_id, 'userId': user['id'], 'removed': True}}


async def _change_member(team_id: str, target_id: str, workspace_id: str, actor_id: str, *, role: str | None, db: AsyncSession) -> dict[str, Any]:
    await manager(db, workspace_id, actor_id)
    if not await _team_row(db, team_id, workspace_id): raise ApiError(404, 'Team not found.', 'Not Found')
    if role:
        result = await db.execute(CHANGE_MEMBER_UPDATE_TEAM_MEMBERS, {'role': role, 'team_id': team_id, 'user_id': target_id})
    else:
        result = await db.execute(CHANGE_MEMBER_DELETE_TEAM_MEMBERS, {'team_id': team_id, 'user_id': target_id})
    if not result.scalar_one_or_none(): raise ApiError(404, 'Team member not found.', 'Not Found')
    await db.commit()
    if role: return next(entry for entry in await _members(db, team_id) if entry['userId'] == target_id)
    return {'teamId': team_id, 'userId': target_id, 'removed': True}


@router.patch('/{team_id}/members/{user_id}')
async def update_member(team_id: str, user_id: str, payload: TeamMemberRoleInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return {'data': await _change_member(team_id, user_id, workspaceId, user['id'], role=payload.role, db=db)}


@router.delete('/{team_id}/members/{user_id}')
async def remove_member(team_id: str, user_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return {'data': await _change_member(team_id, user_id, workspaceId, user['id'], role=None, db=db)}
