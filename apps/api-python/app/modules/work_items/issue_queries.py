from __future__ import annotations
from typing import Any
from datetime import timedelta
from ...core.clock import _utcnow
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError
from ..access.projects import _team_access


async def _issue_row(
    db: AsyncSession, issue_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    result = await db.execute(
        text(
            """SELECT i.*, t.id AS team_id_value, t.name AS team_name,
                      t.identifier AS team_identifier, s.id AS status_id_value,
                      s.name AS status_name, s.category AS status_category, s.color AS status_color,
                      p.id AS project_id_value, p.name AS project_name, p.identifier AS project_identifier,
                      c.id AS creator_id_value, c.name AS creator_name, c.avatar_url AS creator_avatar_url,
                      a.id AS assignee_id_value, a.name AS assignee_name, a.avatar_url AS assignee_avatar_url, a.last_seen_at AS assignee_last_seen_at,
                      EXISTS(SELECT 1 FROM issue_subscriptions sub WHERE sub.issue_id = i.id AND sub.user_id = :user_id) AS is_subscribed,
                      EXISTS(SELECT 1 FROM issue_favorites favorite WHERE favorite.issue_id = i.id AND favorite.user_id = :user_id) AS is_favorite,
                      (SELECT remind_at FROM issue_reminders reminder
                       WHERE reminder.issue_id = i.id AND reminder.user_id = :user_id AND reminder.delivered_at IS NULL
                       ORDER BY reminder.updated_at DESC LIMIT 1) AS reminder_at
               FROM issues i
               JOIN teams t ON t.id = i.team_id
               JOIN issue_statuses s ON s.id = i.status_id
               LEFT JOIN projects p ON p.id = i.project_id
               JOIN users c ON c.id = i.creator_id
               LEFT JOIN users a ON a.id = i.assignee_id
               WHERE i.id = :issue_id AND i.workspace_id = :workspace_id AND i.archived_at IS NULL
               LIMIT 1"""
        ),
        {"issue_id": issue_id, "workspace_id": workspace_id, "user_id": user_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, "Issue not found.", "Not Found")
    await _team_access(db, workspace_id, row["team_id"], user_id)

    labels = await db.execute(
        text(
            """SELECT l.id, l.name, l.color FROM issue_labels il
               JOIN labels l ON l.id = il.label_id
               WHERE il.issue_id = :issue_id ORDER BY l.name"""
        ),
        {"issue_id": issue_id},
    )
    cycles = await db.execute(
        text(
            "SELECT cycle_id, created_at FROM issue_cycles WHERE issue_id = :issue_id ORDER BY created_at"
        ),
        {"issue_id": issue_id},
    )
    releases = await db.execute(
        text(
            "SELECT release_id, created_at FROM issue_releases WHERE issue_id = :issue_id ORDER BY created_at"
        ),
        {"issue_id": issue_id},
    )
    return {
        "id": row["id"],
        "workspaceId": row["workspace_id"],
        "teamId": row["team_id"],
        "statusId": row["status_id"],
        "projectId": row["project_id"],
        "parentIssueId": row["parent_issue_id"],
        "duplicateOfId": row["duplicate_of_id"],
        "identifier": row["identifier"],
        "number": row["number"],
        "title": row["title"],
        "description": row["description"],
        "priority": row["priority"],
        "resolution": row["resolution"],
        "estimatedEffort": row["estimated_effort"],
        "actualEffort": row["actual_effort"],
        "startDate": row["start_date"],
        "targetDate": row["target_date"],
        "dueDate": row["due_date"],
        "completedAt": row["completed_at"],
        "canceledAt": row["canceled_at"],
        "archivedAt": row["archived_at"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "version": row.get("version", 1),
        "team": {
            "id": row["team_id_value"],
            "name": row["team_name"],
            "identifier": row["team_identifier"],
        },
        "status": {
            "id": row["status_id_value"],
            "name": row["status_name"],
            "category": row["status_category"],
            "color": row["status_color"],
        },
        "project": {
            "id": row["project_id_value"],
            "name": row["project_name"],
            "identifier": row["project_identifier"],
        }
        if row["project_id_value"]
        else None,
        "creator": {
            "id": row["creator_id_value"],
            "name": row["creator_name"],
            "avatarUrl": row["creator_avatar_url"],
        },
        "assignee": {
            "id": row["assignee_id_value"],
            "name": row["assignee_name"],
            "avatarUrl": row["assignee_avatar_url"],
            "lastSeenAt": row.get("assignee_last_seen_at"),
            "isOnline": bool(row.get("assignee_last_seen_at") and row["assignee_last_seen_at"] >= _utcnow() - timedelta(minutes=2)),
        }
        if row["assignee_id_value"]
        else None,
        "labelLinks": [
            {
                "label": {
                    "id": label["id"],
                    "name": label["name"],
                    "color": label["color"],
                }
            }
            for label in labels.mappings().all()
        ],
        "cycleLinks": [
            {"cycleId": link["cycle_id"], "createdAt": link["created_at"]}
            for link in cycles.mappings().all()
        ],
        "releaseLinks": [
            {"releaseId": link["release_id"], "createdAt": link["created_at"]}
            for link in releases.mappings().all()
        ],
        "subscribers": [{"userId": user_id}] if row["is_subscribed"] else [],
        "favorites": [{"userId": user_id}] if row["is_favorite"] else [],
        "reminderAt": row["reminder_at"],
    }


async def _relation_summary(
    db: AsyncSession, issue_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    issue = await _issue_row(db, issue_id, workspace_id, user_id)
    return {
        "id": issue["id"],
        "identifier": issue["identifier"],
        "title": issue["title"],
        "status": issue["status"],
        "team": issue["team"],
    }


async def _template_row(
    db: AsyncSession, template_id: str, workspace_id: str
) -> Any | None:
    result = await db.execute(
        text(
            """SELECT template.*, creator.id AS creator_id, creator.name AS creator_name,
                      creator.avatar_url AS creator_avatar_url
               FROM issue_templates template
               JOIN users creator ON creator.id = template.created_by
               WHERE template.id = :template_id AND template.workspace_id = :workspace_id
               LIMIT 1"""
        ),
        {"template_id": template_id, "workspace_id": workspace_id},
    )
    return result.mappings().first()


async def _status_name(db: AsyncSession, status_id: str | None) -> str | None:
    if not status_id:
        return None
    result = await db.execute(
        text("SELECT name FROM issue_statuses WHERE id = :id"), {"id": status_id}
    )
    return result.scalar_one_or_none()


async def _person_name(db: AsyncSession, user_id: str | None) -> str | None:
    if not user_id:
        return None
    result = await db.execute(
        text("SELECT name FROM users WHERE id = :id"), {"id": user_id}
    )
    return result.scalar_one_or_none()


async def _project_name(db: AsyncSession, project_id: str | None) -> str | None:
    if not project_id:
        return None
    result = await db.execute(
        text("SELECT name FROM projects WHERE id = :id"), {"id": project_id}
    )
    return result.scalar_one_or_none()
