from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _utcnow, current_user
from .native_projects import _workspace_access


router = APIRouter(prefix='/api/v1/notifications', tags=['notifications'])


async def _access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    await _workspace_access(db, workspace_id, user_id)


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
