from __future__ import annotations
from typing import Any
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError
from ...core.clock import _utcnow
from ...core.identifiers import _cuid
from ...domains.workflow_catalog import DEFAULT_CIRCLE_ISSUE_STATUSES


def _validate_schedule_dates(
    start_date: datetime | None, target_date: datetime | None
) -> None:
    if start_date and target_date and target_date < start_date:
        raise ApiError(
            400, "Target end date cannot be earlier than the start date.", "Bad Request"
        )


async def _enforce_start_gate(
    db: AsyncSession,
    workspace_id: str,
    team_id: str | None,
    previous_status_id: str | None,
    category: str | None,
    target_date: datetime | None,
) -> None:
    """Require the reviewed status and a target end date before work starts.

    Applies only when the issue enters a STARTED status from outside STARTED
    (``previous_status_id`` is None on create), and only when the workspace or
    the issue's team marks at least one status ``required_before_start``. Moves
    between STARTED statuses (In Progress, Review, Blocked) stay free, and
    workspaces that never mark a status keep their existing behavior.
    VI: Bắt buộc qua status đã review và có ngày kết thúc dự kiến trước khi làm.
    VI: Chỉ áp dụng khi issue vào status STARTED từ ngoài nhóm STARTED
    VI: (``previous_status_id`` là None khi tạo mới), và chỉ khi workspace hoặc
    VI: team của issue có ít nhất một status bật ``required_before_start``.
    VI: Chuyển giữa các status STARTED (In Progress, Review, Blocked) vẫn tự do;
    VI: workspace không bật cờ nào thì giữ nguyên hành vi cũ.
    """
    if category != "STARTED":
        return
    rows = (await db.execute(text(
        '''SELECT id, name, category, required_before_start FROM issue_statuses
           WHERE workspace_id=:workspace AND (team_id IS NULL OR team_id=:team)
             AND (required_before_start OR id=:previous)
           ORDER BY position, name'''
    ), {'workspace': workspace_id, 'team': team_id, 'previous': previous_status_id})).mappings().all()
    gates = [row for row in rows if row['required_before_start']]
    previous = next((row for row in rows if row['id'] == previous_status_id), None)
    if not gates or (previous and previous['category'] == 'STARTED'):
        return
    if not previous or not previous['required_before_start'] or target_date is None:
        raise ApiError(
            409,
            f"Move this issue to {' or '.join(row['name'] for row in gates)} and set a target end date before starting work.",
            "Conflict",
        )


async def _ensure_circle_issue_statuses(db: AsyncSession, workspace_id: str) -> None:
    """Seed an empty workflow without overwriting administrator customizations."""
    existing_workflow = (await db.execute(text(
        'SELECT 1 FROM issue_statuses WHERE workspace_id=:workspace AND team_id IS NULL LIMIT 1'
    ), {'workspace':workspace_id})).first()
    if existing_workflow:
        return
    now = _utcnow()
    for position, (name, category, color) in enumerate(DEFAULT_CIRCLE_ISSUE_STATUSES):
        existing = await db.execute(
            text(
                """SELECT id FROM issue_statuses
                   WHERE workspace_id = :workspace_id AND team_id IS NULL
                     AND lower(name) = lower(:name)
                   ORDER BY created_at ASC LIMIT 1"""
            ),
            {"workspace_id": workspace_id, "name": name},
        )
        status_id = existing.scalar_one_or_none()
        if status_id:
            await db.execute(
                text(
                    """UPDATE issue_statuses
                       SET name = :name, category = :category, color = :color,
                           position = :position, updated_at = :now
                       WHERE id = :id"""
                ),
                {
                    "id": status_id,
                    "name": name,
                    "category": category,
                    "color": color,
                    "position": position,
                    "now": now,
                },
            )
            continue
        await db.execute(
            text(
                """INSERT INTO issue_statuses
                   (id, workspace_id, name, category, color, position, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :category, :color, :position, :now, :now)"""
            ),
            {
                "id": _cuid(),
                "workspace_id": workspace_id,
                "name": name,
                "category": category,
                "color": color,
                "position": position,
                "now": now,
            },
        )


async def _validate_references(
    db: AsyncSession,
    workspace_id: str,
    team_id: str | None,
    values: dict[str, Any],
    *,
    creating: bool,
) -> str | None:
    row = None
    status_id = values.get("statusId")
    if status_id:
        status = await db.execute(
            text(
                """SELECT id, category FROM issue_statuses
                   WHERE id = :status_id AND workspace_id = :workspace_id
                     AND (team_id IS NULL OR team_id = :team_id) LIMIT 1"""
            ),
            {"status_id": status_id, "workspace_id": workspace_id, "team_id": team_id},
        )
    elif creating:
        status = await db.execute(
            text(
                """SELECT id, category FROM issue_statuses
                   WHERE workspace_id = :workspace_id AND category = :default_category
                     AND (team_id IS NULL OR team_id = :team_id)
                   ORDER BY position ASC LIMIT 1"""
            ),
            {"workspace_id": workspace_id, "team_id": team_id,
             "default_category": "UNSTARTED" if team_id else "BACKLOG"},
        )
    if status_id or creating:
        row = status.mappings().first()
        if not row:
            raise ApiError(404, "A valid issue status is required.", "Not Found")
        values["statusId"] = row["id"]

    project_id = values.get("projectId")
    if project_id:
        project = await db.execute(
            text(
                """SELECT 1 FROM projects WHERE id = :project_id AND workspace_id = :workspace_id
                   AND archived_at IS NULL AND (team_id IS NULL OR team_id = :team_id) FOR SHARE"""
            ),
            {
                "project_id": project_id,
                "workspace_id": workspace_id,
                "team_id": team_id,
            },
        )
        if project.scalar_one_or_none() is None:
            raise ApiError(404, "Project not found for this team.", "Not Found")

    assignee_id = values.get("assigneeId")
    if assignee_id:
        assignee = await db.execute(
            text(
                """SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id
                   AND user_id = :user_id AND status = 'ACTIVE' LIMIT 1"""
            ),
            {"workspace_id": workspace_id, "user_id": assignee_id},
        )
        if assignee.scalar_one_or_none() is None:
            raise ApiError(404, "Assignee is not a workspace member.", "Not Found")

    reporter_id = values.get("reporterId")
    if reporter_id:
        reporter = await db.execute(
            text(
                """SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id
                   AND user_id = :user_id AND status = 'ACTIVE' LIMIT 1"""
            ),
            {"workspace_id": workspace_id, "user_id": reporter_id},
        )
        if reporter.scalar_one_or_none() is None:
            raise ApiError(404, "Reporter is not a workspace member.", "Not Found")

    label_ids = values.get("labelIds")
    if label_ids is not None:
        unique_ids = list(dict.fromkeys(label_ids))
        if unique_ids:
            labels = await db.execute(
                text(
                    "SELECT id FROM labels WHERE workspace_id = :workspace_id AND id = ANY(:label_ids)"
                ),
                {"workspace_id": workspace_id, "label_ids": unique_ids},
            )
            if len(labels.mappings().all()) != len(unique_ids):
                raise ApiError(404, "One or more labels were not found.", "Not Found")
        values["labelIds"] = unique_ids
    return row["category"] if row else None


async def _validate_release_ids(
    db: AsyncSession, workspace_id: str, release_ids: list[str] | None
) -> list[str]:
    unique_ids = list(dict.fromkeys(release_ids or []))
    if not unique_ids:
        return unique_ids
    releases = await db.execute(
        text(
            """SELECT id FROM releases WHERE workspace_id = :workspace_id
               AND archived_at IS NULL AND id = ANY(:release_ids)"""
        ),
        {"workspace_id": workspace_id, "release_ids": unique_ids},
    )
    if len(releases.mappings().all()) != len(unique_ids):
        raise ApiError(404, "One or more releases were not found.", "Not Found")
    return unique_ids


async def _validate_template_references(
    db: AsyncSession, workspace_id: str, values: dict[str, Any]
) -> None:
    if values.get("statusId"):
        status = await db.execute(
            text(
                "SELECT 1 FROM issue_statuses WHERE id = :id AND workspace_id = :workspace_id"
            ),
            {"id": values["statusId"], "workspace_id": workspace_id},
        )
        if status.scalar_one_or_none() is None:
            raise ApiError(404, "Issue status not found.", "Not Found")
    if values.get("projectId"):
        project = await db.execute(
            text(
                "SELECT 1 FROM projects WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL"
            ),
            {"id": values["projectId"], "workspace_id": workspace_id},
        )
        if project.scalar_one_or_none() is None:
            raise ApiError(404, "Project not found.", "Not Found")
    if values.get("assigneeId"):
        member = await db.execute(
            text(
                "SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :id AND status = 'ACTIVE'"
            ),
            {"id": values["assigneeId"], "workspace_id": workspace_id},
        )
        if member.scalar_one_or_none() is None:
            raise ApiError(404, "Assignee is not a workspace member.", "Not Found")
    if "labelIds" in values:
        label_ids = list(dict.fromkeys(values["labelIds"] or []))
        if label_ids:
            labels = await db.execute(
                text(
                    "SELECT id FROM labels WHERE workspace_id = :workspace_id AND id = ANY(:ids)"
                ),
                {"workspace_id": workspace_id, "ids": label_ids},
            )
            if len(labels.mappings().all()) != len(label_ids):
                raise ApiError(404, "One or more labels were not found.", "Not Found")
        values["labelIds"] = label_ids
