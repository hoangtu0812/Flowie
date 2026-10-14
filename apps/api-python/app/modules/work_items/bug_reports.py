from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ..access.projects import _workspace_access, _team_access


async def report(
    db: AsyncSession, workspace: str, user: str, team: str | None, project: str | None
) -> dict:
    await _workspace_access(db, workspace, user)
    if team:
        await _team_access(db, workspace, team, user)
    rows = (
        (
            await db.execute(
                text("""SELECT COALESCE(i.severity::text,'UNSPECIFIED') AS severity,
        s.category, count(*) AS count FROM issues i JOIN issue_statuses s ON s.id=i.status_id
        JOIN teams t ON t.id=i.team_id WHERE i.workspace_id=:workspace AND i.issue_type='BUG'
        AND i.archived_at IS NULL AND t.archived_at IS NULL
        AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=i.team_id AND tm.user_id=:user)
        AND (CAST(:team AS text) IS NULL OR i.team_id=:team) AND (CAST(:project AS text) IS NULL OR i.project_id=:project)
        GROUP BY i.severity,s.category ORDER BY severity,s.category"""),
                {
                    "workspace": workspace,
                    "user": user,
                    "team": team,
                    "project": project,
                },
            )
        )
        .mappings()
        .all()
    )
    return {
        "total": sum(row["count"] for row in rows),
        "groups": [dict(row) for row in rows],
    }
