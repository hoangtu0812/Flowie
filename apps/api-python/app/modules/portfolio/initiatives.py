from collections import defaultdict

from ...core.pagination import CursorCodec
from ..access.project_scope import project_read_scope
from .projects import project_summaries
from .queries import (
    INITIATIVE_PAGE_SELECT_INITIATIVE_LABEL_LINKS,
    initiative_page_select_initiative_projects_sql,
    initiative_page_select_initiatives_sql,
    initiative_page_select_initiatives_sql_2,
)


async def initiative_page(db, workspace, user, secret, *, limit=100, cursor=None):
    params = {"workspace": workspace, "user": user, "limit": limit + 1}
    predicate = "n.workspace_id=:workspace AND n.archived_at IS NULL"
    codec = CursorCodec(secret, user, "portfolio.initiatives", {"workspace": workspace})
    total = (
        await db.execute(
            initiative_page_select_initiatives_sql(predicate), params
        )
    ).scalar_one()
    if cursor:
        params["time"], params["after"] = codec.decode(cursor)
        predicate += " AND (n.created_at,n.id)<(:time,:after)"
    rows = (
        (
            await db.execute(
                initiative_page_select_initiatives_sql_2(predicate),
                params,
            )
        )
        .mappings()
        .all()
    )
    page = rows[:limit]
    ids = [row["id"] for row in page]
    if not ids:
        return {
            "data": [],
            "meta": {"total": total, "limit": limit, "nextCursor": None},
        }
    params["ids"] = ids
    links = (
        (
            await db.execute(
                initiative_page_select_initiative_projects_sql(project_read_scope),
                params,
            )
        )
        .mappings()
        .all()
    )
    projects = await project_summaries(
        db, workspace, user, {row["project_id"] for row in links}
    )
    linked = defaultdict(list)
    for row in links:
        if row["project_id"] in projects:
            linked[row["initiative_id"]].append(
                {
                    "projectId": row["project_id"],
                    "initiativeId": row["initiative_id"],
                    "createdAt": row["created_at"],
                    "project": projects[row["project_id"]],
                }
            )
    labels = defaultdict(list)
    for row in (
        await db.execute(
            INITIATIVE_PAGE_SELECT_INITIATIVE_LABEL_LINKS,
            params,
        )
    ).mappings():
        labels[row["initiative_id"]].append(
            {"label": {"id": row["id"], "name": row["name"], "color": row["color"]}}
        )
    data = []
    fields = {
        "id": "id",
        "workspaceId": "workspace_id",
        "name": "name",
        "description": "description",
        "status": "status",
        "priority": "priority",
        "health": "health",
        "icon": "icon",
        "ownerId": "owner_id",
        "targetDate": "target_date",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
        "archivedAt": "archived_at",
    }
    for row in page:
        data.append(
            {
                **{key: row[column] for key, column in fields.items()},
                "owner": {
                    "id": row["owner_id"],
                    "name": row["owner_name"],
                    "avatarUrl": row["owner_avatar"],
                }
                if row["owner_id"]
                else None,
                "projectLinks": linked[row["id"]],
                "labelLinks": labels[row["id"]],
                "_count": {"projectLinks": len(linked[row["id"]])},
                "isSummary": True,
                "updates": [],
                "resources": [],
            }
        )
    return {
        "data": data,
        "meta": {
            "total": total,
            "limit": limit,
            "nextCursor": codec.encode(page[-1]["created_at"], page[-1]["id"])
            if len(rows) > limit
            else None,
        },
    }
