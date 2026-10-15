from __future__ import annotations
from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ...core.clock import _utcnow
from ...modules.notifications.outbox import stage_notifications
from .bug_contracts import BUG_COLUMNS
from .contracts import CreateIssueInput, UpdateIssueInput
from ...core.dates import _date
from ..access.projects import _team_access, _workspace_access
from .deadlines import resolve_deadline
from ...services.notification_events import (
    create_notification_batch,
    issue_recipient_ids,
    team_recipient_ids,
)
from .issue_rules import (
    _validate_references,
    _validate_schedule_dates,
    _validate_release_ids,
)
from .issue_queries import _issue_row, _status_name, _person_name, _project_name
from .issue_activity import _write_activity, _transition


async def create_issue(
    payload: CreateIssueInput,
    user: Any,
    db: AsyncSession,
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user["id"])
    await _team_access(db, payload.workspaceId, payload.teamId, user["id"])
    values = payload.model_dump()
    category = await _validate_references(
        db, payload.workspaceId, payload.teamId, values, creating=True
    )
    _validate_schedule_dates(
        _date(values.get("startDate")), _date(values.get("targetDate"))
    )
    if not values.get("dueDate"):
        values["dueDate"] = await resolve_deadline(
            db, payload.workspaceId, payload.teamId, values["priority"]
        )
    if values.get("parentIssueId"):
        parent = await db.execute(
            text("""SELECT 1 FROM issues WHERE id = :issue_id AND workspace_id = :workspace_id
                    AND team_id = :team_id AND archived_at IS NULL"""),
            {
                "issue_id": values["parentIssueId"],
                "workspace_id": payload.workspaceId,
                "team_id": payload.teamId,
            },
        )
        if parent.scalar_one_or_none() is None:
            raise ApiError(
                404, "Parent issue was not found for this team.", "Not Found"
            )
    team = await db.execute(
        text("""UPDATE teams SET issue_sequence = issue_sequence + 1, updated_at = :now
                WHERE id = :team_id AND workspace_id = :workspace_id
                RETURNING identifier, issue_sequence"""),
        {
            "team_id": payload.teamId,
            "workspace_id": payload.workspaceId,
            "now": _utcnow(),
        },
    )
    sequence = team.mappings().first()
    if not sequence:
        raise ApiError(404, "Team not found.", "Not Found")
    issue_id, now = _cuid(), _utcnow()
    completed_at = now if category == "COMPLETED" else None
    canceled_at = now if category == "CANCELED" else None
    await db.execute(
        text(
            """INSERT INTO issues (id, workspace_id, team_id, status_id, project_id, parent_issue_id,
               identifier, number, issue_type, severity, environment, reproduction_steps, expected_result, actual_result, title, description, priority, estimated_effort, actual_effort, start_date, target_date, due_date, creator_id,
               assignee_id, completed_at, canceled_at, created_at, updated_at)
               VALUES (:id, :workspace_id, :team_id, :status_id, :project_id, :parent_issue_id,
               :identifier, :number, :issueType, :severity, :environment, :reproductionSteps, :expectedResult, :actualResult, :title, :description, :priority, :estimated_effort, :actual_effort, :start_date, :target_date, :due_date, :creator_id,
               :assignee_id, :completed_at, :canceled_at, :now, :now)"""
        ),
        {
            **{field: values.get(field) for field in BUG_COLUMNS},
            "id": issue_id,
            "workspace_id": payload.workspaceId,
            "team_id": payload.teamId,
            "status_id": values["statusId"],
            "project_id": values.get("projectId"),
            "parent_issue_id": values.get("parentIssueId"),
            "identifier": f"{sequence['identifier']}-{sequence['issue_sequence']}",
            "number": sequence["issue_sequence"],
            "title": payload.title.strip(),
            "description": values.get("description"),
            "priority": values["priority"],
            "estimated_effort": values.get("estimatedEffort"),
            "actual_effort": values.get("actualEffort"),
            "start_date": _date(values.get("startDate")),
            "target_date": _date(values.get("targetDate")),
            "due_date": _date(values.get("dueDate")),
            "creator_id": user["id"],
            "assignee_id": values.get("assigneeId"),
            "completed_at": completed_at,
            "canceled_at": canceled_at,
            "now": now,
        },
    )
    for label_id in values.get("labelIds") or []:
        await db.execute(
            text(
                "INSERT INTO issue_labels (issue_id, label_id) VALUES (:issue_id, :label_id)"
            ),
            {"issue_id": issue_id, "label_id": label_id},
        )
    for subscriber_id in {user["id"], values.get("assigneeId")} - {None}:
        await db.execute(
            text(
                "INSERT INTO issue_subscriptions (issue_id, user_id) VALUES (:issue_id, :user_id) ON CONFLICT DO NOTHING"
            ),
            {"issue_id": issue_id, "user_id": subscriber_id},
        )
    await _write_activity(
        db,
        payload.workspaceId,
        issue_id,
        user["id"],
        "issue.created",
        {
            "title": payload.title.strip(),
            "identifier": f"{sequence['identifier']}-{sequence['issue_sequence']}",
        },
    )
    if values.get("parentIssueId"):
        await _write_activity(
            db,
            payload.workspaceId,
            values["parentIssueId"],
            user["id"],
            "issue.subissue_created",
            {
                "issueId": issue_id,
                "identifier": f"{sequence['identifier']}-{sequence['issue_sequence']}",
                "title": payload.title.strip(),
            },
        )
    created_details = [
        ("Team", sequence["identifier"]),
        ("Status", await _status_name(db, values["statusId"]) or ""),
        ("Priority", (values.get("priority") or "NONE").title()),
    ]
    assignee_name = await _person_name(db, values.get("assigneeId"))
    if assignee_name:
        created_details.append(("Assignee", assignee_name))
    created_batch = await create_notification_batch(
        db,
        workspace_id=payload.workspaceId,
        recipient_ids=await team_recipient_ids(db, payload.teamId),
        actor=user,
        event_type="issue.created",
        entity_type="issue",
        entity_id=issue_id,
        title=payload.title.strip(),
        message="created a new issue",
        entity_path=f"/issue/{sequence['identifier']}-{sequence['issue_sequence']}",
        entity_label=f"{sequence['identifier']}-{sequence['issue_sequence']}",
        details=created_details,
        body=values.get("description"),
    )
    assignment_batch = await create_notification_batch(
        db,
        workspace_id=payload.workspaceId,
        recipient_ids={values["assigneeId"]} if values.get("assigneeId") else set(),
        actor=user,
        event_type="issue.assignment",
        entity_type="issue",
        entity_id=issue_id,
        title=payload.title.strip(),
        message="assigned you to an issue",
        entity_path=f"/issue/{sequence['identifier']}-{sequence['issue_sequence']}",
        entity_label=f"{sequence['identifier']}-{sequence['issue_sequence']}",
        discord=False,
    )
    await stage_notifications(
        db, created_batch, assignment_batch, workspace_id=payload.workspaceId
    )
    return {"data": await _issue_row(db, issue_id, payload.workspaceId, user["id"])}


async def update_issue(
    issue_id: str,
    payload: UpdateIssueInput,
    workspaceId: str,
    user: Any,
    db: AsyncSession,
) -> dict[str, dict[str, Any]]:
    issue = await _issue_row(db, issue_id, workspaceId, user["id"])
    values = payload.model_dump(exclude_unset=True)
    previous_status_id = issue["statusId"]
    previous_assignee_id = issue["assignee"]["id"] if issue.get("assignee") else None
    if "statusId" in values and values["statusId"] is None:
        raise ApiError(400, "statusId cannot be empty.", "Bad Request")
    _validate_schedule_dates(
        _date(values["startDate"]) if "startDate" in values else issue.get("startDate"),
        _date(values["targetDate"])
        if "targetDate" in values
        else issue.get("targetDate"),
    )
    category = await _validate_references(
        db, workspaceId, issue["teamId"], values, creating=False
    )
    if "releaseIds" in values:
        values["releaseIds"] = await _validate_release_ids(
            db, workspaceId, values["releaseIds"]
        )
    columns = {
        **BUG_COLUMNS,
        "title": "title",
        "description": "description",
        "statusId": "status_id",
        "projectId": "project_id",
        "assigneeId": "assignee_id",
        "priority": "priority",
        "estimatedEffort": "estimated_effort",
        "actualEffort": "actual_effort",
        "startDate": "start_date",
        "targetDate": "target_date",
        "dueDate": "due_date",
    }
    sets, params = [], {"issue_id": issue_id, "now": _utcnow()}
    for field, column in columns.items():
        if field in values:
            params[field] = (
                _date(values[field])
                if field in {"startDate", "targetDate", "dueDate"}
                else values[field]
            )
            if field == "title" and isinstance(params[field], str):
                params[field] = params[field].strip()
            sets.append(f"{column} = :{field}")
    if category:
        sets.extend(["completed_at = :completed_at", "canceled_at = :canceled_at"])
        params["completed_at"] = _utcnow() if category == "COMPLETED" else None
        params["canceled_at"] = _utcnow() if category == "CANCELED" else None
    if values:
        await db.execute(
            text(
                f"UPDATE issues SET {', '.join([*sets, 'updated_at = :now'])} WHERE id = :issue_id"
            ),
            params,
        )
    if "labelIds" in values:
        await db.execute(
            text("DELETE FROM issue_labels WHERE issue_id = :issue_id"),
            {"issue_id": issue_id},
        )
        for label_id in values["labelIds"] or []:
            await db.execute(
                text(
                    "INSERT INTO issue_labels (issue_id, label_id) VALUES (:issue_id, :label_id)"
                ),
                {"issue_id": issue_id, "label_id": label_id},
            )
    if "releaseIds" in values:
        await db.execute(
            text("DELETE FROM issue_releases WHERE issue_id = :issue_id"),
            {"issue_id": issue_id},
        )
        for release_id in values["releaseIds"]:
            await db.execute(
                text(
                    "INSERT INTO issue_releases (issue_id, release_id) VALUES (:issue_id, :release_id)"
                ),
                {"issue_id": issue_id, "release_id": release_id},
            )
    if values.get("assigneeId"):
        await db.execute(
            text(
                "INSERT INTO issue_subscriptions (issue_id, user_id) VALUES (:issue_id, :user_id) ON CONFLICT DO NOTHING"
            ),
            {"issue_id": issue_id, "user_id": values["assigneeId"]},
        )
    await _write_activity(
        db, workspaceId, issue_id, user["id"], "issue.updated", {"fields": list(values)}
    )
    recipients = await issue_recipient_ids(db, issue_id, previous_assignee_id)
    entity_path, entity_label = f"/issue/{issue['identifier']}", issue["identifier"]
    status_changed = (
        bool(values.get("statusId")) and values["statusId"] != previous_status_id
    )
    assignee_changed = (
        "assigneeId" in values and values["assigneeId"] != previous_assignee_id
    )
    assignee_transition = (
        _transition(
            issue["assignee"]["name"] if issue.get("assignee") else None,
            await _person_name(db, values.get("assigneeId")),
        )
        if assignee_changed
        else None
    )

    changes: list[tuple[str, str]] = []
    if status_changed:
        changes.append(
            (
                "Status",
                _transition(
                    issue["status"]["name"], await _status_name(db, values["statusId"])
                ),
            )
        )
    if assignee_transition:
        changes.append(("Assignee", assignee_transition))
    if "title" in values and values["title"] != issue["title"]:
        changes.append(("Title", _transition(issue["title"], values["title"])))
    if "priority" in values and values["priority"] != issue["priority"]:
        changes.append(("Priority", _transition(issue["priority"], values["priority"])))
    if "projectId" in values and values["projectId"] != issue["projectId"]:
        changes.append(
            (
                "Project",
                _transition(
                    issue["project"]["name"] if issue.get("project") else None,
                    await _project_name(db, values["projectId"]),
                ),
            )
        )
    if "startDate" in values:
        before = (
            issue["startDate"].date().isoformat() if issue.get("startDate") else None
        )
        after = _date(values["startDate"])
        after_text = after.date().isoformat() if after else None
        if before != after_text:
            changes.append(("Start date", _transition(before, after_text)))
    if "targetDate" in values:
        before = (
            issue["targetDate"].date().isoformat() if issue.get("targetDate") else None
        )
        after = _date(values["targetDate"])
        after_text = after.date().isoformat() if after else None
        if before != after_text:
            changes.append(("Target end date", _transition(before, after_text)))
    if "dueDate" in values:
        before = issue["dueDate"].date().isoformat() if issue.get("dueDate") else None
        after = _date(values["dueDate"])
        after_text = after.date().isoformat() if after else None
        if before != after_text:
            changes.append(("Due date", _transition(before, after_text)))
    if (
        "estimatedEffort" in values
        and values["estimatedEffort"] != issue["estimatedEffort"]
    ):
        changes.append(
            (
                "Estimated effort",
                _transition(issue["estimatedEffort"], values["estimatedEffort"]),
            )
        )
    if "actualEffort" in values and values["actualEffort"] != issue["actualEffort"]:
        changes.append(
            (
                "Actual effort",
                _transition(issue["actualEffort"], values["actualEffort"]),
            )
        )
    if "description" in values and values["description"] != issue["description"]:
        changes.append(("Description", "updated"))

    change_batch = (
        await create_notification_batch(
            db,
            workspace_id=workspaceId,
            recipient_ids=recipients,
            actor=user,
            event_type="issue.status_changed" if status_changed else "issue.updated",
            entity_type="issue",
            entity_id=issue_id,
            title=issue["title"],
            message="changed the status of an issue"
            if status_changed
            else "updated an issue",
            entity_path=entity_path,
            entity_label=entity_label,
            details=changes,
        )
        if changes
        else None
    )
    assignment_batch = (
        await create_notification_batch(
            db,
            workspace_id=workspaceId,
            recipient_ids={values["assigneeId"]} if values.get("assigneeId") else set(),
            actor=user,
            event_type="issue.assignment",
            entity_type="issue",
            entity_id=issue_id,
            title=issue["title"],
            message="assigned you to an issue",
            entity_path=entity_path,
            entity_label=entity_label,
            details=[("Assignee", assignee_transition or "")],
            discord=False,
        )
        if assignee_changed and values.get("assigneeId")
        else None
    )
    await stage_notifications(
        db, change_batch, assignment_batch, workspace_id=workspaceId
    )
    return {"data": await _issue_row(db, issue_id, workspaceId, user["id"])}
