from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.projects import workspace_access
from ..identity.auth import current_user
from .commands import (
    ARCHIVE_CUSTOMER_REQUEST_UPDATE_CUSTOMER_REQUESTS,
    AUDIT_INSERT_AUDIT_LOGS_2,
    CREATE_CUSTOMER_REQUEST_INSERT_CUSTOMER_REQUESTS,
    update_customer_request_update_customer_requests_sql,
)
from .queries import (
    LIST_CUSTOMER_REQUESTS_SELECT_CUSTOMER_REQUESTS,
    REFERENCES_SELECT_ISSUES,
    REFERENCES_SELECT_PROJECTS_2,
    REQUEST_SELECT_CUSTOMER_REQUESTS,
    ROLE_SELECT_WORKSPACE_MEMBERS_2,
)

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
        ROLE_SELECT_WORKSPACE_MEMBERS_2,
        {'workspace_id': workspace_id, 'user_id': user_id},
    )
    role = result.scalar_one_or_none()
    if not role:
        raise ApiError(403, 'You do not have access to this workspace.', 'Forbidden')
    return role


async def _references(db: AsyncSession, workspace_id: str, project_id: str | None, issue_id: str | None) -> None:
    if project_id:
        result = await db.execute(REFERENCES_SELECT_PROJECTS_2, {'id': project_id, 'workspace_id': workspace_id})
        if result.scalar_one_or_none() is None:
            raise ApiError(404, 'Project not found in this workspace.', 'Not Found')
    if issue_id:
        result = await db.execute(REFERENCES_SELECT_ISSUES, {'id': issue_id, 'workspace_id': workspace_id})
        if result.scalar_one_or_none() is None:
            raise ApiError(404, 'Issue not found in this workspace.', 'Not Found')


async def _audit(db: AsyncSession, workspace_id: str, actor_id: str, action: str, request_id: str, metadata: dict[str, Any]) -> None:
    await db.execute(AUDIT_INSERT_AUDIT_LOGS_2, {'id': cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id, 'action': action, 'entity_id': request_id, 'metadata': json.dumps(metadata), 'now': utcnow()})


async def _request(db: AsyncSession, request_id: str, workspace_id: str) -> dict[str, Any]:
    result = await db.execute(REQUEST_SELECT_CUSTOMER_REQUESTS, {'request_id': request_id, 'workspace_id': workspace_id})
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
    await workspace_access(db, workspaceId, user['id'])
    result = await db.execute(LIST_CUSTOMER_REQUESTS_SELECT_CUSTOMER_REQUESTS, {'workspace_id': workspaceId})
    return {'data': [await _request(db, row['id'], workspaceId) for row in result.mappings().all()]}


@router.post('')
async def create_customer_request(payload: CreateCustomerRequestInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await workspace_access(db, payload.workspaceId, user['id'])
    await _references(db, payload.workspaceId, payload.projectId, payload.issueId)
    request_id, now = cuid(), utcnow()
    await db.execute(CREATE_CUSTOMER_REQUEST_INSERT_CUSTOMER_REQUESTS, {'id': request_id, 'workspace_id': payload.workspaceId, 'title': payload.title.strip(), 'description': payload.description.strip() if payload.description else None, 'customer': payload.customer.strip(), 'source': payload.source, 'status': payload.status, 'priority': payload.priority, 'project_id': payload.projectId, 'issue_id': payload.issueId, 'created_by': user['id'], 'now': now})
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
    sets, params = [], {'request_id': request_id, 'now': utcnow()}
    for field, column in columns.items():
        if field not in values:
            continue
        value = values[field]
        if field in {'title', 'customer'} and isinstance(value, str): value = value.strip()
        if field == 'description' and isinstance(value, str): value = value.strip() or None
        params[field] = value
        sets.append(f'{column} = :{field}')
    if sets:
        await db.execute(update_customer_request_update_customer_requests_sql(sets), params)
        await _audit(db, workspaceId, user['id'], 'customer-request.updated', request_id, values)
        await db.commit()
    return {'data': await _request(db, request_id, workspaceId)}


@router.delete('/{request_id}')
async def archive_customer_request(request_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    current = await _request(db, request_id, workspaceId)
    await _can_manage(db, current, workspaceId, user['id'])
    now = utcnow()
    await db.execute(ARCHIVE_CUSTOMER_REQUEST_UPDATE_CUSTOMER_REQUESTS, {'request_id': request_id, 'now': now})
    await _audit(db, workspaceId, user['id'], 'customer-request.archived', request_id, {'title': current['title'], 'customer': current['customer']})
    await db.commit()
    return {'data': {'id': request_id, 'archivedAt': now}}
