from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from .contracts import CommentInput
from .issue_queries import issue_row
from .queries import (
    COMMENT_SELECT_ACTIVITIES,
    COMMENT_SELECT_ATTACHMENTS,
    REACTION_SUMMARY_SELECT_COMMENT_REACTIONS,
)


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
        COMMENT_SELECT_ACTIVITIES,
        {"comment_id": comment_id, "workspace_id": workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, "Comment not found.", "Not Found")
    await issue_row(db, row["issue_id"], workspace_id, user_id)
    reactions = await _reaction_summary(db, comment_id, user_id)
    attachments = await db.execute(
        COMMENT_SELECT_ATTACHMENTS,
        {"workspace_id": workspace_id, "comment_id": comment_id},
    )
    body = (
        row["body"] if isinstance(row["body"], dict) else {"type": "doc", "content": []}
    )
    return {
        "id": row["id"],
        "issueId": row["issue_id"],
        "parentCommentId": row["parent_comment_id"],
        "mentionIds": row["mention_ids"],
        "authorId": row["author_id"],
        "content": row["content"],
        "body": body,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "version": row.get("version", 1),
        "deletedAt": row["deleted_at"],
        "agent": row["agent"],
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
        REACTION_SUMMARY_SELECT_COMMENT_REACTIONS,
        {"comment_id": comment_id, "user_id": user_id},
    )
    return [
        {"emoji": row["emoji"], "count": row["count"], "reacted": row["reacted"]}
        for row in result.mappings().all()
    ]
