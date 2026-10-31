"""Short write results: an agent needs what changed and the new version, not the whole record
it just sent. Reading the full record stays one `get_issue` call away.
VI: Kết quả ghi rút gọn: agent cần biết gì đã đổi và version mới, không cần cả bản ghi vừa gửi.
VI: Muốn đọc đầy đủ thì gọi `get_issue`.
"""

from __future__ import annotations

from typing import Any

ISSUE_FIELDS = (
    "id", "identifier", "title", "version",
    "startDate", "targetDate", "dueDate", "estimatedEffort", "actualEffort",
)
# Long free text the agent already has; echoing it back is what made write results large.
# VI: Văn bản dài agent đã có sẵn; gửi lại nó là nguyên nhân làm kết quả ghi lớn.
LONG_TEXT = {
    "description", "environment", "reproductionSteps", "expectedResult", "actualResult",
    "resolution", "reason", "content", "plan", "result",
}
# Request fields whose stored form has another name in the issue record.
# VI: Trường gửi lên có tên khác trong bản ghi issue.
RENAMED = {"assigneeId": "assignee", "reporterId": "reporter", "projectId": "project", "labelIds": "labelLinks"}
COMMENT_FIELDS = ("id", "issueId", "parentCommentId", "version", "createdAt")


def _person(value: Any) -> Any:
    return {"id": value.get("id"), "name": value.get("name")} if isinstance(value, dict) else value


def compact_issue(data: dict[str, Any], sent: set[str]) -> dict[str, Any]:
    result = {key: data.get(key) for key in ISSUE_FIELDS}
    status = data.get("status") or {}
    result["status"] = {key: status.get(key) for key in ("id", "name", "category")}
    for field in sorted(sent - LONG_TEXT - set(result)):
        key = RENAMED.get(field, field)
        if key not in data:
            continue
        value = data[key]
        if key == "labelLinks":
            value = [link["label"]["name"] for link in value or [] if link.get("label")]
            key = "labels"
        elif key in {"assignee", "reporter", "project"}:
            value = _person(value)
        result[key] = value
    return result


def compact_comment(data: dict[str, Any]) -> dict[str, Any]:
    return {key: data.get(key) for key in COMMENT_FIELDS}
