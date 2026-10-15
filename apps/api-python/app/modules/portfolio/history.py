from sqlalchemy import text

from ...core.errors import ApiError
from ...core.pagination import CursorCodec
from ..access.projects import _workspace_access
from ..access.project_scope import project_read_scope


async def history_page(
    db, workspace, user, secret, kind, identifier=None, *, limit=50, cursor=None
):
    await _workspace_access(db, workspace, user)
    params = {
        "workspace": workspace,
        "user": user,
        "entity": identifier,
        "limit": limit + 1,
    }
    if kind == "project_updates":
        if (
            identifier
            and not (
                await db.execute(
                    text(
                        f"SELECT 1 FROM projects p WHERE p.id=:entity AND {project_read_scope()}"
                    ),
                    params,
                )
            ).first()
        ):
            raise ApiError(404, "Project unavailable.", "Not Found")
        source = "project_updates h JOIN projects p ON p.id=h.project_id LEFT JOIN users u ON u.id=h.author_id"
        predicate = f"h.workspace_id=:workspace AND {project_read_scope()}"
        if identifier:
            predicate += " AND h.project_id=:entity"
    elif kind in {"initiative_updates", "initiative_activity"}:
        if not (
            await db.execute(
                text(
                    "SELECT 1 FROM initiatives WHERE id=:entity AND workspace_id=:workspace AND archived_at IS NULL"
                ),
                params,
            )
        ).first():
            raise ApiError(404, "Initiative unavailable.", "Not Found")
        if kind == "initiative_updates":
            source = "initiative_updates h LEFT JOIN users u ON u.id=h.author_id"
            predicate = "h.workspace_id=:workspace AND h.initiative_id=:entity"
        else:
            source = "audit_logs h LEFT JOIN users u ON u.id=h.actor_id"
            predicate = f"""h.workspace_id=:workspace AND h.entity_type='initiative' AND h.entity_id=:entity
                AND (NOT (h.metadata ? 'projectId') OR EXISTS(SELECT 1 FROM projects p WHERE p.id=h.metadata->>'projectId' AND {project_read_scope()}))"""
    else:
        raise ValueError("Unsupported portfolio history kind.")
    codec = CursorCodec(
        secret, user, kind, {"workspace": workspace, "entity": identifier}
    )
    total = (
        await db.execute(
            text(f"SELECT COUNT(*) FROM {source} WHERE {predicate}"), params
        )
    ).scalar_one()
    if cursor:
        params["time"], params["after"] = codec.decode(cursor)
        predicate += " AND (h.created_at,h.id)<(:time,:after)"
    extra = (
        ",p.name AS project_name,p.identifier AS project_identifier"
        if kind == "project_updates"
        else ""
    )
    rows = (
        (
            await db.execute(
                text(f"""SELECT h.*,u.id AS person_id,u.name AS person_name,u.avatar_url AS person_avatar {extra}
        FROM {source} WHERE {predicate} ORDER BY h.created_at DESC,h.id DESC LIMIT :limit"""),
                params,
            )
        )
        .mappings()
        .all()
    )
    page = rows[:limit]
    data = []
    for row in page:
        person = (
            {
                "id": row["person_id"],
                "name": row["person_name"],
                "avatarUrl": row["person_avatar"],
            }
            if row["person_id"]
            else None
        )
        if kind == "initiative_activity":
            data.append(
                {
                    "id": row["id"],
                    "action": row["action"],
                    "metadata": row["metadata"] or {},
                    "createdAt": row["created_at"],
                    "actor": person,
                }
            )
        else:
            value = {
                "id": row["id"],
                "workspaceId": row["workspace_id"],
                "authorId": row["author_id"],
                "body": row["body"],
                "health": row["health"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
                "author": person,
            }
            if kind == "project_updates":
                value.update(
                    {
                        "projectId": row["project_id"],
                        "kind": row["kind"],
                        "attachments": [],
                        "project": {
                            "id": row["project_id"],
                            "name": row["project_name"],
                            "identifier": row["project_identifier"],
                        },
                    }
                )
            else:
                value["initiativeId"] = row["initiative_id"]
            data.append(value)
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
