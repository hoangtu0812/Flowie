from __future__ import annotations
import json
from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ...core.clock import _utcnow
from ...modules.notifications.outbox import stage_notifications
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
    comment_id, now = _cuid(), _utcnow()
    await db.execute(
        text(
            """INSERT INTO comments (id, issue_id, author_id, content, body, created_at, updated_at)
               VALUES (:id, :issue_id, :author_id, :content, CAST(:body AS jsonb), :now, :now)"""
        ),
        {
            "id": comment_id,
            "issue_id": payload.issueId,
            "author_id": user["id"],
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
    await stage_notifications(db, batch, workspace_id=payload.workspaceId)
    return {"data": await _comment(db, comment_id, payload.workspaceId, user["id"])}


async def update_comment(
    comment_id: str,
    payload: CommentInput,
    workspaceId: str,
    user: Any,
    db: AsyncSession,
) -> dict[str, dict[str, Any]]:
    current = await _comment(db, comment_id, workspaceId, user["id"])
    if current["authorId"] != user["id"]:
        raise ApiError(403, "Only the comment author can edit it.", "Forbidden")
    content, body = _comment_input(payload)
    await db.execute(
        text(
            "UPDATE comments SET content = :content, body = CAST(:body AS jsonb), updated_at = :now WHERE id = :comment_id"
        ),
        {
            "comment_id": comment_id,
            "content": content,
            "body": json.dumps(body),
            "now": _utcnow(),
        },
    )
    return {"data": await _comment(db, comment_id, workspaceId, user["id"])}
