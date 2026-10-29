from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError


async def validate_parent(
    db: AsyncSession,
    workspace_id: str,
    team_id: str | None,
    issue_id: str,
    parent_id: str,
) -> dict:
    """Check that ``parent_id`` may become the parent of ``issue_id`` and return the parent row.

    The parent must be another unarchived issue of the same workspace and team (the create flow's
    rule; projects may differ) and must not be a descendant of the issue. The workspace advisory
    lock is the one the ``issue_parent_guard`` trigger takes, so concurrent moves are checked one
    after another and cannot form a cycle together; it is held until the transaction ends.
    VI: Kiểm tra ``parent_id`` có thể làm cha của ``issue_id`` và trả về dòng của issue cha.
    VI: Cha phải là issue khác, chưa archive, cùng workspace và team (quy tắc của luồng tạo;
    VI: project có thể khác) và không phải hậu duệ của issue. Khóa advisory theo workspace trùng
    VI: với khóa của trigger ``issue_parent_guard`` nên các thao tác đồng thời được kiểm tra lần
    VI: lượt, không thể cùng tạo vòng; khóa giữ đến hết transaction.
    """
    if parent_id == issue_id:
        raise ApiError(400, "An issue cannot be its own parent.", "Bad Request")
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended('issue-hierarchy:' || :workspace, 0))"),
        {"workspace": workspace_id},
    )
    parent = (
        await db.execute(
            text("""SELECT id, identifier FROM issues WHERE id = :id AND workspace_id = :workspace
                    AND team_id IS NOT DISTINCT FROM :team AND archived_at IS NULL"""),
            {"id": parent_id, "workspace": workspace_id, "team": team_id},
        )
    ).mappings().first()
    if parent is None:
        raise ApiError(404, "Parent issue was not found for this team.", "Not Found")
    cycle = await db.execute(
        text("""WITH RECURSIVE ancestors(id, parent_issue_id) AS (
                    SELECT id, parent_issue_id FROM issues WHERE id = :parent
                    UNION
                    SELECT i.id, i.parent_issue_id FROM issues i JOIN ancestors a ON i.id = a.parent_issue_id
                ) SELECT 1 FROM ancestors WHERE id = :issue"""),
        {"parent": parent_id, "issue": issue_id},
    )
    if cycle.first():
        raise ApiError(400, "An issue cannot be moved under its own sub-issue.", "Bad Request")
    return dict(parent)
