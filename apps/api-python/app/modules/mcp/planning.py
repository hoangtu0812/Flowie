"""Planning checks an agent sees after it creates, updates or moves an issue.

The workflow asks agents to plan before they work: a due date, a start and end date and an
estimated effort in man-days, then the actual effort when the work is complete. These checks
only warn; they never block a write, so a person's plan or a missing date stays the person's
call. Warnings are plain English sentences that the agent can act on directly.
VI: Kiểm tra kế hoạch mà agent thấy sau khi tạo, sửa hoặc chuyển trạng thái issue. Quy trình yêu
VI: cầu agent lập kế hoạch trước khi làm: hạn, ngày bắt đầu và kết thúc, effort ước tính theo
VI: man-day, rồi effort thực tế khi xong việc. Các kiểm tra chỉ cảnh báo, không bao giờ chặn
VI: thao tác ghi, nên kế hoạch hay ngày còn thiếu vẫn do người quyết định. Cảnh báo là câu tiếng
VI: Anh để agent xử lý được ngay.
"""

from __future__ import annotations

from typing import Any

PLAN_FIELDS = ("startDate", "targetDate", "dueDate", "estimatedEffort", "actualEffort")


def _day(value: Any) -> str | None:
    # Dates arrive as ISO strings or datetimes; the calendar day is what plans compare.
    # VI: Ngày đến dưới dạng chuỗi ISO hoặc datetime; kế hoạch chỉ so theo ngày lịch.
    return str(value)[:10] if value else None


def planning_warnings(issue: dict[str, Any], today: str) -> list[str]:
    """Warnings for the plan of `issue` (an issue as the API returns it) on `today` (YYYY-MM-DD).
    VI: Cảnh báo về kế hoạch của `issue` (issue theo dạng API trả về) vào ngày `today` (YYYY-MM-DD).
    """
    category = ((issue.get("status") or {}).get("category") or "").upper()
    start, target, due = (_day(issue.get(key)) for key in ("startDate", "targetDate", "dueDate"))
    warnings: list[str] = []
    if not due:
        warnings.append("No due date: ask the requester for one and set dueDate.")
    if category == "STARTED":
        missing = [
            name
            for name, value in (
                ("startDate", start),
                ("targetDate", target),
                ("estimatedEffort", issue.get("estimatedEffort")),
            )
            if value is None
        ]
        if missing:
            warnings.append(
                "Work has started without a plan: set " + ", ".join(missing)
                + " (estimatedEffort in man-days)."
            )
    if category == "COMPLETED" and issue.get("actualEffort") is None:
        warnings.append("Completed without actualEffort: record the man-days spent.")
    if start and target and start > target:
        warnings.append(f"startDate {start} is after targetDate {target}.")
    if target and due and target > due:
        warnings.append(f"targetDate {target} is after dueDate {due}.")
    if category not in {"COMPLETED", "CANCELED"}:
        for name, value in (("targetDate", target), ("dueDate", due)):
            if value and value < today:
                warnings.append(f"Overdue: {name} {value} has passed.")
    return warnings


def planning_summary(issue: dict[str, Any], today: str) -> dict[str, Any]:
    """The issue's plan fields and their warnings, for `get_issue_context`.
    VI: Các trường kế hoạch của issue và cảnh báo, cho `get_issue_context`.
    """
    return {
        **{key: issue.get(key) for key in PLAN_FIELDS},
        "effortUnit": "man-days",
        "warnings": planning_warnings(issue, today),
    }
