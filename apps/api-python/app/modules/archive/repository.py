from sqlalchemy import text

from ...core.errors import ApiError
from ...core.pagination import CursorCodec
from ..access.projects import _workspace_access, _workspace_manager

TABLES = {
    "issue": ("issues", "title"),
    "project": ("projects", "name"),
    "document": ("documents", "title"),
    "initiative": ("initiatives", "name"),
}


def scope(kind):
    if kind not in TABLES:
        raise ValueError("Unsupported archived record kind.")
    predicate = "e.workspace_id=:workspace AND e.archived_at IS NOT NULL"
    if kind != "initiative":
        predicate += """ AND (e.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm
            JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=:user AND t.id=e.team_id AND t.workspace_id=:workspace))"""
    return predicate


async def access(db, workspace, user, kind):
    await _workspace_access(db, workspace, user)
    if kind == "initiative":
        await _workspace_manager(db, workspace, user)


async def record(db, workspace, user, kind, identifier, *, lock=False):
    await access(db, workspace, user, kind)
    table, _ = TABLES[kind]
    row = (
        (
            await db.execute(
                text(
                    f"SELECT e.* FROM {table} e WHERE {scope(kind)} AND e.id=:id"
                    + (" FOR UPDATE OF e" if lock else "")
                ),
                {"workspace": workspace, "user": user, "id": identifier},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(404, "Archived record unavailable.", "Not Found")
    return row


async def archive_page(db, workspace, user, kind, secret, *, limit=50, cursor=None):
    await access(db, workspace, user, kind)
    table, title = TABLES[kind]
    predicate = scope(kind)
    params = {"workspace": workspace, "user": user, "limit": limit + 1}
    codec = CursorCodec(
        secret, user, "archived-records", {"workspace": workspace, "kind": kind}
    )
    total = (
        await db.execute(
            text(f"SELECT COUNT(*) FROM {table} e WHERE {predicate}"), params
        )
    ).scalar_one()
    if cursor:
        params["time"], params["after"] = codec.decode(cursor)
        predicate += " AND (e.archived_at,e.id)<(:time,:after)"
    rows = (
        (
            await db.execute(
                text(
                    f"SELECT e.id,e.{title} AS title,e.archived_at,e.updated_at FROM {table} e WHERE {predicate} ORDER BY e.archived_at DESC,e.id DESC LIMIT :limit"
                ),
                params,
            )
        )
        .mappings()
        .all()
    )
    page = rows[:limit]
    return {
        "data": [
            {
                "id": row["id"],
                "title": row["title"],
                "kind": kind,
                "archivedAt": row["archived_at"],
                "updatedAt": row["updated_at"],
            }
            for row in page
        ],
        "meta": {
            "total": total,
            "limit": limit,
            "nextCursor": codec.encode(page[-1]["archived_at"], page[-1]["id"])
            if len(rows) > limit
            else None,
        },
    }
