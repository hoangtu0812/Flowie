from __future__ import annotations

from ..modules.work_items.comment_repository import _text_from_body as _text_from_body, _comment_input as _comment_input, _comment as _comment, _reaction_summary as _reaction_summary

import json
from typing import Any

from fastapi import APIRouter, Depends, Query
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










@router.get('')
@public_router.get('')
async def list_comments(
    workspaceId: str = Query(min_length=1),
    issueId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    await _issue_row(db, issueId, workspaceId, user['id'])
    result = await db.execute(
        text('SELECT id FROM comments WHERE issue_id = :issue_id AND deleted_at IS NULL ORDER BY created_at'),
        {'issue_id': issueId},
    )
    return {'data': [await _comment(db, row['id'], workspaceId, user['id']) for row in result.mappings().all()]}


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
