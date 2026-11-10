import json
from datetime import UTC

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..access.projects import team_access, workspace_access
from ..work_items.lifecycle import actor_context
from .commands import (
    ARCHIVE_PROJECT_INSERT_AUDIT_LOGS,
    ARCHIVE_PROJECT_UPDATE_ISSUES,
    ARCHIVE_PROJECT_UPDATE_PROJECTS,
    RESTORE_INSERT_AUDIT_LOGS,
    restore_update_sql,
)
from .queries import (
    ARCHIVE_PROJECT_SELECT_ISSUES,
    ARCHIVE_PROJECT_SELECT_PROJECTS,
    RESTORE_PREVIEW_SELECT_ACTIVITIES,
    restore_preview_select_issues_sql,
    restore_preview_select_sql,
    restore_preview_select_teams_sql,
)
from .repository import TABLES, record
from .repository import scope as archive_scope


async def restore_preview(db, workspace, user, kind, identifier, *, lock=False):
    row = await record(db, workspace, user["id"], kind, identifier, lock=lock)
    blockers = []
    if kind != "initiative" and row["team_id"]:
        team = (
            (
                await db.execute(
                    restore_preview_select_teams_sql(lock),
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
                        restore_preview_select_sql(table, lock),
                        {"id": row[field], "workspace": workspace},
                    )
                ).first()
            ):
                blockers.append(f"Restore the {label} first.")
        merged = (
            await db.execute(
                RESTORE_PREVIEW_SELECT_ACTIVITIES,
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
                restore_preview_select_issues_sql(archive_scope),
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
        expected.astimezone(UTC).replace(tzinfo=None)
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
    now = utcnow()
    await actor_context(db, user["id"])
    actor_update = ",updated_by=:actor" if kind == "document" else ""
    await db.execute(
        restore_update_sql(table, actor_update),
        {"now": now, "id": identifier, "workspace": workspace, "actor": user["id"]},
    )
    if kind == "issue":
        from ..sla.synchronization import sync_issue
        await sync_issue(db, identifier)
    await db.execute(
        RESTORE_INSERT_AUDIT_LOGS,
        {
            "id": cuid(),
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
    await workspace_access(db, workspace, user["id"])
    project = (
        (
            await db.execute(
                ARCHIVE_PROJECT_SELECT_PROJECTS,
                {"id": identifier, "workspace": workspace},
            )
        )
        .mappings()
        .first()
    )
    if not project:
        raise ApiError(404, "Project unavailable.", "Not Found")
    if project["team_id"]:
        await team_access(db, workspace, project["team_id"], user["id"])
    unavailable = (
        await db.execute(
            ARCHIVE_PROJECT_SELECT_ISSUES,
            {"id": identifier, "workspace": workspace, "user": user["id"]},
        )
    ).first()
    if unavailable:
        raise ApiError(
            403,
            "This account cannot archive the project and its related records.",
            "Forbidden",
        )
    now = utcnow()
    await actor_context(db, user["id"])
    await db.execute(
        ARCHIVE_PROJECT_UPDATE_ISSUES,
        {"id": identifier, "workspace": workspace, "now": now},
    )
    await db.execute(
        ARCHIVE_PROJECT_UPDATE_PROJECTS,
        {"id": identifier, "workspace": workspace, "now": now},
    )
    await db.execute(
        ARCHIVE_PROJECT_INSERT_AUDIT_LOGS,
        {
            "audit": cuid(),
            "workspace": workspace,
            "user": user["id"],
            "id": identifier,
            "now": now,
        },
    )
    return {"id": identifier, "archivedAt": now}
