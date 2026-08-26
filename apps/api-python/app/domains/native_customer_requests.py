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
from .native_projects import _workspace_access


router = APIRouter(prefix='/api/v1/customer-requests', tags=['customer-requests'])
RequestSource = Literal['manual', 'interview', 'support', 'sales', 'other']
RequestStatus = Literal['open', 'planned', 'in-progress', 'completed', 'declined']
RequestPriority = Literal['none', 'low', 'medium', 'high', 'urgent']


class CreateCustomerRequestInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    title: str = Field(min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=5000)
    customer: str = Field(min_length=1, max_length=240)
    source: RequestSource = 'manual'
    status: RequestStatus = 'open'
    priority: RequestPriority = 'none'
    projectId: str | None = None
    issueId: str | None = None


class UpdateCustomerRequestInput(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=5000)
    customer: str | None = Field(default=None, min_length=1, max_length=240)
    source: RequestSource | None = None
    status: RequestStatus | None = None
    priority: RequestPriority | None = None
    projectId: str | None = None
    issueId: str | None = None


async def _role(db: AsyncSession, workspace_id: str, user_id: str) -> str:
    result = await db.execute(
        text('SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = \'ACTIVE\''),
        {'workspace_id': workspace_id, 'user_id': user_id},
    )
    role = result.scalar_one_or_none()
    if not role:
        raise ApiError(403, 'You do not have access to this workspace.', 'Forbidden')
    return role


async def _references(db: AsyncSession, workspace_id: str, project_id: str | None, issue_id: str | None) -> None:
    if project_id:
        result = await db.execute(text('SELECT 1 FROM projects WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL'), {'id': project_id, 'workspace_id': workspace_id})
        if result.scalar_one_or_none() is None:
            raise ApiError(404, 'Project not found in this workspace.', 'Not Found')
    if issue_id:
        result = await db.execute(text('SELECT 1 FROM issues WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL'), {'id': issue_id, 'workspace_id': workspace_id})
        if result.scalar_one_or_none() is None:
            raise ApiError(404, 'Issue not found in this workspace.', 'Not Found')


async def _audit(db: AsyncSession, workspace_id: str, actor_id: str, action: str, request_id: str, metadata: dict[str, Any]) -> None:
    await db.execute(text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
                             VALUES (:id, :workspace_id, :actor_id, :action, 'customer-request', :entity_id, CAST(:metadata AS jsonb), :now)'''), {'id': _cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id, 'action': action, 'entity_id': request_id, 'metadata': json.dumps(metadata), 'now': _utcnow()})


async def _request(db: AsyncSession, request_id: str, workspace_id: str) -> dict[str, Any]:
    result = await db.execute(text('''SELECT request.*, creator.id AS creator_id, creator.name AS creator_name, creator.avatar_url AS creator_avatar_url,
                                      project.id AS project_id_value, project.name AS project_name, project.identifier AS project_identifier,
                                      issue.id AS issue_id_value, issue.identifier AS issue_identifier, issue.title AS issue_title
                               FROM customer_requests request
                               JOIN users creator ON creator.id = request.created_by
                               LEFT JOIN projects project ON project.id = request.project_id
                               LEFT JOIN issues issue ON issue.id = request.issue_id
                               WHERE request.id = :request_id AND request.workspace_id = :workspace_id AND request.archived_at IS NULL'''), {'request_id': request_id, 'workspace_id': workspace_id})
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Customer request not found.', 'Not Found')
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'title': row['title'], 'description': row['description'], 'customer': row['customer'], 'source': row['source'], 'status': row['status'], 'priority': row['priority'], 'projectId': row['project_id'], 'issueId': row['issue_id'], 'createdById': row['created_by'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'project': {'id': row['project_id_value'], 'name': row['project_name'], 'identifier': row['project_identifier']} if row['project_id_value'] else None,
        'issue': {'id': row['issue_id_value'], 'identifier': row['issue_identifier'], 'title': row['issue_title']} if row['issue_id_value'] else None,
        'createdBy': {'id': row['creator_id'], 'name': row['creator_name'], 'avatarUrl': row['creator_avatar_url']},
    }


async def _can_manage(db: AsyncSession, request: dict[str, Any], workspace_id: str, user_id: str) -> None:
    role = await _role(db, workspace_id, user_id)
    if request['createdById'] != user_id and role not in {'OWNER', 'ADMIN'}:
        raise ApiError(403, 'Only the creator or a workspace administrator can edit this request.', 'Forbidden')


@router.get('')
async def list_customer_requests(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(text('SELECT id FROM customer_requests WHERE workspace_id = :workspace_id AND archived_at IS NULL ORDER BY updated_at DESC'), {'workspace_id': workspaceId})
    return {'data': [await _request(db, row['id'], workspaceId) for row in result.mappings().all()]}


@router.post('')
async def create_customer_request(payload: CreateCustomerRequestInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user['id'])
    await _references(db, payload.workspaceId, payload.projectId, payload.issueId)
    request_id, now = _cuid(), _utcnow()
    await db.execute(text('''INSERT INTO customer_requests (id, workspace_id, title, description, customer, source, status, priority, project_id, issue_id, created_by, created_at, updated_at)
                             VALUES (:id, :workspace_id, :title, :description, :customer, :source, :status, :priority, :project_id, :issue_id, :created_by, :now, :now)'''), {'id': request_id, 'workspace_id': payload.workspaceId, 'title': payload.title.strip(), 'description': payload.description.strip() if payload.description else None, 'customer': payload.customer.strip(), 'source': payload.source, 'status': payload.status, 'priority': payload.priority, 'project_id': payload.projectId, 'issue_id': payload.issueId, 'created_by': user['id'], 'now': now})
    await _audit(db, payload.workspaceId, user['id'], 'customer-request.created', request_id, {'title': payload.title.strip(), 'customer': payload.customer.strip()})
    await db.commit()
    return {'data': await _request(db, request_id, payload.workspaceId)}


@router.patch('/{request_id}')
async def update_customer_request(request_id: str, payload: UpdateCustomerRequestInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    current = await _request(db, request_id, workspaceId)
    await _can_manage(db, current, workspaceId, user['id'])
    values = payload.model_dump(exclude_unset=True)
    await _references(db, workspaceId, values.get('projectId', current['projectId']), values.get('issueId', current['issueId']))
    columns = {'title': 'title', 'description': 'description', 'customer': 'customer', 'source': 'source', 'status': 'status', 'priority': 'priority', 'projectId': 'project_id', 'issueId': 'issue_id'}
    sets, params = [], {'request_id': request_id, 'now': _utcnow()}
    for field, column in columns.items():
        if field not in values:
            continue
        value = values[field]
        if field in {'title', 'customer'} and isinstance(value, str): value = value.strip()
        if field == 'description' and isinstance(value, str): value = value.strip() or None
        params[field] = value
        sets.append(f'{column} = :{field}')
    if sets:
        await db.execute(text(f"UPDATE customer_requests SET {', '.join(sets)}, updated_at = :now WHERE id = :request_id"), params)
        await _audit(db, workspaceId, user['id'], 'customer-request.updated', request_id, values)
        await db.commit()
    return {'data': await _request(db, request_id, workspaceId)}


@router.delete('/{request_id}')
async def archive_customer_request(request_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    current = await _request(db, request_id, workspaceId)
    await _can_manage(db, current, workspaceId, user['id'])
    now = _utcnow()
    await db.execute(text('UPDATE customer_requests SET archived_at = :now, updated_at = :now WHERE id = :request_id'), {'request_id': request_id, 'now': now})
    await _audit(db, workspaceId, user['id'], 'customer-request.archived', request_id, {'title': current['title'], 'customer': current['customer']})
    await db.commit()
    return {'data': {'id': request_id, 'archivedAt': now}}
