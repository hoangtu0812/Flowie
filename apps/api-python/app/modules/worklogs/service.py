"""Hours people log on issues and the weekly timesheet built from them (DTD-902).

Anyone who can read an issue sees its worklogs and may log their own hours on it; only the
author or a workspace owner/admin may change or delete an entry. Every write locks the issue,
then recomputes its actual effort as logged hours / HOURS_PER_DAY, so the web and MCP writers
share one rule. ADMIN_VIEWER writes are refused app-wide before reaching this module.
VI: Số giờ mọi người ghi trên issue và timesheet tuần dựng từ đó (DTD-902).
VI: Ai đọc được issue thì thấy worklog của nó và được ghi giờ của chính mình; chỉ người ghi hoặc
VI: owner/admin workspace được sửa hay xoá một bản ghi. Mỗi lần ghi khoá issue rồi tính lại actual
VI: effort = giờ đã ghi / HOURS_PER_DAY, nên web và MCP dùng chung một quy tắc. Thao tác ghi của
VI: ADMIN_VIEWER bị chặn toàn app trước khi tới module này.

Writers do not commit: the HTTP route commits, and the MCP application commits together with the
tool call's idempotency and audit records.
VI: Hàm ghi không tự commit: route HTTP commit, còn MCP application commit cùng bản ghi
VI: idempotency và audit của lời gọi tool.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..access.membership import workspace_role
from ..work_items.issue_queries import issue_row
from ..work_items.lifecycle import actor_context
from .commands import DELETE_WORKLOG, INSERT_WORKLOG, SYNC_ACTUAL_EFFORT, UPDATE_WORKLOG
from .queries import (
    LIST_WORKLOGS,
    LOCK_ISSUE,
    SELECT_WORKLOG,
    TIMESHEET_ENTRIES,
    TIMESHEET_TOTALS,
)

# shortcut: one man-day is a fixed 8 hours; make it a workspace setting when teams differ.
# VI: shortcut: một man-day cố định 8 giờ; chuyển thành cấu hình workspace khi các team khác nhau.
HOURS_PER_DAY = 8
EDITOR_ROLES = frozenset({"OWNER", "ADMIN"})


class WorklogInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    workDate: date
    # Quarter-hour steps keep float sums exact and match the web input's step.
    # VI: Bước 15 phút giữ tổng số thực chính xác và khớp bước của ô nhập trên web.
    hours: float = Field(gt=0, le=24, multiple_of=0.25)
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("note")
    @classmethod
    def blank_note(cls, value: str | None) -> str | None:
        return (value or "").strip() or None


def _check_work_date(work_date: date) -> None:
    # One day of slack past today's UTC date lets people at UTC+7 log their own "today".
    # VI: Cho phép quá ngày UTC hôm nay một ngày để người ở UTC+7 ghi được "hôm nay" của họ.
    today = utcnow().date()
    if work_date > today + timedelta(days=1):
        raise ApiError(400, "Work date cannot be in the future.", "Bad Request")
    if work_date < today - timedelta(days=366):
        raise ApiError(400, "Work date cannot be more than a year ago.", "Bad Request")


async def _can_edit_all(db: AsyncSession, workspace_id: str, user_id: str) -> bool:
    return await workspace_role(db, workspace_id, user_id) in EDITOR_ROLES


async def list_worklogs(
    db: AsyncSession, issue_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    """The issue's worklogs, their total hours and its actual effort, after a read check.
    VI: Worklog của issue, tổng giờ và actual effort của nó, sau khi kiểm tra quyền đọc."""
    issue = await issue_row(db, issue_id, workspace_id, user_id)
    editor = await _can_edit_all(db, workspace_id, user_id)
    rows = (await db.execute(LIST_WORKLOGS, {"issue": issue["id"]})).mappings().all()
    items = [
        {
            "id": row["id"],
            "issueId": row["issue_id"],
            "user": {"id": row["user_id"], "name": row["user_name"], "avatarUrl": row["user_avatar_url"]},
            "workDate": row["work_date"].isoformat(),
            "hours": row["hours"],
            "note": row["note"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "canEdit": editor or row["user_id"] == user_id,
        }
        for row in rows
    ]
    return {
        "items": items,
        "totalHours": sum(item["hours"] for item in items),
        "actualEffort": issue["actualEffort"],
    }


async def _locked_issue(db: AsyncSession, issue_id: str, workspace_id: str, user_id: str) -> str:
    issue = await issue_row(db, issue_id, workspace_id, user_id)
    await db.execute(LOCK_ISSUE, {"issue": issue["id"]})
    await actor_context(db, user_id)
    return str(issue["id"])


async def _sync_effort(db: AsyncSession, issue_id: str) -> None:
    await db.execute(
        SYNC_ACTUAL_EFFORT, {"issue": issue_id, "hours_per_day": HOURS_PER_DAY, "now": utcnow()}
    )


async def create_worklog(
    db: AsyncSession, issue_id: str, payload: WorklogInput, user_id: str
) -> dict[str, Any]:
    """Logs the caller's own hours on a readable issue and returns the refreshed list.
    VI: Ghi giờ của chính người gọi trên issue đọc được và trả về danh sách đã cập nhật."""
    _check_work_date(payload.workDate)
    issue = await _locked_issue(db, issue_id, payload.workspaceId, user_id)
    await db.execute(
        INSERT_WORKLOG,
        {
            "id": cuid(), "issue": issue, "user": user_id, "work_date": payload.workDate,
            "hours": payload.hours, "note": payload.note, "now": utcnow(),
        },
    )
    await _sync_effort(db, issue)
    return await list_worklogs(db, issue, payload.workspaceId, user_id)


async def _editable(db: AsyncSession, issue: str, worklog_id: str, workspace_id: str, user_id: str) -> None:
    row = (await db.execute(SELECT_WORKLOG, {"id": worklog_id, "issue": issue})).mappings().one_or_none()
    if row is None:
        raise ApiError(404, "Worklog not found.", "Not Found")
    if row["user_id"] != user_id and not await _can_edit_all(db, workspace_id, user_id):
        raise ApiError(403, "Only the author or a workspace admin can change this worklog.", "Forbidden")


async def update_worklog(
    db: AsyncSession, issue_id: str, worklog_id: str, payload: WorklogInput, user_id: str
) -> dict[str, Any]:
    _check_work_date(payload.workDate)
    issue = await _locked_issue(db, issue_id, payload.workspaceId, user_id)
    await _editable(db, issue, worklog_id, payload.workspaceId, user_id)
    await db.execute(
        UPDATE_WORKLOG,
        {"id": worklog_id, "work_date": payload.workDate, "hours": payload.hours, "note": payload.note, "now": utcnow()},
    )
    await _sync_effort(db, issue)
    return await list_worklogs(db, issue, payload.workspaceId, user_id)


async def delete_worklog(
    db: AsyncSession, issue_id: str, worklog_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    issue = await _locked_issue(db, issue_id, workspace_id, user_id)
    await _editable(db, issue, worklog_id, workspace_id, user_id)
    await db.execute(DELETE_WORKLOG, {"id": worklog_id})
    await _sync_effort(db, issue)
    return await list_worklogs(db, issue, workspace_id, user_id)


def week_bounds(week_start: date | None) -> tuple[date, date]:
    """Monday of the week containing `week_start` (default: this week) and the next Monday.
    VI: Thứ Hai của tuần chứa `week_start` (mặc định tuần này) và thứ Hai tuần sau."""
    day = week_start or utcnow().date()
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=7)


def _scope(workspace_id: str, user_id: str, start: date, end: date, team_id: str | None, project_id: str | None) -> dict[str, Any]:
    return {"workspace": workspace_id, "user": user_id, "start": start, "end": end, "team": team_id, "project": project_id}


async def timesheet(
    db: AsyncSession,
    workspace_id: str,
    user_id: str,
    week_start: date | None,
    team_id: str | None = None,
    project_id: str | None = None,
) -> dict[str, Any]:
    """Hours per person per day for one Monday-to-Sunday week, with row, column and grand totals.
    VI: Số giờ theo người theo ngày cho một tuần thứ Hai–Chủ nhật, kèm tổng dòng, tổng cột và tổng chung."""
    await workspace_role(db, workspace_id, user_id)
    start, end = week_bounds(week_start)
    days = [start + timedelta(days=offset) for offset in range(7)]
    rows = (await db.execute(TIMESHEET_TOTALS, _scope(workspace_id, user_id, start, end, team_id, project_id))).mappings()
    people: dict[str, dict[str, Any]] = {}
    for row in rows:
        person = people.setdefault(row["user_id"], {
            "user": {"id": row["user_id"], "name": row["user_name"], "avatarUrl": row["user_avatar_url"]},
            "hours": [0.0] * 7,
            "total": 0.0,
        })
        person["hours"][(row["work_date"] - start).days] += row["hours"]
        person["total"] += row["hours"]
    ordered = sorted(people.values(), key=lambda person: (person["user"]["name"] or "").lower())
    return {
        "weekStart": start.isoformat(),
        "days": [day.isoformat() for day in days],
        "people": ordered,
        "totals": [sum(person["hours"][index] for person in ordered) for index in range(7)],
        "total": sum(person["total"] for person in ordered),
    }


TIMESHEET_COLUMNS = ["Date", "Person", "Email", "Issue", "Title", "Project", "Hours", "Note"]


async def timesheet_entries(
    db: AsyncSession,
    workspace_id: str,
    user_id: str,
    week_start: date | None,
    team_id: str | None = None,
    project_id: str | None = None,
) -> tuple[date, list[list[Any]]]:
    """One export row per worklog in the same scope as `timesheet`, ordered by day and person.
    VI: Mỗi worklog một dòng xuất, cùng phạm vi với `timesheet`, sắp theo ngày và người."""
    await workspace_role(db, workspace_id, user_id)
    start, end = week_bounds(week_start)
    rows = (await db.execute(TIMESHEET_ENTRIES, _scope(workspace_id, user_id, start, end, team_id, project_id))).mappings()
    return start, [
        [row["work_date"].isoformat(), row["user_name"], row["user_email"], row["identifier"],
         row["title"], row["project_name"], row["hours"], row["note"]]
        for row in rows
    ]
