from __future__ import annotations

import json
from typing import Any

from fastapi import Depends, Query, WebSocket
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.projects import workspace_access
from ..identity.auth import current_user
from .access import notification_scope
from .commands import (
    DELETE_ALL_NOTIFICATIONS_DELETE_NOTIFICATIONS,
    DELETE_COMPLETED_ISSUE_NOTIFICATIONS_DELETE_NOTIFICATIONS,
    DELETE_READ_NOTIFICATIONS_DELETE_NOTIFICATIONS,
    MARK_ALL_READ_UPDATE_NOTIFICATIONS,
    MARK_READ_UPDATE_NOTIFICATIONS,
    UPDATE_NOTIFICATION_PREFERENCES_INSERT_AUDIT_LOGS,
    UPDATE_NOTIFICATION_PREFERENCES_INSERT_NOTIFICATION_PREFERENCES,
)
from .queries import (
    NOTIFICATION_PREFERENCES_SELECT_NOTIFICATION_PREFERENCES,
    list_notifications_select_notifications_sql,
    notification_exists_select_notifications_sql,
)

router = APIRouter(prefix='/api/v1/notifications', tags=['notifications'])


class NotificationPreferencesInput(BaseModel):
    teamIssueAdded: bool
    issueCompleted: bool
    issueAddedToTriage: bool


async def _access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    await workspace_access(db, workspace_id, user_id)


@router.websocket('/stream')
async def notification_stream(websocket: WebSocket, workspaceId: str = Query(min_length=1)) -> None:
    from ..identity.security.realtime import serve_notifications
    await serve_notifications(websocket, workspaceId)


@router.get('')
async def list_notifications(
    workspaceId: str = Query(min_length=1),
    includeSnoozed: bool = False,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _access(db, workspaceId, user['id'])
    result = await db.execute(
        list_notifications_select_notifications_sql(notification_scope),
        {'workspace_id': workspaceId, 'user_id': user['id'], 'include_snoozed':includeSnoozed, 'now':utcnow()},
    )
    return {'data': [
        {
            'id': row['id'], 'workspaceId': row['workspace_id'], 'userId': row['user_id'],
            'type': row['type'], 'entityType': row['entity_type'], 'entityId': row['entity_id'],
            'data': row['data'] or {}, 'readAt': row['read_at'], 'createdAt': row['created_at'], 'snoozedUntil':row['snoozed_until'],
        }
        for row in result.mappings().all()
    ]}


@router.get('/preferences')
async def notification_preferences(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, bool]]:
    """A member with no stored row simply has every notification switched off."""

    await _access(db, workspaceId, user['id'])
    result = await db.execute(
        NOTIFICATION_PREFERENCES_SELECT_NOTIFICATION_PREFERENCES,
        {'workspace_id': workspaceId, 'user_id': user['id']},
    )
    row = result.mappings().first()
    return {
        'data': {
            'teamIssueAdded': bool(row['team_issue_added']) if row else False,
            'issueCompleted': bool(row['issue_completed']) if row else False,
            'issueAddedToTriage': bool(row['issue_added_to_triage']) if row else False,
        }
    }


@router.patch('/preferences')
async def update_notification_preferences(
    payload: NotificationPreferencesInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, bool]]:
    await _access(db, workspaceId, user['id'])
    now = utcnow()
    await db.execute(
        UPDATE_NOTIFICATION_PREFERENCES_INSERT_NOTIFICATION_PREFERENCES,
        {
            'workspace_id': workspaceId,
            'user_id': user['id'],
            'team_issue_added': payload.teamIssueAdded,
            'issue_completed': payload.issueCompleted,
            'issue_added_to_triage': payload.issueAddedToTriage,
            'now': now,
        },
    )
    await db.execute(
        UPDATE_NOTIFICATION_PREFERENCES_INSERT_AUDIT_LOGS,
        {
            'id': cuid(),
            'workspace_id': workspaceId,
            'actor_id': user['id'],
            'metadata': json.dumps(payload.model_dump()),
            'now': now,
        },
    )
    await db.commit()
    return {'data': payload.model_dump()}


async def _notification_exists(
    db: AsyncSession, notification_id: str, workspace_id: str, user_id: str
) -> None:
    result = await db.execute(
        notification_exists_select_notifications_sql(notification_scope),
        {'id': notification_id, 'workspace_id': workspace_id, 'user_id': user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(404, 'Notification not found.', 'Not Found')


@router.post('/read-all')
async def mark_all_read(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    await _access(db, workspaceId, user['id'])
    await db.execute(
        MARK_ALL_READ_UPDATE_NOTIFICATIONS,
        {'now': utcnow(), 'workspace_id': workspaceId, 'user_id': user['id']},
    )
    await db.commit()
    return {'ok': True}


@router.post('/{notification_id}/read')
async def mark_read(
    notification_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    await _access(db, workspaceId, user['id'])
    await _notification_exists(db, notification_id, workspaceId, user['id'])
    await db.execute(
        MARK_READ_UPDATE_NOTIFICATIONS,
        {'id': notification_id, 'now': utcnow()},
    )
    await db.commit()
    return {'ok': True}


@router.delete('')
async def delete_all_notifications(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    await _access(db, workspaceId, user['id'])
    await db.execute(
        DELETE_ALL_NOTIFICATIONS_DELETE_NOTIFICATIONS,
        {'workspace_id': workspaceId, 'user_id': user['id']},
    )
    await db.commit()
    return {'ok': True}


@router.delete('/read')
async def delete_read_notifications(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    await _access(db, workspaceId, user['id'])
    await db.execute(
        DELETE_READ_NOTIFICATIONS_DELETE_NOTIFICATIONS,
        {'workspace_id': workspaceId, 'user_id': user['id']},
    )
    await db.commit()
    return {'ok': True}


@router.delete('/completed-issues')
async def delete_completed_issue_notifications(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    await _access(db, workspaceId, user['id'])
    await db.execute(
        DELETE_COMPLETED_ISSUE_NOTIFICATIONS_DELETE_NOTIFICATIONS,
        {'workspace_id': workspaceId, 'user_id': user['id']},
    )
    await db.commit()
    return {'ok': True}
