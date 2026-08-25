from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .native_issues import _issue_row, _write_activity
from .native_projects import _workspace_access


router = APIRouter(prefix='/api/v1/_native/comments', tags=['native-comments'])


class CommentInput(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=20_000)
    body: dict[str, Any] | None = None


class CreateCommentInput(CommentInput):
    workspaceId: str = Field(min_length=1)
    issueId: str = Field(min_length=1)


class ToggleReactionInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    emoji: str = Field(min_length=1, max_length=32)


def _text_from_body(value: Any) -> str:
    if isinstance(value, dict):
        return ' '.join(
            item for item in [str(value.get('text', '')).strip(), *(_text_from_body(child) for child in value.get('content', []))] if item
        ).strip()
    if isinstance(value, list):
        return ' '.join(_text_from_body(item) for item in value).strip()
    return ''


def _comment_input(payload: CommentInput) -> tuple[str, dict[str, Any]]:
    content = payload.content.strip() if payload.content else ''
    if payload.body is not None:
        content = content or _text_from_body(payload.body)
        body = payload.body
    else:
        body = {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': content}]}]}
    if not content:
        raise ApiError(400, 'Comment content is required.', 'Bad Request')
    return content, body


async def _comment(
    db: AsyncSession, comment_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    result = await db.execute(
        text(
            '''SELECT c.*, u.id AS author_id_value, u.name AS author_name, u.avatar_url AS author_avatar_url
               FROM comments c
               JOIN issues i ON i.id = c.issue_id
               JOIN users u ON u.id = c.author_id
               WHERE c.id = :comment_id AND i.workspace_id = :workspace_id
                 AND i.archived_at IS NULL AND c.deleted_at IS NULL LIMIT 1'''
        ),
        {'comment_id': comment_id, 'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Comment not found.', 'Not Found')
    await _issue_row(db, row['issue_id'], workspace_id, user_id)
    reactions = await _reaction_summary(db, comment_id, user_id)
    attachments = await db.execute(
        text(
            '''SELECT id, filename, mime_type, size, created_at, entity_id FROM attachments
               WHERE workspace_id = :workspace_id AND entity_type = 'comment' AND entity_id = :comment_id
               ORDER BY created_at'''
        ),
        {'workspace_id': workspace_id, 'comment_id': comment_id},
    )
    body = row['body'] if isinstance(row['body'], dict) else {'type': 'doc', 'content': []}
    return {
        'id': row['id'], 'issueId': row['issue_id'], 'authorId': row['author_id'],
        'content': row['content'], 'body': body, 'createdAt': row['created_at'],
        'updatedAt': row['updated_at'], 'deletedAt': row['deleted_at'],
        'author': {'id': row['author_id_value'], 'name': row['author_name'], 'avatarUrl': row['author_avatar_url']},
        'reactions': reactions,
        'attachments': [{'id': item['id'], 'filename': item['filename'], 'mimeType': item['mime_type'], 'size': item['size'], 'createdAt': item['created_at'], 'entityId': item['entity_id']} for item in attachments.mappings().all()],
    }


async def _reaction_summary(db: AsyncSession, comment_id: str, user_id: str) -> list[dict[str, Any]]:
    result = await db.execute(
        text(
            '''SELECT emoji, COUNT(*)::int AS count, BOOL_OR(user_id = :user_id) AS reacted
               FROM comment_reactions WHERE comment_id = :comment_id GROUP BY emoji ORDER BY MIN(created_at)'''
        ),
        {'comment_id': comment_id, 'user_id': user_id},
    )
    return [{'emoji': row['emoji'], 'count': row['count'], 'reacted': row['reacted']} for row in result.mappings().all()]


@router.get('')
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
async def create_comment(
    payload: CreateCommentInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user['id'])
    await _issue_row(db, payload.issueId, payload.workspaceId, user['id'])
    content, body = _comment_input(payload)
    comment_id, now = _cuid(), _utcnow()
    await db.execute(
        text(
            '''INSERT INTO comments (id, issue_id, author_id, content, body, created_at, updated_at)
               VALUES (:id, :issue_id, :author_id, :content, CAST(:body AS jsonb), :now, :now)'''
        ),
        {'id': comment_id, 'issue_id': payload.issueId, 'author_id': user['id'], 'content': content, 'body': json.dumps(body), 'now': now},
    )
    await _write_activity(db, payload.workspaceId, payload.issueId, user['id'], 'comment.created', {'commentId': comment_id})
    await db.commit()
    return {'data': await _comment(db, comment_id, payload.workspaceId, user['id'])}


@router.patch('/{comment_id}')
async def update_comment(
    comment_id: str,
    payload: CommentInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    current = await _comment(db, comment_id, workspaceId, user['id'])
    if current['authorId'] != user['id']:
        raise ApiError(403, 'Only the comment author can edit it.', 'Forbidden')
    content, body = _comment_input(payload)
    await db.execute(
        text('UPDATE comments SET content = :content, body = CAST(:body AS jsonb), updated_at = :now WHERE id = :comment_id'),
        {'comment_id': comment_id, 'content': content, 'body': json.dumps(body), 'now': _utcnow()},
    )
    await db.commit()
    return {'data': await _comment(db, comment_id, workspaceId, user['id'])}


@router.delete('/{comment_id}')
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
async def comment_reactions(
    comment_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _comment(db, comment_id, workspaceId, user['id'])
    return {'data': await _reaction_summary(db, comment_id, user['id'])}


@router.post('/{comment_id}/reactions/toggle')
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
