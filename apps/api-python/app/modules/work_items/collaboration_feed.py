from __future__ import annotations

from sqlalchemy import text

from ...core.errors import ApiError
from ...core.pagination import CursorCodec
from .issue_queries import _issue_row


async def comment_rows(
    db, ids: list[str], workspace_id: str, user_id: str
) -> list[dict]:
    if not ids:
        return []
    params = {"ids": ids, "workspace": workspace_id, "user": user_id}
    rows = (
        (
            await db.execute(
                text("""SELECT c.*,u.name AS author_name,u.avatar_url AS author_avatar_url,
        (SELECT count(*)::int FROM comments child WHERE child.parent_comment_id=c.id AND child.deleted_at IS NULL) AS reply_count
        FROM comments c JOIN users u ON u.id=c.author_id JOIN issues i ON i.id=c.issue_id
        WHERE c.id=ANY(CAST(:ids AS text[])) AND i.workspace_id=:workspace AND c.deleted_at IS NULL"""),
                params,
            )
        )
        .mappings()
        .all()
    )
    reactions = (
        await db.execute(
            text("""SELECT comment_id,emoji,count(*)::int AS count,bool_or(user_id=:user) AS reacted
        FROM comment_reactions WHERE comment_id=ANY(CAST(:ids AS text[])) GROUP BY comment_id,emoji ORDER BY MIN(created_at)"""),
            params,
        )
    ).mappings()
    attachments = (
        await db.execute(
            text("""SELECT id,filename,mime_type AS "mimeType",size,created_at AS "createdAt",entity_id AS "entityId"
        FROM attachments WHERE workspace_id=:workspace AND entity_type='comment' AND entity_id=ANY(CAST(:ids AS text[])) ORDER BY created_at,id"""),
            params,
        )
    ).mappings()
    grouped_reactions, grouped_attachments = {}, {}
    for row in reactions:
        grouped_reactions.setdefault(row["comment_id"], []).append(
            {key: row[key] for key in ["emoji", "count", "reacted"]}
        )
    for row in attachments:
        grouped_attachments.setdefault(row["entityId"], []).append(dict(row))
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
    await _issue_row(db, issue_id, workspace_id, user_id)
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
                text(
                    "SELECT 1 FROM comments WHERE id=:id AND issue_id=:issue AND deleted_at IS NULL"
                ),
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
                text(
                    f"SELECT c.id,c.created_at FROM comments c WHERE {' AND '.join(where)} ORDER BY c.created_at DESC,c.id DESC LIMIT :limit"
                ),
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
                    text("""SELECT id FROM (
            SELECT id,row_number() OVER (PARTITION BY parent_comment_id ORDER BY created_at DESC,id DESC) AS position
            FROM comments WHERE parent_comment_id=ANY(CAST(:parents AS text[])) AND deleted_at IS NULL
        ) bounded WHERE position<=5"""),
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
    from ..access.projects import _workspace_access, _team_access

    await _workspace_access(db, workspace_id, user_id)
    if issue_id:
        await _issue_row(db, issue_id, workspace_id, user_id)
        clause, entity = "a.issue_id=:entity", issue_id
    elif project_id:
        project = (
            (
                await db.execute(
                    text(
                        "SELECT team_id FROM projects WHERE id=:id AND workspace_id=:workspace AND archived_at IS NULL"
                    ),
                    {"id": project_id, "workspace": workspace_id},
                )
            )
            .mappings()
            .first()
        )
        if not project:
            raise ApiError(404, "Project not found.", "Not Found")
        if project["team_id"]:
            await _team_access(db, workspace_id, project["team_id"], user_id)
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
                text(f"""SELECT a.id,a.type,a.data,a.created_at,u.id AS actor_id,u.name AS actor_name,u.avatar_url AS actor_avatar_url
        FROM activities a LEFT JOIN users u ON u.id=a.actor_id WHERE a.workspace_id=:workspace AND {clause} {after}
        ORDER BY a.created_at DESC,a.id DESC LIMIT :limit"""),
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
