from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from .domain import Principal
from ..access.project_scope import project_read_scope


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
        member = f"""EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id
            WHERE tm.team_id={column} AND tm.user_id=:user AND t.workspace_id=:workspace
            AND t.archived_at IS NULL)"""
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
        return f"""{alias}.workspace_id=:workspace AND {alias}.archived_at IS NULL
            AND {self.team_clause(f"{alias}.team_id", shared=True)}
            AND (:all_projects OR EXISTS (
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
                text(f"""SELECT t.id FROM teams t WHERE t.id=:id
            AND t.workspace_id=:workspace AND t.archived_at IS NULL
            AND {self.team_clause("t.id")}
            AND (:all_projects OR EXISTS (SELECT 1 FROM projects p WHERE p.workspace_id=:workspace
                AND p.archived_at IS NULL AND (p.team_id=t.id OR p.team_id IS NULL)
                AND {self.project_clause("p.id")}))"""),
                {**self.params, "id": team_id},
            )
        ).first()
        if not row:
            raise ApiError(404, "Team not found in the allowed scope.", "Not Found")

    async def project(self, project_id: str) -> dict:
        row = (
            (
                await self.db.execute(
                    text(f"""SELECT p.* FROM projects p
            WHERE p.id=:id AND {self.project_read_clause()}"""),
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
                    text(f"""SELECT i.* FROM issues i
            WHERE (i.id=:id OR i.identifier=:id) AND {self.issue_clause()}
            {"FOR UPDATE OF i" if lock else ""}"""),
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
                    text(f"""SELECT d.* FROM documents d
            WHERE d.id=:id AND {self.document_clause()} {"FOR UPDATE OF d" if lock else ""}"""),
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
                    text(f"""SELECT c.* FROM comments c JOIN issues i ON i.id=c.issue_id
            WHERE c.id=:id AND c.deleted_at IS NULL AND {self.issue_clause()}
            {"FOR UPDATE OF c" if lock else ""}"""),
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
