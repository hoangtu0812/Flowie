from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ..access.projects import workspace_access
from .bug_contracts import BUG_COLUMNS
from .queries import (
    ISSUE_ROWS_SELECT_ISSUE_CYCLES,
    ISSUE_ROWS_SELECT_ISSUE_LABELS,
    ISSUE_ROWS_SELECT_ISSUE_RELEASES,
    ISSUE_ROWS_SELECT_ISSUE_SUBSCRIPTIONS,
    PERSON_NAME_SELECT_USERS,
    PROJECT_NAME_SELECT_PROJECTS,
    STATUS_NAME_SELECT_ISSUE_STATUSES,
    TEMPLATE_ROW_SELECT_ISSUE_TEMPLATES,
)


async def _issue_rows(
    db: AsyncSession, issue_ids: list[str], workspace_id: str, user_id: str
) -> list[dict[str, Any]]:
    if not issue_ids:
        return []
    result = await db.execute(
        ISSUE_ROWS_SELECT_ISSUE_SUBSCRIPTIONS,
        {"issue_ids": issue_ids, "workspace_id": workspace_id, "user_id": user_id},
    )
    mapped = {row["id"]: row for row in result.mappings().all()}
    rows = [mapped[identifier] for identifier in issue_ids if identifier in mapped]
    ids = [row["id"] for row in rows]
    labels = (
        (
            await db.execute(
                ISSUE_ROWS_SELECT_ISSUE_LABELS,
                {"ids": ids},
            )
        )
        .mappings()
        .all()
    )
    cycles = (
        (
            await db.execute(
                ISSUE_ROWS_SELECT_ISSUE_CYCLES,
                {"ids": ids},
            )
        )
        .mappings()
        .all()
    )
    releases = (
        (
            await db.execute(
                ISSUE_ROWS_SELECT_ISSUE_RELEASES,
                {"ids": ids},
            )
        )
        .mappings()
        .all()
    )

    def group(items):
        result = defaultdict(list)
        for item in items:
            result[item["issue_id"]].append(item)
        return result

    label_map, cycle_map, release_map = group(labels), group(cycles), group(releases)
    return [
        _present_issue(
            row,
            label_map[row["id"]],
            cycle_map[row["id"]],
            release_map[row["id"]],
            user_id,
        )
        for row in rows
    ]


async def issue_row(
    db: AsyncSession, issue_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    await workspace_access(db, workspace_id, user_id)
    rows = await _issue_rows(db, [issue_id], workspace_id, user_id)
    if not rows:
        raise ApiError(404, "Issue not found or inaccessible.", "Not Found")
    return rows[0]


def _present_issue(row, labels, cycles, releases, user_id):
    return {
        "id": row["id"],
        "workspaceId": row["workspace_id"],
        "teamId": row["team_id"],
        "statusId": row["status_id"],
        "projectId": row["project_id"],
        "parentIssueId": row["parent_issue_id"],
        # Identifier and title let the issue page link to its parent without another request.
        # VI: Mã và tiêu đề giúp trang issue liên kết tới cha mà không cần thêm request.
        "parent": {
            "id": row["parent_issue_id"],
            "identifier": row["parent_identifier"],
            "title": row["parent_title"],
        } if row["parent_identifier"] else None,
        # Direct active children and how many of them are completed, for list progress chips.
        # VI: Số con trực tiếp chưa archive và số đã hoàn thành, cho chip tiến độ trên danh sách.
        "subIssueCount": row["sub_issue_count"],
        "completedSubIssueCount": row["completed_sub_issue_count"],
        "duplicateOfId": row["duplicate_of_id"],
        "identifier": row["identifier"],
        "number": row["number"],
        "title": row["title"],
        "description": row["description"],
        "priority": row["priority"],
        **{field: row[column] for field, column in BUG_COLUMNS.items()},
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
        "manualOrder": str(row['manual_order']),
        "updatedAt": row["updated_at"],
        "version": row.get("version", 1),
        "subIssueSort": row.get("sub_issue_sort", "manual"),
        "team": {
            "id": row["team_id_value"],
            "name": row["team_name"],
            "identifier": row["team_identifier"],
        } if row["team_id_value"] else None,
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
        # Without an explicit reporter the creator is the reporter.
        # VI: Không đặt reporter thì người tạo là reporter.
        "reporter": {
            "id": row["reporter_id_value"],
            "name": row["reporter_name"],
            "avatarUrl": row["reporter_avatar_url"],
        },
        "assignee": {
            "id": row["assignee_id_value"],
            "name": row["assignee_name"],
            "avatarUrl": row["assignee_avatar_url"],
            "lastSeenAt": row.get("assignee_last_seen_at"),
            "isOnline": bool(
                row.get("assignee_last_seen_at")
                and row["assignee_last_seen_at"] >= utcnow() - timedelta(minutes=2)
            ),
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
            for label in labels
        ],
        "cycleLinks": [
            {"cycleId": link["cycle_id"], "createdAt": link["created_at"]}
            for link in cycles
        ],
        "releaseLinks": [
            {"releaseId": link["release_id"], "createdAt": link["created_at"]}
            for link in releases
        ],
        "subscribers": [{"userId": user_id}] if row["is_subscribed"] else [],
        "favorites": [{"userId": user_id}] if row["is_favorite"] else [],
        "reminderAt": row["reminder_at"],
    }


async def _relation_summary(
    db: AsyncSession, issue_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    issue = await issue_row(db, issue_id, workspace_id, user_id)
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
        TEMPLATE_ROW_SELECT_ISSUE_TEMPLATES,
        {"template_id": template_id, "workspace_id": workspace_id},
    )
    return result.mappings().first()


async def _status_name(db: AsyncSession, status_id: str | None) -> str | None:
    if not status_id:
        return None
    result = await db.execute(
        STATUS_NAME_SELECT_ISSUE_STATUSES, {"id": status_id}
    )
    return result.scalar_one_or_none()


async def _person_name(db: AsyncSession, user_id: str | None) -> str | None:
    if not user_id:
        return None
    result = await db.execute(
        PERSON_NAME_SELECT_USERS, {"id": user_id}
    )
    return result.scalar_one_or_none()


async def _project_name(db: AsyncSession, project_id: str | None) -> str | None:
    if not project_id:
        return None
    result = await db.execute(
        PROJECT_NAME_SELECT_PROJECTS, {"id": project_id}
    )
    return result.scalar_one_or_none()
