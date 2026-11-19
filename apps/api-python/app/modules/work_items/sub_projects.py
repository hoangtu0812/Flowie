"""Sub projects of an issue: which ones it may carry and how a change is stored.

An issue carries only sub projects of its own project. Every caller that writes an issue (web,
bulk edit, CSV import, MCP) goes through `create_issue`/`update_issue`, which use these helpers,
so the rule holds in one place.
VI: Sub project của issue: issue được mang những sub project nào và thay đổi được lưu ra sao.
VI: Issue chỉ mang sub project của chính dự án chứa nó. Mọi nơi ghi issue (web, bulk edit, nhập
VI: CSV, MCP) đều qua `create_issue`/`update_issue`, vốn dùng các hàm này, nên quy tắc nằm một chỗ.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from .commands import (
    REPLACE_SUB_PROJECTS_DELETE_ISSUE_SUB_PROJECT_LABELS,
    REPLACE_SUB_PROJECTS_INSERT_ISSUE_SUB_PROJECT_LABELS,
    TOUCH_ISSUE_UPDATE_ISSUES,
)
from .issue_activity import _transition, _write_activity
from .queries import (
    CURRENT_SUB_PROJECTS_SELECT,
    INHERITED_SUB_PROJECTS_SELECT,
    INHERITING_CHILDREN_SELECT,
    SUB_PROJECT_LABELS_SELECT_SUB_PROJECT_LABELS,
)


async def validate_sub_projects(
    db: AsyncSession,
    project_id: str | None,
    requested: list[str],
    current: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Returns the requested sub projects (id, name) in request order, without duplicates.

    Refuses (4xx) ids outside `project_id`, any id when the issue has no project, and an archived
    sub project the issue does not already carry: archiving stops new assignments but keeps the
    existing ones, so re-sending the issue's current list never fails.
    VI: Trả các sub project được yêu cầu (id, tên) theo thứ tự gửi, không trùng. Từ chối (4xx) id
    VI: ngoài `project_id`, mọi id khi issue không có dự án, và sub project đã lưu trữ mà issue
    VI: chưa mang: lưu trữ chặn gán mới nhưng giữ gán cũ, nên gửi lại đúng danh sách hiện tại
    VI: không bao giờ lỗi.
    """
    ids = list(dict.fromkeys(requested))
    if not ids:
        return []
    if not project_id:
        raise ApiError(400, "Only an issue in a project can have sub projects.", "Bad Request")
    rows = {
        row["id"]: row
        for row in (
            await db.execute(
                SUB_PROJECT_LABELS_SELECT_SUB_PROJECT_LABELS,
                {"project_id": project_id, "ids": ids},
            )
        ).mappings()
    }
    if len(rows) != len(ids):
        raise ApiError(
            404, "One or more sub projects were not found in this project.", "Not Found"
        )
    carried = {label["id"] for label in current}
    if any(rows[i]["archived_at"] and i not in carried for i in ids):
        raise ApiError(400, "Archived sub projects cannot be assigned.", "Bad Request")
    return [{"id": i, "name": rows[i]["name"]} for i in ids]


async def replace_sub_projects(
    db: AsyncSession,
    issue_id: str,
    current: list[dict[str, Any]],
    target: list[dict[str, Any]],
) -> str | None:
    """Stores `target` as the issue's sub projects and returns the "before → after" text for the
    activity log, or None when the set did not change.
    VI: Lưu `target` làm sub project của issue và trả chuỗi "trước → sau" cho activity, hoặc None
    VI: khi tập không đổi.
    """
    if {label["id"] for label in current} == {label["id"] for label in target}:
        return None
    await db.execute(REPLACE_SUB_PROJECTS_DELETE_ISSUE_SUB_PROJECT_LABELS, {"issue_id": issue_id})
    for label in target:
        await db.execute(
            REPLACE_SUB_PROJECTS_INSERT_ISSUE_SUB_PROJECT_LABELS,
            {"issue_id": issue_id, "label_id": label["id"]},
        )
    return _transition(
        ", ".join(label["name"] for label in current),
        ", ".join(label["name"] for label in target),
    )


async def inherited_sub_projects(
    db: AsyncSession, parent_id: str | None, project_id: str | None
) -> list[dict[str, Any]]:
    """Sub projects an inheriting issue takes from `parent_id`: the parent's ones that belong to
    the issue's own project, so a parent in another project (or no parent/project) gives none.
    VI: Sub project mà issue kế thừa lấy từ `parent_id`: các sub project của parent thuộc chính
    VI: dự án của issue, nên parent ở dự án khác (hoặc không có parent/dự án) cho danh sách rỗng.
    """
    if not parent_id or not project_id:
        return []
    rows = await db.execute(
        INHERITED_SUB_PROJECTS_SELECT, {"parent_id": parent_id, "project_id": project_id}
    )
    return [dict(row) for row in rows.mappings()]


async def cascade_sub_projects(
    db: AsyncSession, workspace_id: str, issue_id: str, actor_id: str
) -> None:
    """Copies the sub projects of `issue_id` down to its inheriting sub-issues, level by level.

    Each changed sub-issue gets its updated_at touched (the version trigger bumps it) and an
    "issue.updated" activity; a sub-issue whose set did not change stops the walk on its branch,
    since its own inheriting children already match it. Independent sub-issues are never read.
    VI: Sao chép sub project của `issue_id` xuống các sub-issue đang kế thừa, từng bậc một. Mỗi
    VI: sub-issue bị đổi được chạm updated_at (trigger tăng version) và có activity
    VI: "issue.updated"; sub-issue không đổi thì dừng nhánh đó, vì các con kế thừa của nó vốn đã
    VI: khớp. Sub-issue độc lập không bao giờ bị đọc tới.
    """
    queue, seen = [issue_id], {issue_id}
    while queue:
        parent_id = queue.pop(0)
        children = (
            await db.execute(INHERITING_CHILDREN_SELECT, {"parent_id": parent_id})
        ).mappings().all()
        for child in children:
            if child["id"] in seen:
                continue
            seen.add(child["id"])
            current = [
                dict(row)
                for row in (
                    await db.execute(CURRENT_SUB_PROJECTS_SELECT, {"issue_id": child["id"]})
                ).mappings()
            ]
            target = await inherited_sub_projects(db, parent_id, child["project_id"])
            change = await replace_sub_projects(db, child["id"], current, target)
            if change is None:
                continue
            await db.execute(TOUCH_ISSUE_UPDATE_ISSUES, {"issue_id": child["id"], "now": utcnow()})
            await _write_activity(db, workspace_id, child["id"], actor_id, "issue.updated", {
                "fields": ["subProjectLabelIds"],
                "changes": [{"field": "Sub projects", "change": change}],
            })
            queue.append(child["id"])
