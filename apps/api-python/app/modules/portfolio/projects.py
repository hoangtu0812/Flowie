from collections import defaultdict

from sqlalchemy import text

from ...core.pagination import CursorCodec
from ..access.project_scope import project_read_scope
from ..work_items.issue_search import issue_scope


async def project_summaries(db, workspace, user, identifiers):
    if not identifiers:
        return {}
    params = {"workspace": workspace, "user": user, "ids": list(identifiers)}
    rows = (
        (
            await db.execute(
                text(f"""SELECT p.*,t.name AS team_name,t.identifier AS team_identifier,t.icon AS team_icon,
        u.name AS lead_name,u.avatar_url AS lead_avatar,
        EXISTS(SELECT 1 FROM project_favorites f WHERE f.project_id=p.id AND f.user_id=:user) AS favorite
        FROM projects p LEFT JOIN teams t ON t.id=p.team_id LEFT JOIN users u ON u.id=p.lead_id
        WHERE {project_read_scope()} AND p.id=ANY(CAST(:ids AS text[]))"""),
                params,
            )
        )
        .mappings()
        .all()
    )
    labels = defaultdict(list)
    for row in (
        await db.execute(
            text("""SELECT pl.project_id,l.* FROM project_label_links pl
        JOIN project_labels l ON l.id=pl.label_id WHERE pl.project_id=ANY(CAST(:ids AS text[])) ORDER BY l.name,l.id"""),
            params,
        )
    ).mappings():
        labels[row["project_id"]].append(
            {
                "label": {
                    "id": row["id"],
                    "name": row["name"],
                    "color": row["color"],
                    "workspaceId": row["workspace_id"],
                }
            }
        )
    scope, query = issue_scope(workspace, user, {})
    counts = defaultdict(dict)
    for row in (
        await db.execute(
            text(
                "SELECT i.project_id,lower(s.category::text) AS category,COUNT(*) AS count "
                + scope
                + " AND i.project_id=ANY(CAST(:ids AS text[])) GROUP BY i.project_id,s.category"
            ),
            {**query, "ids": list(identifiers)},
        )
    ).mappings():
        counts[row["project_id"]][row["category"]] = row["count"]
    result = {}
    fields = {
        "id": "id",
        "workspaceId": "workspace_id",
        "teamId": "team_id",
        "name": "name",
        "icon": "icon",
        "identifier": "identifier",
        "slug": "slug",
        "description": "description",
        "type": "type",
        "status": "status",
        "priority": "priority",
        "health": "health",
        "leadId": "lead_id",
        "startDate": "start_date",
        "targetDate": "target_date",
        "archivedAt": "archived_at",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    }
    for row in rows:
        summary = {"total": sum(counts[row["id"]].values()), **counts[row["id"]]}
        result[row["id"]] = {
            **{key: row[column] for key, column in fields.items()},
            "team": {
                "id": row["team_id"],
                "name": row["team_name"],
                "identifier": row["team_identifier"],
                "icon": row["team_icon"],
            }
            if row["team_id"]
            else None,
            "lead": {
                "id": row["lead_id"],
                "name": row["lead_name"],
                "avatarUrl": row["lead_avatar"],
            }
            if row["lead_id"]
            else None,
            "labelLinks": labels[row["id"]],
            "issueSummary": summary,
            "_count": {"issues": summary["total"]},
            "favorites": [{"userId": user}] if row["favorite"] else [],
        }
    return result


async def project_page(
    db, workspace, user, secret, *, team=None, limit=100, cursor=None
):
    predicate = project_read_scope() + (" AND p.team_id=:team" if team else "")
    params = {"workspace": workspace, "user": user, "team": team, "limit": limit + 1}
    codec = CursorCodec(
        secret, user, "portfolio.projects", {"workspace": workspace, "team": team}
    )
    total = (
        await db.execute(
            text("SELECT COUNT(*) FROM projects p WHERE " + predicate), params
        )
    ).scalar_one()
    if cursor:
        params["time"], params["after"] = codec.decode(cursor)
        predicate += " AND (p.created_at,p.id)<(:time,:after)"
    rows = (
        (
            await db.execute(
                text(
                    "SELECT p.id,p.created_at FROM projects p WHERE "
                    + predicate
                    + " ORDER BY p.created_at DESC,p.id DESC LIMIT :limit"
                ),
                params,
            )
        )
        .mappings()
        .all()
    )
    page = rows[:limit]
    summaries = await project_summaries(
        db, workspace, user, [row["id"] for row in page]
    )
    return {
        "data": [summaries[row["id"]] for row in page if row["id"] in summaries],
        "meta": {
            "total": total,
            "limit": limit,
            "nextCursor": codec.encode(page[-1]["created_at"], page[-1]["id"])
            if len(rows) > limit
            else None,
        },
    }
