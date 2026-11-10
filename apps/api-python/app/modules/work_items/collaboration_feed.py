from __future__ import annotations

from typing import Any

from ...core.errors import ApiError
from ...core.pagination import CursorCodec
from .issue_queries import issue_row
from .queries import (
    ACTIVITY_PAGE_SELECT_PROJECTS,
    COMMENT_PAGE_SELECT_COMMENTS,
    COMMENT_PAGE_SELECT_COMMENTS_2,
    COMMENT_ROWS_SELECT_ATTACHMENTS,
    COMMENT_ROWS_SELECT_COMMENT_REACTIONS,
    COMMENT_ROWS_SELECT_COMMENTS,
    activity_page_select_activities_sql,
    comment_page_select_comments_sql,
)


async def comment_rows(
    db, ids: list[str], workspace_id: str, user_id: str
) -> list[dict]:
    if not ids:
        return []
    params = {"ids": ids, "workspace": workspace_id, "user": user_id}
    rows = (
        (
            await db.execute(
                COMMENT_ROWS_SELECT_COMMENTS,
                params,
            )
        )
        .mappings()
        .all()
    )
    reactions = (
        await db.execute(
            COMMENT_ROWS_SELECT_COMMENT_REACTIONS,
            params,
        )
    ).mappings()
    attachments = (
        await db.execute(
            COMMENT_ROWS_SELECT_ATTACHMENTS,
            params,
        )
    ).mappings()
    grouped_reactions: dict[str, list[dict[str, Any]]] = {}
    grouped_attachments: dict[str, list[dict[str, Any]]] = {}
    for row in reactions:
        grouped_reactions.setdefault(row["comment_id"], []).append(
            {key: row[key] for key in ["emoji", "count", "reacted"]}
        )
    for row in attachments:
        grouped_attachments.setdefault(row["entityId"], []).append(dict(row))
    # "agent" is the MCP connection a comment was written through, {} for agent comments recorded
    # before connection names were stored, and None for comments written by a person.
    # VI: "agent" là MCP connection đã dùng để viết comment, {} với comment của agent được ghi
    # VI: trước khi lưu tên connection, và None với comment do người viết.
    by_id = {}
    for row in rows:
        by_id[row["id"]] = {
            "id": row["id"],
            "issueId": row["issue_id"],
            "version": row["version"],
            "authorId": row["author_id"],
            "parentCommentId": row["parent_comment_id"],
            "mentionIds": row["mention_ids"],
            "content": row["content"],
            "body": row["body"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "deletedAt": row["deleted_at"],
            "replyCount": row["reply_count"],
            "agent": row["agent"],
            "author": {
                "id": row["author_id"],
                "name": row["author_name"],
                "avatarUrl": row["author_avatar_url"],
            },
            "reactions": grouped_reactions.get(row["id"], []),
            "attachments": grouped_attachments.get(row["id"], []),
        }
    return [by_id[item] for item in ids if item in by_id]


async def comment_page(
    db,
    workspace_id,
    issue_id,
    user_id,
    secret,
    *,
    limit=50,
    cursor=None,
    threaded=False,
    parent_id=None,
):
    await issue_row(db, issue_id, workspace_id, user_id)
    filters = {
        "workspace": workspace_id,
        "issue": issue_id,
        "threaded": threaded,
        "parent": parent_id,
    }
    codec = CursorCodec(secret, user_id, "comment-feed", filters)
    where = ["c.issue_id=:issue", "c.deleted_at IS NULL"]
    params = {"issue": issue_id, "limit": limit + 1}
    if parent_id:
        parent = (
            await db.execute(
                COMMENT_PAGE_SELECT_COMMENTS,
                {"id": parent_id, "issue": issue_id},
            )
        ).scalar_one_or_none()
        if not parent:
            raise ApiError(404, "Comment not found.", "Not Found")
        where.append("c.parent_comment_id=:parent")
        params["parent"] = parent_id
    elif threaded:
        where.append(
            "(c.parent_comment_id IS NULL OR NOT EXISTS(SELECT 1 FROM comments p WHERE p.id=c.parent_comment_id AND p.deleted_at IS NULL))"
        )
    if cursor:
        params["after_time"], params["after_id"] = codec.decode(cursor)
        where.append("(c.created_at,c.id)<(:after_time,:after_id)")
    rows = (
        (
            await db.execute(
                comment_page_select_comments_sql(where),
                params,
            )
        )
        .mappings()
        .all()
    )
    selected = rows[:limit]
    next_cursor = (
        codec.encode(selected[-1]["created_at"], selected[-1]["id"])
        if len(rows) > limit
        else None
    )
    ids = [row["id"] for row in selected]
    if threaded and not parent_id and ids:
        children = (
            (
                await db.execute(
                    COMMENT_PAGE_SELECT_COMMENTS_2,
                    {"parents": ids},
                )
            )
            .scalars()
            .all()
        )
        ids += list(children)
    return {
        "data": await comment_rows(db, ids, workspace_id, user_id),
        "meta": {"limit": limit, "nextCursor": next_cursor},
    }


async def activity_page(
    db,
    workspace_id,
    user_id,
    secret,
    *,
    issue_id=None,
    project_id=None,
    limit=50,
    cursor=None,
):
    from ..access.projects import team_access, workspace_access

    await workspace_access(db, workspace_id, user_id)
    if issue_id:
        await issue_row(db, issue_id, workspace_id, user_id)
        clause, entity = "a.issue_id=:entity", issue_id
    elif project_id:
        project = (
            (
                await db.execute(
                    ACTIVITY_PAGE_SELECT_PROJECTS,
                    {"id": project_id, "workspace": workspace_id},
                )
            )
            .mappings()
            .first()
        )
        if not project:
            raise ApiError(404, "Project not found.", "Not Found")
        if project["team_id"]:
            await team_access(db, workspace_id, project["team_id"], user_id)
        clause, entity = "a.project_id=:entity", project_id
    else:
        raise ApiError(404, "An issue or project is required.", "Not Found")
    codec = CursorCodec(
        secret,
        user_id,
        "activity-feed",
        {"workspace": workspace_id, "issue": issue_id, "project": project_id},
    )
    params = {"workspace": workspace_id, "entity": entity, "limit": limit + 1}
    after = ""
    if cursor:
        params["after_time"], params["after_id"] = codec.decode(cursor)
        after = "AND (a.created_at,a.id)<(:after_time,:after_id)"
    rows = (
        (
            await db.execute(
                activity_page_select_activities_sql(clause, after),
                params,
            )
        )
        .mappings()
        .all()
    )
    selected = rows[:limit]
    return {
        "data": [
            {
                "id": r["id"],
                "type": r["type"],
                "data": r["data"],
                "createdAt": r["created_at"],
                "actor": {
                    "id": r["actor_id"],
                    "name": r["actor_name"],
                    "avatarUrl": r["actor_avatar_url"],
                }
                if r["actor_id"]
                else None,
            }
            for r in selected
        ],
        "meta": {
            "limit": limit,
            "nextCursor": codec.encode(selected[-1]["created_at"], selected[-1]["id"])
            if len(rows) > limit
            else None,
        },
    }
