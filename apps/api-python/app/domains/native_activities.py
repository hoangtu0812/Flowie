from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import current_user
from .native_issues import _issue_row
from .native_projects import _project, _workspace_access


router = APIRouter(prefix='/api/v1/_native/activities', tags=['native-activities'])


@router.get('')
async def list_activities(
    workspaceId: str = Query(min_length=1),
    issueId: str | None = None,
    projectId: str | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    if not issueId and not projectId:
        raise ApiError(404, 'An issue or project is required.', 'Not Found')
    await _workspace_access(db, workspaceId, user['id'])
    if issueId:
        await _issue_row(db, issueId, workspaceId, user['id'])
        clause, params = 'activity.issue_id = :entity_id', {'entity_id': issueId}
    else:
        await _project(db, projectId or '', workspaceId, user['id'])
        clause, params = 'activity.project_id = :entity_id', {'entity_id': projectId}
    result = await db.execute(
        text(
            f'''SELECT activity.id, activity.type, activity.data, activity.created_at,
                       actor.id AS actor_id, actor.name AS actor_name, actor.avatar_url AS actor_avatar_url
                FROM activities activity LEFT JOIN users actor ON actor.id = activity.actor_id
                WHERE activity.workspace_id = :workspace_id AND {clause}
                ORDER BY activity.created_at ASC'''
        ),
        {'workspace_id': workspaceId, **params},
    )
    return {'data': [
        {'id': row['id'], 'type': row['type'], 'data': row['data'], 'createdAt': row['created_at'],
         'actor': {'id': row['actor_id'], 'name': row['actor_name'], 'avatarUrl': row['actor_avatar_url']} if row['actor_id'] else None}
        for row in result.mappings().all()
    ]}
