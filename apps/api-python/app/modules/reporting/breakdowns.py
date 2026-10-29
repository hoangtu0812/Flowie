from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.pagination import CursorCodec
from ..access.projects import _workspace_access
from ..access.project_scope import project_read_scope
from .history_sql import history_ctes, scoped_sql


async def change_page(
    db, workspace, user, query, secret, *, cursor=None, limit=50, now=None
):
    await _workspace_access(db, workspace, user["id"])
    scope, params = scoped_sql(workspace, user["id"], query.selection.options())
    params.update(query.parameters(now or _utcnow()))
    ctes = (
        history_ctes(scope)
        + """, changes AS (
        SELECT 'created:'||i.id AS id,i.id AS issue_id,i.identifier,i.title,i.created_at AS occurred_at,'CREATED' AS kind,i.creator_id AS actor_id FROM scoped i
            WHERE i.created_at>=:start AND i.created_at<:until AND i.created_at<=:now
        UNION ALL SELECT 'event:'||e.id,e.issue_id,i.identifier,i.title,e.occurred_at,CASE WHEN e.completes THEN 'COMPLETED' ELSE 'REOPENED' END,e.actor_id
            FROM events e JOIN scoped i ON i.id=e.issue_id WHERE e.readable AND e.occurred_at>=:start AND e.occurred_at<:until
            AND (e.completes OR (e.from_category='COMPLETED' AND e.to_category NOT IN ('COMPLETED','CANCELED') AND e.to_archived_at IS NULL))
    ) """
    )
    total = (
        await db.execute(text(ctes + "SELECT COUNT(*) FROM changes"), params)
    ).scalar_one()
    codec = CursorCodec(
        secret,
        user["id"],
        "workflow-changes",
        {"workspace": workspace, **query.model_dump(mode="json")},
    )
    predicate = ""
    if cursor:
        params["after"], params["after_id"] = codec.decode(cursor)
        predicate = " WHERE (c.occurred_at,c.id)<(:after,:after_id)"
    rows = (
        (
            await db.execute(
                text(
                    ctes
                    # The users join is on its primary key, so it keeps one row per change and the cursor order.
                    # VI: Join users theo khóa chính nên vẫn một dòng cho mỗi thay đổi và giữ thứ tự con trỏ.
                    + "SELECT c.*,u.name AS actor_name,u.avatar_url AS actor_avatar_url FROM changes c"
                    + " LEFT JOIN users u ON u.id=c.actor_id"
                    + predicate
                    + " ORDER BY c.occurred_at DESC,c.id DESC LIMIT :limit"
                ),
                {**params, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    return {
        "data": [
            {
                "id": row["id"],
                "issueId": row["issue_id"],
                "identifier": row["identifier"],
                "title": row["title"],
                "occurredAt": row["occurred_at"],
                "kind": row["kind"],
                # Creator for CREATED, status changer otherwise; null for system or deleted users.
                # VI: Người tạo với CREATED, người đổi trạng thái với loại khác; null nếu là hệ thống hoặc user đã xóa.
                "actor": {
                    "id": row["actor_id"],
                    "name": row["actor_name"],
                    "avatarUrl": row["actor_avatar_url"],
                }
                if row["actor_name"] is not None
                else None,
            }
            for row in rows[:limit]
        ],
        "meta": {
            "total": total,
            "limit": limit,
            "nextCursor": codec.encode(
                rows[limit - 1]["occurred_at"], rows[limit - 1]["id"]
            )
            if len(rows) > limit
            else None,
        },
    }


async def project_page(
    db, workspace, user, query, secret, *, cursor=None, limit=50, now=None
):
    await _workspace_access(db, workspace, user["id"])
    scope, params = scoped_sql(workspace, user["id"], query.selection.options())
    params.update(query.parameters(now or _utcnow()))
    ctes = (
        history_ctes(scope)
        + """, completion_counts AS (
        SELECT issue_id,COUNT(*) AS count FROM episodes WHERE completion_visible AND completed_at>=:start AND completed_at<:until GROUP BY issue_id
    ), grouped AS (
        SELECT COALESCE(p.id,'none') AS id,p.id AS project_id,p.name,COALESCE(p.created_at,TIMESTAMP '0001-01-01') AS created_at,
            COUNT(*) AS total,COUNT(*) FILTER(WHERE i.category NOT IN ('COMPLETED','CANCELED')) AS open,
            COUNT(*) FILTER(WHERE i.created_at>=:start AND i.created_at<:until AND i.created_at<=:now) AS created,
            COALESCE(SUM(cc.count),0) AS completions,COALESCE(SUM(i.estimated_effort),0) AS estimated_effort,COALESCE(SUM(i.actual_effort),0) AS actual_effort
        FROM scoped i LEFT JOIN projects p ON p.id=i.project_id AND """
        + project_read_scope()
        + """ LEFT JOIN completion_counts cc ON cc.issue_id=i.id
        GROUP BY p.id,p.name,p.created_at
    ) """
    )
    total = (
        await db.execute(text(ctes + "SELECT COUNT(*) FROM grouped"), params)
    ).scalar_one()
    codec = CursorCodec(
        secret,
        user["id"],
        "workflow-projects",
        {"workspace": workspace, **query.model_dump(mode="json")},
    )
    predicate = ""
    if cursor:
        params["after"], params["after_id"] = codec.decode(cursor)
        predicate = " WHERE (created_at,id)<(:after,:after_id)"
    rows = (
        (
            await db.execute(
                text(
                    ctes
                    + "SELECT * FROM grouped"
                    + predicate
                    + " ORDER BY created_at DESC,id DESC LIMIT :limit"
                ),
                {**params, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    return {
        "data": [
            {
                "id": row["id"],
                "projectId": row["project_id"],
                "name": row["name"],
                "total": row["total"],
                "open": row["open"],
                "created": row["created"],
                "completions": row["completions"],
                "estimatedEffort": row["estimated_effort"],
                "actualEffort": row["actual_effort"],
            }
            for row in rows[:limit]
        ],
        "meta": {
            "total": total,
            "limit": limit,
            "nextCursor": codec.encode(
                rows[limit - 1]["created_at"], rows[limit - 1]["id"]
            )
            if len(rows) > limit
            else None,
        },
    }
