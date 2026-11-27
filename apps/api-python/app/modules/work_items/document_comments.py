"""Comments pinned to a block or a selected phrase of a Markdown document (DTD-1070).

Anyone who can read the document can comment, reply and resolve; only the author edits or
deletes a comment. Mentions must be people who can read the document and reach their Inbox.
VI: Comment gắn vào một đoạn hoặc cụm chữ bôi đen của tài liệu Markdown (DTD-1070). Ai đọc được
tài liệu thì comment, trả lời và resolve được; chỉ người viết mới sửa hoặc xoá comment của mình.
Người được mention phải đọc được tài liệu, và nhận thông báo trong Inbox.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...modules.notifications.outbox import stage_notifications
from ...services.notification_events import create_notification_batch
from .commands import (
    DOCUMENT_COMMENT_DELETE,
    DOCUMENT_COMMENT_INSERT,
    DOCUMENT_COMMENT_RESOLVE,
    DOCUMENT_COMMENT_UPDATE,
)
from .document_repository import _document_by_id, document_team_access
from .queries import (
    DOCUMENT_COMMENT_MENTION_OPTIONS,
    DOCUMENT_COMMENT_SELECT,
    DOCUMENT_COMMENTS_SELECT,
)


class DocumentCommentAnchor(BaseModel):
    # Text of the rendered block and its position among the blocks, used to find it again.
    # VI: Chữ của đoạn đã render và vị trí của nó trong các đoạn, dùng để tìm lại đoạn.
    blockText: str = Field(max_length=500)
    blockIndex: int = Field(ge=0, le=100_000)
    # The selected phrase; None when the whole block is commented.
    # VI: Cụm chữ được bôi đen; None khi comment cả đoạn.
    quote: str | None = Field(default=None, min_length=1, max_length=1000)


class _Content(BaseModel):
    @field_validator("content", check_fields=False)
    @classmethod
    def _not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Comment cannot be empty.")
        return value.strip() if value is not None else None


class CreateDocumentCommentInput(_Content):
    content: str = Field(min_length=1, max_length=10_000)
    mentionIds: list[str] = Field(default_factory=list, max_length=100)
    parentId: str | None = Field(default=None, min_length=1)
    anchor: DocumentCommentAnchor | None = None


class UpdateDocumentCommentInput(_Content):
    content: str | None = Field(default=None, min_length=1, max_length=10_000)
    mentionIds: list[str] | None = Field(default=None, max_length=100)
    resolved: bool | None = None


async def readable_document(db: AsyncSession, workspace_id: str, document_id: str, user_id: str) -> dict[str, Any]:
    document = await _document_by_id(db, document_id, workspace_id)
    if not document:
        raise ApiError(404, "Document not found.", "Not Found")
    await document_team_access(db, workspace_id, document["teamId"], user_id)
    return document


async def mention_options(db: AsyncSession, document: dict[str, Any]) -> list[dict[str, Any]]:
    rows = await db.execute(
        DOCUMENT_COMMENT_MENTION_OPTIONS, {"workspace": document["workspaceId"], "team": document["teamId"]}
    )
    return [dict(row) for row in rows.mappings()]


async def _mentions(db: AsyncSession, document: dict[str, Any], ids: list[str]) -> list[str]:
    unique = sorted(set(ids))
    if unique and set(unique) - {row["id"] for row in await mention_options(db, document)}:
        raise ApiError(400, "Mentions must be active members who can read this document.", "Bad Request")
    return unique


def _present(row: Any, user_id: str) -> dict[str, Any]:
    return {
        "id": row["id"],
        "parentId": row["parentId"],
        "anchor": row["anchor"],
        "content": row["content"],
        "mentionIds": row["mentionIds"] or [],
        "resolvedAt": row["resolvedAt"],
        "resolvedBy": {"id": row["resolver_id"], "name": row["resolver_name"]} if row["resolver_id"] else None,
        "createdAt": row["createdAt"],
        "updatedAt": row["updatedAt"],
        "author": {"id": row["author_id"], "name": row["author_name"], "avatarUrl": row["author_avatar_url"]},
        # The viewer wrote it, so may edit or delete it. VI: Người xem là tác giả nên được sửa, xoá.
        "mine": row["author_id"] == user_id,
    }


async def list_comments(db: AsyncSession, document_id: str, user_id: str) -> list[dict[str, Any]]:
    rows = await db.execute(DOCUMENT_COMMENTS_SELECT, {"document": document_id})
    return [_present(row, user_id) for row in rows.mappings()]


async def _comment(db: AsyncSession, document_id: str, comment_id: str) -> dict[str, Any]:
    row = (await db.execute(DOCUMENT_COMMENT_SELECT, {"id": comment_id, "document": document_id})).mappings().first()
    if not row:
        raise ApiError(404, "Comment not found.", "Not Found")
    return dict(row)


async def _notify(db: AsyncSession, document: dict[str, Any], recipients: set[str], user: Any, content: str) -> None:
    if not recipients:
        return
    batch = await create_notification_batch(
        db,
        workspace_id=document["workspaceId"],
        recipient_ids=recipients,
        actor=user,
        event_type="document.comment_mention",
        entity_type="document",
        entity_id=document["id"],
        title=document["title"],
        message="mentioned you in a document comment",
        entity_path=f"/documents/{document['id']}",
        body=content,
        discord=False,
    )
    await stage_notifications(db, batch, workspace_id=document["workspaceId"])


async def create_comment(
    db: AsyncSession, workspace_id: str, document_id: str, payload: CreateDocumentCommentInput, user: Any
) -> list[dict[str, Any]]:
    document = await readable_document(db, workspace_id, document_id, user["id"])
    if payload.parentId:
        parent = await _comment(db, document_id, payload.parentId)
        if parent["parent_id"]:
            raise ApiError(400, "Replies must reference a top-level comment on this document.", "Bad Request")
    elif payload.anchor is None:
        raise ApiError(400, "A new comment thread needs an anchor in the document.", "Bad Request")
    mentions = await _mentions(db, document, payload.mentionIds)
    now = utcnow()
    anchor = None if payload.parentId else payload.anchor
    await db.execute(
        DOCUMENT_COMMENT_INSERT,
        {
            "id": cuid(), "document": document_id, "author": user["id"], "parent": payload.parentId,
            "anchor": anchor.model_dump_json() if anchor else None, "content": payload.content,
            "mentions": json.dumps(mentions), "now": now,
        },
    )
    await _notify(db, document, set(mentions), user, payload.content)
    return await list_comments(db, document_id, user["id"])


async def update_comment(
    db: AsyncSession, workspace_id: str, document_id: str, comment_id: str, payload: UpdateDocumentCommentInput, user: Any
) -> list[dict[str, Any]]:
    document = await readable_document(db, workspace_id, document_id, user["id"])
    current = await _comment(db, document_id, comment_id)
    now = utcnow()
    if payload.content is not None or payload.mentionIds is not None:
        if current["author_id"] != user["id"]:
            raise ApiError(403, "Only the author can edit this comment.", "Forbidden")
        content = payload.content if payload.content is not None else current["content"]
        before = current["mention_ids"] or []
        mentions = await _mentions(db, document, payload.mentionIds if payload.mentionIds is not None else before)
        await db.execute(
            DOCUMENT_COMMENT_UPDATE,
            {"id": comment_id, "content": content, "mentions": json.dumps(mentions), "now": now},
        )
        # Only people this edit adds are told. VI: Chỉ báo cho người được thêm bởi lần sửa này.
        await _notify(db, document, set(mentions) - set(before), user, content)
    if payload.resolved is not None:
        if current["parent_id"]:
            raise ApiError(400, "Only a thread's first comment can be resolved.", "Bad Request")
        await db.execute(
            DOCUMENT_COMMENT_RESOLVE,
            {
                "id": comment_id, "now": now,
                "resolved_at": now if payload.resolved else None,
                "resolved_by": user["id"] if payload.resolved else None,
            },
        )
    return await list_comments(db, document_id, user["id"])


async def delete_comment(
    db: AsyncSession, workspace_id: str, document_id: str, comment_id: str, user: Any
) -> list[dict[str, Any]]:
    await readable_document(db, workspace_id, document_id, user["id"])
    current = await _comment(db, document_id, comment_id)
    if current["author_id"] != user["id"]:
        raise ApiError(403, "Only the author can delete this comment.", "Forbidden")
    # A deleted first comment hides its replies too. VI: Xoá comment đầu thì ẩn luôn các trả lời.
    await db.execute(DOCUMENT_COMMENT_DELETE, {"id": comment_id, "now": utcnow()})
    return await list_comments(db, document_id, user["id"])
