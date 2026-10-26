import json
from datetime import timezone

from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from .repository import TABLES, record, scope as archive_scope
from ..access.projects import _workspace_access, _team_access
from ..work_items.lifecycle import actor_context


async def restore_preview(db, workspace, user, kind, identifier, *, lock=False):
    row = await record(db, workspace, user["id"], kind, identifier, lock=lock)
    blockers = []
    if kind != "initiative" and row["team_id"]:
        team = (
            (
                await db.execute(
                    text(
                        "SELECT archived_at,deleted_at FROM teams WHERE id=:id AND workspace_id=:workspace"
                        + (" FOR SHARE" if lock else "")
                    ),
                    {"id": row["team_id"], "workspace": workspace},
                )
            )
            .mappings()
            .first()
        )
        if not team or team["archived_at"] or team["deleted_at"]:
            blockers.append("Restore the team first.")
    if kind == "issue":
        for field, table, label in [
            ("project_id", "projects", "project"),
            ("parent_issue_id", "issues", "parent issue"),
        ]:
            if (
                row[field]
                and not (
                    await db.execute(
                        text(
                            f"SELECT 1 FROM {table} WHERE id=:id AND workspace_id=:workspace AND archived_at IS NULL"
                            + (" FOR SHARE" if lock else "")
                        ),
                        {"id": row[field], "workspace": workspace},
                    )
                ).first()
            ):
                blockers.append(f"Restore the {label} first.")
        merged = (
            await db.execute(
                text(
                    "SELECT 1 FROM activities WHERE issue_id=:id AND type IN ('issue.merged','issue.converted_to_comment') LIMIT 1"
                ),
                {"id": identifier},
            )
        ).first()
        if merged:
            blockers.append(
                "Converted or merged issues require a dedicated reversal operation."
            )
    related = 0
    if kind == "project":
        related = (
            await db.execute(
                text(
                    f"SELECT COUNT(*) FROM issues e WHERE {archive_scope('issue')} AND e.project_id=:id"
                ),
                {"workspace": workspace, "user": user["id"], "id": identifier},
            )
        ).scalar_one()
    return {
        "id": identifier,
        "kind": kind,
        "title": row[TABLES[kind][1]],
        "updatedAt": row["updated_at"],
        "archivedAt": row["archived_at"],
        "blockers": blockers,
        "canRestore": not blockers,
        "retention": "Retained; automatic permanent deletion is disabled.",
        "relatedArchivedIssues": related,
        "effect": f"Restore this project. {related} accessible archived tasks can then be restored individually."
        if kind == "project"
        else "Restore this issue with its existing relationships. Enabled automations may process it."
        if kind == "issue"
        else "Restore this record with its existing relationships.",
    }


async def restore(db, workspace, user, kind, identifier, expected):
    preview = await restore_preview(db, workspace, user, kind, identifier, lock=True)
    normalized = (
        expected.astimezone(timezone.utc).replace(tzinfo=None)
        if expected.tzinfo
        else expected
    )
    if preview["updatedAt"] != normalized:
        raise ApiError(
            409, "The archived record changed. Reload the preview.", "Conflict"
        )
    if preview["blockers"]:
        raise ApiError(409, " ".join(preview["blockers"]), "Conflict")
    table, _ = TABLES[kind]
    now = _utcnow()
    await actor_context(db, user["id"])
    actor_update = ",updated_by=:actor" if kind == "document" else ""
    await db.execute(
        text(
            f"UPDATE {table} SET archived_at=NULL,updated_at=:now {actor_update} WHERE id=:id AND workspace_id=:workspace"
        ),
        {"now": now, "id": identifier, "workspace": workspace, "actor": user["id"]},
    )
    if kind == "issue":
        from ..sla.synchronization import sync_issue
        await sync_issue(db, identifier)
    await db.execute(
        text("""INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:user,:action,:kind,:entity,CAST(:metadata AS jsonb),:now)"""),
        {
            "id": _cuid(),
            "workspace": workspace,
            "user": user["id"],
            "action": f"{kind}.restored",
            "kind": kind,
            "entity": identifier,
            "metadata": json.dumps(
                {
                    "source": "web",
                    "previousArchivedAt": preview["archivedAt"].isoformat(),
                }
            ),
            "now": now,
        },
    )
    return {"id": identifier, "kind": kind, "restoredAt": now}


async def archive_project(db, workspace, user, identifier):
    await _workspace_access(db, workspace, user["id"])
    project = (
        (
            await db.execute(
                text(
                    "SELECT * FROM projects WHERE id=:id AND workspace_id=:workspace AND archived_at IS NULL FOR UPDATE"
                ),
                {"id": identifier, "workspace": workspace},
            )
        )
        .mappings()
        .first()
    )
    if not project:
        raise ApiError(404, "Project unavailable.", "Not Found")
    if project["team_id"]:
        await _team_access(db, workspace, project["team_id"], user["id"])
    unavailable = (
        await db.execute(
            text("""SELECT 1 FROM issues i WHERE i.project_id=:id AND i.workspace_id=:workspace AND i.archived_at IS NULL
        AND i.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id
        WHERE tm.team_id=i.team_id AND tm.user_id=:user AND t.archived_at IS NULL) LIMIT 1"""),
            {"id": identifier, "workspace": workspace, "user": user["id"]},
        )
    ).first()
    if unavailable:
        raise ApiError(
            403,
            "This account cannot archive the project and its related records.",
            "Forbidden",
        )
    now = _utcnow()
    await actor_context(db, user["id"])
    await db.execute(
        text(
            "UPDATE issues SET archived_at=:now,updated_at=:now WHERE project_id=:id AND workspace_id=:workspace AND archived_at IS NULL"
        ),
        {"id": identifier, "workspace": workspace, "now": now},
    )
    await db.execute(
        text(
            "UPDATE projects SET archived_at=:now,updated_at=:now WHERE id=:id AND workspace_id=:workspace"
        ),
        {"id": identifier, "workspace": workspace, "now": now},
    )
    await db.execute(
        text("""INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:audit,:workspace,:user,'project.archived','project',:id,'{"source":"web"}'::jsonb,:now)"""),
        {
            "audit": _cuid(),
            "workspace": workspace,
            "user": user["id"],
            "id": identifier,
            "now": now,
        },
    )
    return {"id": identifier, "archivedAt": now}
