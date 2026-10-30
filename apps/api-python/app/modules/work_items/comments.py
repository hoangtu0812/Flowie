from __future__ import annotations
import json
from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ...core.clock import _utcnow
from ...modules.notifications.outbox import stage_notifications
from .comment_mentions import validate_mentions
from .contracts import CommentInput, CreateCommentInput
from ..access.projects import _workspace_access
from .issue_queries import _issue_row
from .issue_activity import _write_activity
from .comment_repository import _comment_input, _comment
from ...services.notification_events import (
    create_notification_batch,
    issue_recipient_ids,
)


async def create_comment(
    payload: CreateCommentInput,
    user: Any,
    db: AsyncSession,
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user["id"])
    issue = await _issue_row(db, payload.issueId, payload.workspaceId, user["id"])
    content, body = _comment_input(payload)
    mention_ids = await validate_mentions(db, issue, payload.mentionIds or [])
    if payload.parentCommentId:
        parent = await _comment(db, payload.parentCommentId, payload.workspaceId, user['id'])
        if parent['issueId'] != payload.issueId or parent['parentCommentId']:
            raise ApiError(400, 'Replies must reference a top-level comment on this issue.', 'Bad Request')
    if payload.clientRequestKey:
        await db.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:key,0))'),
            {'key': user['id'] + ':' + payload.clientRequestKey})
        previous = (await db.execute(text('SELECT * FROM comments WHERE author_id=:author AND client_request_key=:key'),
            {'author': user['id'], 'key': payload.clientRequestKey})).mappings().first()
        if previous:
            if previous['issue_id'] != payload.issueId or previous['content'] != content or previous['body'] != body or previous['parent_comment_id'] != payload.parentCommentId or previous['mention_ids'] != mention_ids or previous['deleted_at']:
                raise ApiError(409, 'The comment request key was already used for different content.', 'Conflict')
            return {'data': await _comment(db, previous['id'], payload.workspaceId, user['id'])}
    comment_id, now = _cuid(), _utcnow()
    await db.execute(
        text(
            """INSERT INTO comments (id, issue_id, author_id, client_request_key, parent_comment_id, mention_ids, content, body, created_at, updated_at)
               VALUES (:id, :issue_id, :author_id, :request_key, :parent, CAST(:mentions AS jsonb), :content, CAST(:body AS jsonb), :now, :now)"""
        ),
        {
            "id": comment_id,
            "issue_id": payload.issueId,
            "author_id": user["id"],
            "request_key": payload.clientRequestKey,
            "parent": payload.parentCommentId, "mentions": json.dumps(mention_ids),
            "content": content,
            "body": json.dumps(body),
            "now": now,
        },
    )
    await _write_activity(
        db,
        payload.workspaceId,
        payload.issueId,
        user["id"],
        "comment.created",
        {"commentId": comment_id},
    )
    batch = await create_notification_batch(
        db,
        workspace_id=payload.workspaceId,
        recipient_ids=await issue_recipient_ids(
            db,
            payload.issueId,
            issue["assignee"]["id"] if issue.get("assignee") else None,
        ),
        actor=user,
        event_type="issue.comment_created",
        entity_type="issue",
        entity_id=payload.issueId,
        title=issue["title"],
        message="commented on an issue",
        entity_path=f"/issue/{issue['identifier']}",
        entity_label=issue["identifier"],
        body=content,
    )
    mention_batch = await create_notification_batch(db, workspace_id=payload.workspaceId,
        recipient_ids=set(mention_ids), actor=user, event_type='issue.comment_mention',
        entity_type='issue', entity_id=payload.issueId, title=issue['title'],
        message='mentioned you in a comment', entity_path=f"/issue/{issue['identifier']}",
        entity_label=issue['identifier'], body=content, discord=False, teams_mention=True)
    await stage_notifications(db, batch, mention_batch, workspace_id=payload.workspaceId)
    return {"data": await _comment(db, comment_id, payload.workspaceId, user["id"])}


async def update_comment(
    comment_id: str,
    payload: CommentInput,
    workspaceId: str,
    user: Any,
    db: AsyncSession,
) -> dict[str, dict[str, Any]]:
    await db.execute(text('SELECT id FROM comments WHERE id=:id FOR UPDATE'), {'id': comment_id})
    current = await _comment(db, comment_id, workspaceId, user["id"])
    if payload.expectedVersion is not None and current['version'] != payload.expectedVersion:
        raise ApiError(409, 'This comment changed. Reload before editing; your draft is retained.', 'Conflict')
    if current["authorId"] != user["id"]:
        raise ApiError(403, "Only the comment author can edit it.", "Forbidden")
    content, body = _comment_input(payload)
    issue = await _issue_row(db, current['issueId'], workspaceId, user['id'])
    mention_ids = await validate_mentions(db, issue, payload.mentionIds if payload.mentionIds is not None else current['mentionIds'])
    await db.execute(
        text(
            "UPDATE comments SET content = :content, body = CAST(:body AS jsonb), mention_ids = CAST(:mentions AS jsonb), updated_at = :now WHERE id = :comment_id"
        ),
        {
            "comment_id": comment_id,
            "mentions": json.dumps(mention_ids),
            "content": content,
            "body": json.dumps(body),
            "now": _utcnow(),
        },
    )
    # Only people added by this edit are told; an edit that keeps or removes mentions sends nothing,
    # so correcting a typo never repeats a notification.
    # VI: Chỉ người được thêm bởi lần sửa này mới được báo; sửa mà giữ nguyên hoặc bớt mention thì
    # VI: không gửi gì, nên sửa lỗi chính tả không bao giờ gửi lặp thông báo.
    added = set(mention_ids) - set(current['mentionIds'] or [])
    if added:
        await stage_notifications(db, await create_notification_batch(db, workspace_id=workspaceId,
            recipient_ids=added, actor=user, event_type='issue.comment_mention',
            entity_type='issue', entity_id=issue['id'], title=issue['title'],
            message='mentioned you in a comment', entity_path=f"/issue/{issue['identifier']}",
            entity_label=issue['identifier'], body=content, discord=False, teams_mention=True),
            workspace_id=workspaceId)
    return {"data": await _comment(db, comment_id, workspaceId, user["id"])}
