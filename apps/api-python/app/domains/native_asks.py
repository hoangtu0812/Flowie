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
from .native_issues import CreateIssueInput, create_issue
from .native_projects import _team_access, _workspace_access


router = APIRouter(prefix='/api/v1/asks', tags=['asks'])
AskPriority = Literal['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']
AskStatus = Literal['open', 'accepted', 'declined']


class CreateAskInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    teamId: str = Field(min_length=1)
    projectId: str | None = None
    title: str = Field(min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    priority: AskPriority = 'NONE'


class UpdateAskInput(BaseModel):
    teamId: str | None = None
    projectId: str | None = None
    title: str | None = Field(default=None, min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    priority: AskPriority | None = None
    status: AskStatus | None = None


async def _role(db: AsyncSession, workspace_id: str, user_id: str) -> str:
    result = await db.execute(text("SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"), {'workspace_id': workspace_id, 'user_id': user_id})
    role = result.scalar_one_or_none()
    if not role:
        raise ApiError(403, 'You do not have access to this workspace.', 'Forbidden')
    return role


async def _references(db: AsyncSession, workspace_id: str, team_id: str, project_id: str | None, user_id: str) -> None:
    await _team_access(db, workspace_id, team_id, user_id)
    if project_id:
        result = await db.execute(text('''SELECT 1 FROM projects WHERE id = :project_id AND workspace_id = :workspace_id
                                          AND archived_at IS NULL AND (team_id IS NULL OR team_id = :team_id)'''), {'project_id': project_id, 'workspace_id': workspace_id, 'team_id': team_id})
        if result.scalar_one_or_none() is None:
            raise ApiError(404, 'Ask project not found for this team.', 'Not Found')


async def _audit(db: AsyncSession, workspace_id: str, actor_id: str, action: str, ask_id: str, metadata: dict[str, Any]) -> None:
    await db.execute(text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
                             VALUES (:id, :workspace_id, :actor_id, :action, 'ask', :entity_id, CAST(:metadata AS jsonb), :now)'''), {'id': _cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id, 'action': action, 'entity_id': ask_id, 'metadata': json.dumps(metadata), 'now': _utcnow()})


async def _ask(db: AsyncSession, ask_id: str, workspace_id: str) -> dict[str, Any]:
    result = await db.execute(text('''SELECT ask.*, team.id AS team_id_value, team.name AS team_name, team.identifier AS team_identifier, team.icon AS team_icon,
                                      project.id AS project_id_value, project.name AS project_name, project.identifier AS project_identifier,
                                      creator.id AS creator_id, creator.name AS creator_name, creator.avatar_url AS creator_avatar_url,
                                      issue.id AS issue_id_value, issue.identifier AS issue_identifier, issue.title AS issue_title
                               FROM asks ask JOIN teams team ON team.id = ask.team_id JOIN users creator ON creator.id = ask.created_by
                               LEFT JOIN projects project ON project.id = ask.project_id LEFT JOIN issues issue ON issue.id = ask.converted_issue_id
                               WHERE ask.id = :ask_id AND ask.workspace_id = :workspace_id AND ask.archived_at IS NULL'''), {'ask_id': ask_id, 'workspace_id': workspace_id})
    row = result.mappings().first()
    if not row: raise ApiError(404, 'Ask not found.', 'Not Found')
    return {'id': row['id'], 'workspaceId': row['workspace_id'], 'teamId': row['team_id'], 'projectId': row['project_id'], 'title': row['title'], 'description': row['description'], 'priority': row['priority'], 'status': row['status'], 'createdById': row['created_by'], 'convertedIssueId': row['converted_issue_id'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
            'team': {'id': row['team_id_value'], 'name': row['team_name'], 'identifier': row['team_identifier'], 'icon': row['team_icon']},
            'project': {'id': row['project_id_value'], 'name': row['project_name'], 'identifier': row['project_identifier'], 'team': {'id': row['team_id']} if row['team_id'] else None} if row['project_id_value'] else None,
            'createdBy': {'id': row['creator_id'], 'name': row['creator_name'], 'avatarUrl': row['creator_avatar_url']},
            'convertedIssue': {'id': row['issue_id_value'], 'identifier': row['issue_identifier'], 'title': row['issue_title']} if row['issue_id_value'] else None}


async def _manage(db: AsyncSession, ask: dict[str, Any], workspace_id: str, user_id: str) -> None:
    role = await _role(db, workspace_id, user_id)
    if ask['createdById'] != user_id and role not in {'OWNER', 'ADMIN'}:
        raise ApiError(403, 'Only the creator or a workspace administrator can manage this Ask.', 'Forbidden')


@router.get('')
async def list_asks(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(text('''SELECT ask.id FROM asks ask JOIN team_members member ON member.team_id = ask.team_id
                                      WHERE ask.workspace_id = :workspace_id AND ask.archived_at IS NULL AND member.user_id = :user_id ORDER BY ask.updated_at DESC'''), {'workspace_id': workspaceId, 'user_id': user['id']})
    return {'data': [await _ask(db, row['id'], workspaceId) for row in result.mappings().all()]}


@router.post('')
async def create_ask(payload: CreateAskInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user['id'])
    await _references(db, payload.workspaceId, payload.teamId, payload.projectId, user['id'])
    ask_id, now = _cuid(), _utcnow()
    await db.execute(text('''INSERT INTO asks (id, workspace_id, team_id, project_id, title, description, priority, status, created_by, created_at, updated_at)
                             VALUES (:id, :workspace_id, :team_id, :project_id, :title, :description, :priority, 'open', :created_by, :now, :now)'''), {'id': ask_id, 'workspace_id': payload.workspaceId, 'team_id': payload.teamId, 'project_id': payload.projectId, 'title': payload.title.strip(), 'description': payload.description.strip() if payload.description else None, 'priority': payload.priority, 'created_by': user['id'], 'now': now})
    await _audit(db, payload.workspaceId, user['id'], 'ask.created', ask_id, {'title': payload.title.strip(), 'teamId': payload.teamId})
    await db.commit()
    return {'data': await _ask(db, ask_id, payload.workspaceId)}


@router.patch('/{ask_id}')
async def update_ask(ask_id: str, payload: UpdateAskInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    ask = await _ask(db, ask_id, workspaceId); await _manage(db, ask, workspaceId, user['id'])
    if ask['convertedIssueId']: raise ApiError(400, 'Converted asks cannot be edited.', 'Bad Request')
    values = payload.model_dump(exclude_unset=True)
    if values.get('status') == 'accepted': raise ApiError(400, 'Use the convert action to accept an Ask.', 'Bad Request')
    team_id, project_id = values.get('teamId', ask['teamId']), values.get('projectId', ask['projectId'])
    await _references(db, workspaceId, team_id, project_id, user['id'])
    columns = {'teamId': 'team_id', 'projectId': 'project_id', 'title': 'title', 'description': 'description', 'priority': 'priority', 'status': 'status'}
    sets, params = [], {'ask_id': ask_id, 'now': _utcnow()}
    for field, column in columns.items():
        if field in values:
            value = values[field]
            if field == 'title' and isinstance(value, str): value = value.strip()
            if field == 'description' and isinstance(value, str): value = value.strip() or None
            params[field] = value; sets.append(f'{column} = :{field}')
    if sets:
        await db.execute(text(f"UPDATE asks SET {', '.join(sets)}, updated_at = :now WHERE id = :ask_id"), params)
        await _audit(db, workspaceId, user['id'], 'ask.updated', ask_id, values); await db.commit()
    return {'data': await _ask(db, ask_id, workspaceId)}


@router.post('/{ask_id}/convert')
async def convert_ask(ask_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    ask = await _ask(db, ask_id, workspaceId); await _manage(db, ask, workspaceId, user['id'])
    if ask['convertedIssueId']: return {'data': ask}
    if ask['status'] == 'declined': raise ApiError(400, 'Declined asks cannot be converted.', 'Bad Request')
    issue = await create_issue(CreateIssueInput(workspaceId=workspaceId, teamId=ask['teamId'], projectId=ask['projectId'], title=ask['title'], description=ask['description'], priority=ask['priority']), user, db)
    issue_data = issue['data']
    await db.execute(text("UPDATE asks SET status = 'accepted', converted_issue_id = :issue_id, updated_at = :now WHERE id = :ask_id"), {'issue_id': issue_data['id'], 'ask_id': ask_id, 'now': _utcnow()})
    await _audit(db, workspaceId, user['id'], 'ask.converted', ask_id, {'issueId': issue_data['id'], 'identifier': issue_data['identifier']}); await db.commit()
    return {'data': await _ask(db, ask_id, workspaceId)}


@router.delete('/{ask_id}')
async def archive_ask(ask_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    ask = await _ask(db, ask_id, workspaceId); await _manage(db, ask, workspaceId, user['id'])
    now = _utcnow(); await db.execute(text('UPDATE asks SET archived_at = :now, updated_at = :now WHERE id = :ask_id'), {'ask_id': ask_id, 'now': now})
    await _audit(db, workspaceId, user['id'], 'ask.archived', ask_id, {'title': ask['title']}); await db.commit()
    return {'data': {'id': ask_id, 'archivedAt': now}}
