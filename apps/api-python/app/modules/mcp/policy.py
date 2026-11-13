from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from ..access.project_scope import project_read_scope
from .domain import Principal
from .queries import (
    comment_select_comments_sql,
    document_select_documents_sql,
    issue_select_issues_sql,
    project_select_projects_sql,
    team_select_teams_sql,
)


class AccessPolicy:
    def __init__(self, db: AsyncSession, principal: Principal):
        self.db = db
        self.principal = principal

    @property
    def params(self) -> dict:
        p = self.principal
        return {
            "workspace": p.workspace_id,
            "user": p.user["id"],
            "all_teams": not p.team_ids,
            "teams": list(p.team_ids),
            "all_projects": not p.project_ids,
            "projects": list(p.project_ids),
        }

    def team_clause(self, column: str, *, shared: bool = False) -> str:
        # The inner aliases (member_team, member) must not be ones callers use for ``column``:
        # with "teams t" inside, "t.id" bound to the inner row and every team of the workspace passed.
        # VI: Alias bên trong (member_team, member) không được trùng alias nơi gọi dùng cho ``column``:
        # VI: khi bên trong là "teams t", "t.id" trỏ vào dòng bên trong và mọi team của workspace đều lọt.
        member = f"""EXISTS (SELECT 1 FROM team_members member JOIN teams member_team ON member_team.id=member.team_id
            WHERE member.team_id={column} AND member.user_id=:user AND member_team.workspace_id=:workspace
            AND member_team.archived_at IS NULL)"""
        bound = f"(:all_teams OR {column}=ANY(CAST(:teams AS text[])))"
        shared_clause = f" OR ({column} IS NULL AND :all_teams)" if shared else ""
        return f"(({member} AND {bound}){shared_clause})"

    def project_clause(self, column: str) -> str:
        return f"(:all_projects OR {column}=ANY(CAST(:projects AS text[])))"

    def project_read_clause(self, alias: str = "p") -> str:
        return f"""{project_read_scope(alias)}
            AND {self.team_clause(f'{alias}.team_id', shared=True)}
            AND {self.project_clause(f'{alias}.id')}"""

    def issue_clause(self, alias: str = "i") -> str:
        return f"""{alias}.workspace_id=:workspace AND {alias}.archived_at IS NULL
            AND {self.team_clause(f"{alias}.team_id", shared=True)}
            AND {self.project_clause(f"{alias}.project_id")}"""

    def document_clause(self, alias: str = "d") -> str:
        """Documents this connection may see. A connection bound to projects sees a document of
        an allowed team when it is filed in the Docs tree of an allowed project (the folder's own
        `project_id`, which moves with the folder) or linked to an allowed project or issue. The
        folder rule lets an unlinked document be read and linked for the first time; a folder
        without a project, or of a project outside the grant, adds nothing.
        VI: Tài liệu kết nối này được thấy. Kết nối giới hạn dự án thấy tài liệu của team được
        VI: phép khi tài liệu nằm trong cây Docs của dự án được phép (`project_id` của chính thư
        VI: mục, đổi theo khi thư mục di chuyển) hoặc được liên kết tới dự án hay issue được
        VI: phép. Quy tắc thư mục cho phép đọc và liên kết lần đầu tài liệu chưa có liên kết; thư
        VI: mục không thuộc dự án, hoặc thuộc dự án ngoài phạm vi, không mở thêm gì.
        """
        return f"""{alias}.workspace_id=:workspace AND {alias}.archived_at IS NULL
            AND {self.team_clause(f"{alias}.team_id", shared=True)}
            AND (:all_projects OR EXISTS (
                SELECT 1 FROM document_folders df JOIN projects fp ON fp.id=df.project_id
                WHERE df.id={alias}.folder_id AND fp.workspace_id=:workspace
                AND fp.archived_at IS NULL
                AND {self.team_clause("fp.team_id", shared=True)}
                AND fp.id=ANY(CAST(:projects AS text[]))) OR EXISTS (
                SELECT 1 FROM document_links dl LEFT JOIN issues li ON li.id=dl.issue_id
                JOIN projects lp ON lp.id=COALESCE(dl.project_id,li.project_id)
                WHERE dl.document_id={alias}.id AND dl.workspace_id=:workspace
                AND lp.workspace_id=:workspace AND lp.archived_at IS NULL
                AND {self.team_clause("lp.team_id", shared=True)}
                AND lp.id=ANY(CAST(:projects AS text[]))
                AND (dl.issue_id IS NULL OR ({self.issue_clause("li")}))))"""

    async def team(self, team_id: str) -> None:
        row = (
            await self.db.execute(
                team_select_teams_sql(self),
                {**self.params, "id": team_id},
            )
        ).first()
        if not row:
            raise ApiError(404, "Team not found in the allowed scope.", "Not Found")

    async def project(self, project_id: str) -> dict:
        row = (
            (
                await self.db.execute(
                    project_select_projects_sql(self),
                    {**self.params, "id": project_id},
                )
            )
            .mappings()
            .first()
        )
        if not row:
            raise ApiError(404, "Project not found in the allowed scope.", "Not Found")
        return dict(row)

    async def issue(self, identifier: str, *, lock: bool = False) -> dict:
        row = (
            (
                await self.db.execute(
                    issue_select_issues_sql(self, lock),
                    {**self.params, "id": identifier},
                )
            )
            .mappings()
            .first()
        )
        if not row:
            raise ApiError(404, "Issue not found in the allowed scope.", "Not Found")
        return dict(row)

    async def document(self, document_id: str, *, lock: bool = False) -> dict:
        row = (
            (
                await self.db.execute(
                    document_select_documents_sql(self, lock),
                    {**self.params, "id": document_id},
                )
            )
            .mappings()
            .first()
        )
        if not row:
            raise ApiError(404, "Document not found in the allowed scope.", "Not Found")
        return dict(row)

    async def comment(self, comment_id: str, *, lock: bool = False) -> dict:
        row = (
            (
                await self.db.execute(
                    comment_select_comments_sql(self, lock),
                    {**self.params, "id": comment_id},
                )
            )
            .mappings()
            .first()
        )
        if not row:
            raise ApiError(404, "Comment not found in the allowed scope.", "Not Found")
        return dict(row)

    async def destination(self, project_id: str | None, team_id: str | None) -> None:
        if team_id:
            await self.team(team_id)
        elif self.principal.team_ids:
            raise ApiError(
                403,
                "This connection cannot create workspace-wide records.",
                "Forbidden",
            )
        if project_id:
            project = await self.project(project_id)
            if project["team_id"] and team_id != project["team_id"]:
                raise ApiError(
                    400,
                    "The destination team must match the project team.",
                    "Bad Request",
                )
        elif self.principal.project_ids:
            raise ApiError(
                403, "A permitted project is required for this connection.", "Forbidden"
            )
