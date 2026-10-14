from __future__ import annotations
from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError
from .contracts import CommentInput
from .issue_queries import _issue_row


def _text_from_body(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(
            item
            for item in [
                str(value.get("text", "")).strip(),
                *(_text_from_body(child) for child in value.get("content", [])),
            ]
            if item
        ).strip()
    if isinstance(value, list):
        return " ".join(_text_from_body(item) for item in value).strip()
    return ""


def _comment_input(payload: CommentInput) -> tuple[str, dict[str, Any]]:
    content = payload.content.strip() if payload.content else ""
    if payload.body is not None:
        content = content or _text_from_body(payload.body)
        body = payload.body
    else:
        body = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": content}]}
            ],
        }
    if not content:
        raise ApiError(400, "Comment content is required.", "Bad Request")
    return content, body


async def _comment(
    db: AsyncSession, comment_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    result = await db.execute(
        text(
            """SELECT c.*, u.id AS author_id_value, u.name AS author_name, u.avatar_url AS author_avatar_url
               FROM comments c
               JOIN issues i ON i.id = c.issue_id
               JOIN users u ON u.id = c.author_id
               WHERE c.id = :comment_id AND i.workspace_id = :workspace_id
                 AND i.archived_at IS NULL AND c.deleted_at IS NULL LIMIT 1"""
        ),
        {"comment_id": comment_id, "workspace_id": workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, "Comment not found.", "Not Found")
    await _issue_row(db, row["issue_id"], workspace_id, user_id)
    reactions = await _reaction_summary(db, comment_id, user_id)
    attachments = await db.execute(
        text(
            """SELECT id, filename, mime_type, size, created_at, entity_id FROM attachments
               WHERE workspace_id = :workspace_id AND entity_type = 'comment' AND entity_id = :comment_id
               ORDER BY created_at"""
        ),
        {"workspace_id": workspace_id, "comment_id": comment_id},
    )
    body = (
        row["body"] if isinstance(row["body"], dict) else {"type": "doc", "content": []}
    )
    return {
        "id": row["id"],
        "issueId": row["issue_id"],
        "authorId": row["author_id"],
        "content": row["content"],
        "body": body,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "version": row.get("version", 1),
        "deletedAt": row["deleted_at"],
        "author": {
            "id": row["author_id_value"],
            "name": row["author_name"],
            "avatarUrl": row["author_avatar_url"],
        },
        "reactions": reactions,
        "attachments": [
            {
                "id": item["id"],
                "filename": item["filename"],
                "mimeType": item["mime_type"],
                "size": item["size"],
                "createdAt": item["created_at"],
                "entityId": item["entity_id"],
            }
            for item in attachments.mappings().all()
        ],
    }


async def _reaction_summary(
    db: AsyncSession, comment_id: str, user_id: str
) -> list[dict[str, Any]]:
    result = await db.execute(
        text(
            """SELECT emoji, COUNT(*)::int AS count, BOOL_OR(user_id = :user_id) AS reacted
               FROM comment_reactions WHERE comment_id = :comment_id GROUP BY emoji ORDER BY MIN(created_at)"""
        ),
        {"comment_id": comment_id, "user_id": user_id},
    )
    return [
        {"emoji": row["emoji"], "count": row["count"], "reacted": row["reacted"]}
        for row in result.mappings().all()
    ]
