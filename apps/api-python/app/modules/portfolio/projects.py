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
            "manualOrder": str(row["manual_order"]),
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
    db, workspace, user, secret, *, team=None, limit=100, cursor=None, ordering=None
):
    predicate = project_read_scope() + (" AND p.team_id=:team" if team else "")
    params = {"workspace": workspace, "user": user, "team": team, "limit": limit + 1}
    manual = ordering == "manual"
    binding = {
        "workspace": workspace,
        "team": team,
        **({"ordering": "manual"} if manual else {}),
    }
    codec = CursorCodec(secret, user, "portfolio.projects", binding)
    total = (
        await db.execute(
            text("SELECT COUNT(*) FROM projects p WHERE " + predicate), params
        )
    ).scalar_one()
    if cursor:
        if manual:
            from ..work_items.manual_order import decode_rank_cursor
            from ...core.errors import ApiError

            params["after"], params["rank"] = decode_rank_cursor(codec, cursor)
            exists = (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM projects p WHERE "
                        + predicate
                        + " AND p.id=:after AND p.manual_order=:rank"
                    ),
                    params,
                )
            ).scalar_one()
            if not exists:
                raise ApiError(
                    409,
                    "The order changed. Reload the list before loading more.",
                    "Conflict",
                )
            predicate += " AND (p.manual_order,p.id)>(:rank,:after)"
        else:
            params["time"], params["after"] = codec.decode(cursor)
            predicate += " AND (p.created_at,p.id)<(:time,:after)"
    rows = (
        (
            await db.execute(
                text(
                    "SELECT p.id,p.created_at,p.manual_order FROM projects p WHERE "
                    + predicate
                    + (
                        " ORDER BY p.manual_order,p.id LIMIT :limit"
                        if manual
                        else " ORDER BY p.created_at DESC,p.id DESC LIMIT :limit"
                    )
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
    from ..work_items.manual_order import encode_rank_cursor

    return {
        "data": [summaries[row["id"]] for row in page if row["id"] in summaries],
        "meta": {
            "total": total,
            "limit": limit,
            "nextCursor": (
                encode_rank_cursor(codec, page[-1])
                if manual
                else codec.encode(page[-1]["created_at"], page[-1]["id"])
            )
            if len(rows) > limit
            else None,
        },
    }
