from __future__ import annotations

from ..modules.work_items.comment_repository import _text_from_body as _text_from_body, _comment_input as _comment_input, _comment as _comment, _reaction_summary as _reaction_summary

import json
from typing import Any, Annotated

from fastapi import Depends, Query, Request
from ..core.utc_responses import UtcAPIRouter as APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..modules.work_items.contracts import CommentInput, CreateCommentInput
from ..core.errors import ApiError
from ..db.session import get_session
from ..services.notification_events import (
    create_notification_batch,
    issue_recipient_ids,
    publish_notification_batches,
)
from .auth import _cuid, _utcnow, current_user
from .native_issues import _issue_row, _write_activity
from .native_projects import _workspace_access


router = APIRouter(prefix='/api/v1/_native/comments', tags=['native-comments'])
# Comments have no Circle adapter switched yet. Expose the audited native
# contract now so the later Issue-detail cutover does not depend on the
# legacy facade, while keeping the current presentation untouched.
public_router = APIRouter(prefix='/api/v1/comments', tags=['comments'])






class ToggleReactionInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    emoji: str = Field(min_length=1, max_length=32)


@public_router.get('/mentions')
async def mention_members(workspaceId: str = Query(min_length=1), issueId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    from ..modules.work_items.comment_mentions import mention_options
    issue = await _issue_row(db, issueId, workspaceId, user['id'])
    return {'data': await mention_options(db, issue)}


@public_router.get('/{comment_id}/revisions')
async def comment_revisions(comment_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    await _comment(db, comment_id, workspaceId, user['id'])
    rows = (await db.execute(text('''SELECT version,content,mention_ids AS "mentionIds",created_at AS "createdAt"
        FROM comment_revisions WHERE comment_id=:id ORDER BY version DESC LIMIT 100'''), {'id': comment_id})).mappings()
    return {'data': [dict(row) for row in rows]}










@router.get('')
@public_router.get('')
async def list_comments(
    workspaceId: str = Query(min_length=1), issueId: str = Query(min_length=1),
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session), *,
    request: Request = None,
    limit: Annotated[int, Query(ge=1,le=100)] = 50,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    threaded: bool = False,
    parentCommentId: Annotated[str | None, Query(min_length=1,max_length=100)] = None,
) -> dict:
    from ..modules.work_items.collaboration_feed import comment_page
    from ..core.config import Settings
    settings = request.app.state.settings if request else Settings.from_environment()
    return await comment_page(db, workspaceId, issueId, user['id'], settings.auth_jwt_secret,
        limit=limit,cursor=cursor,threaded=threaded,parent_id=parentCommentId)


@router.post('')
@public_router.post('')
async def create_comment(
    payload: CreateCommentInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    from ..modules.work_items.comments import create_comment as operation
    from ..db.mutations import commit_mutation

    return await commit_mutation(db, lambda: operation(payload=payload, user=user, db=db))


@router.patch('/{comment_id}')
@public_router.patch('/{comment_id}')
async def update_comment(
    comment_id: str,
    payload: CommentInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    from ..modules.work_items.comments import update_comment as operation
    from ..db.mutations import commit_mutation

    return await commit_mutation(db, lambda: operation(comment_id=comment_id, payload=payload, workspaceId=workspaceId, user=user, db=db))


@router.delete('/{comment_id}')
@public_router.delete('/{comment_id}')
async def remove_comment(
    comment_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    current = await _comment(db, comment_id, workspaceId, user['id'])
    if current['authorId'] != user['id']:
        raise ApiError(403, 'Only the comment author can delete it.', 'Forbidden')
    now = _utcnow()
    await db.execute(text('UPDATE comments SET deleted_at = :now, updated_at = :now WHERE id = :comment_id'), {'comment_id': comment_id, 'now': now})
    await db.commit()
    return {'data': {**current, 'deletedAt': now}}


@router.get('/{comment_id}/reactions')
@public_router.get('/{comment_id}/reactions')
async def comment_reactions(
    comment_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _comment(db, comment_id, workspaceId, user['id'])
    return {'data': await _reaction_summary(db, comment_id, user['id'])}


@router.post('/{comment_id}/reactions/toggle')
@public_router.post('/{comment_id}/reactions/toggle')
async def toggle_comment_reaction(
    comment_id: str,
    payload: ToggleReactionInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _comment(db, comment_id, payload.workspaceId, user['id'])
    emoji = payload.emoji.strip()
    result = await db.execute(
        text('DELETE FROM comment_reactions WHERE comment_id = :comment_id AND user_id = :user_id AND emoji = :emoji RETURNING emoji'),
        {'comment_id': comment_id, 'user_id': user['id'], 'emoji': emoji},
    )
    if result.scalar_one_or_none() is None:
        await db.execute(
            text('INSERT INTO comment_reactions (comment_id, user_id, emoji) VALUES (:comment_id, :user_id, :emoji)'),
            {'comment_id': comment_id, 'user_id': user['id'], 'emoji': emoji},
        )
    await db.commit()
    return {'data': await _reaction_summary(db, comment_id, user['id'])}
