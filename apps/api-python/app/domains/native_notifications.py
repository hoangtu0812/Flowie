from __future__ import annotations

import json
from typing import Any

import jwt
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .native_projects import _workspace_access
from ..services.notification_events import notification_hub


router = APIRouter(prefix='/api/v1/notifications', tags=['notifications'])


class NotificationPreferencesInput(BaseModel):
    teamIssueAdded: bool
    issueCompleted: bool
    issueAddedToTriage: bool


async def _access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    await _workspace_access(db, workspace_id, user_id)


@router.websocket('/stream')
async def notification_stream(websocket: WebSocket, workspaceId: str = Query(min_length=1)) -> None:
    """Authenticated, cookie-backed real-time delivery for the Inbox.

    The browser keeps the same ``flowie_access`` cookie used by REST requests;
    no token is exposed in a query string or client-side storage.
    """

    token = websocket.cookies.get('flowie_access')
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = jwt.decode(
            token,
            websocket.app.state.settings.auth_jwt_secret,
            algorithms=['HS256'],
        )
        user_id = payload.get('sub')
        if not isinstance(user_id, str):
            raise jwt.PyJWTError('missing subject')
    except jwt.PyJWTError:
        await websocket.close(code=4401)
        return

    factory = websocket.app.state.session_factory
    async with factory() as db:
        user = await db.execute(
            text("SELECT id FROM users WHERE id = :id AND status = 'ACTIVE'"), {'id': user_id}
        )
        if user.scalar_one_or_none() is None:
            await websocket.close(code=4401)
            return
        try:
            await _access(db, workspaceId, user_id)
        except ApiError:
            await websocket.close(code=4403)
            return

    await notification_hub.connect(workspaceId, user_id, websocket)
    try:
        while True:
            # Browsers can send a small heartbeat if an intermediary has a
            # short idle timeout. Receiving text also detects a closed peer.
            message = await websocket.receive_text()
            if message == 'ping':
                await websocket.send_text('pong')
    except WebSocketDisconnect:
        pass
    finally:
        notification_hub.disconnect(workspaceId, user_id, websocket)


@router.get('')
async def list_notifications(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _access(db, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''SELECT id, workspace_id, user_id, type, entity_type, entity_id, data, read_at, created_at
               FROM notifications
               WHERE workspace_id = :workspace_id AND user_id = :user_id
               ORDER BY created_at DESC'''
        ),
        {'workspace_id': workspaceId, 'user_id': user['id']},
    )
    return {'data': [
        {
            'id': row['id'], 'workspaceId': row['workspace_id'], 'userId': row['user_id'],
            'type': row['type'], 'entityType': row['entity_type'], 'entityId': row['entity_id'],
            'data': row['data'] or {}, 'readAt': row['read_at'], 'createdAt': row['created_at'],
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
        text(
            """SELECT team_issue_added, issue_completed, issue_added_to_triage
               FROM notification_preferences
               WHERE workspace_id = :workspace_id AND user_id = :user_id"""
        ),
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
    now = _utcnow()
    await db.execute(
        text(
            """INSERT INTO notification_preferences
               (workspace_id, user_id, team_issue_added, issue_completed, issue_added_to_triage, created_at, updated_at)
               VALUES (:workspace_id, :user_id, :team_issue_added, :issue_completed, :issue_added_to_triage, :now, :now)
               ON CONFLICT (workspace_id, user_id) DO UPDATE
               SET team_issue_added = EXCLUDED.team_issue_added,
                   issue_completed = EXCLUDED.issue_completed,
                   issue_added_to_triage = EXCLUDED.issue_added_to_triage,
                   updated_at = EXCLUDED.updated_at"""
        ),
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
        text(
            """INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :workspace_id, :actor_id, 'notification.preferences.updated', 'user', :actor_id, CAST(:metadata AS jsonb), :now)"""
        ),
        {
            'id': _cuid(),
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
        text(
            '''SELECT 1 FROM notifications
               WHERE id = :id AND workspace_id = :workspace_id AND user_id = :user_id'''
        ),
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
        text(
            '''UPDATE notifications SET read_at = :now
               WHERE workspace_id = :workspace_id AND user_id = :user_id AND read_at IS NULL'''
        ),
        {'now': _utcnow(), 'workspace_id': workspaceId, 'user_id': user['id']},
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
        text('UPDATE notifications SET read_at = :now WHERE id = :id'),
        {'id': notification_id, 'now': _utcnow()},
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
        text('DELETE FROM notifications WHERE workspace_id = :workspace_id AND user_id = :user_id'),
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
        text(
            '''DELETE FROM notifications
               WHERE workspace_id = :workspace_id AND user_id = :user_id AND read_at IS NOT NULL'''
        ),
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
        text(
            '''DELETE FROM notifications notification
               USING issues issue, issue_statuses status
               WHERE notification.workspace_id = :workspace_id
                 AND notification.user_id = :user_id
                 AND notification.entity_type = 'issue'
                 AND notification.entity_id = issue.id
                 AND issue.status_id = status.id
                 AND status.category IN ('COMPLETED', 'CANCELED')'''
        ),
        {'workspace_id': workspaceId, 'user_id': user['id']},
    )
    await db.commit()
    return {'ok': True}
