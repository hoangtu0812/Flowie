from sqlalchemy.ext.asyncio import AsyncSession

from ..access.projects import team_access, workspace_access
from .queries import (
    REPORT_SELECT_ISSUES,
)


async def report(
    db: AsyncSession, workspace: str, user: str, team: str | None, project: str | None
) -> dict:
    await workspace_access(db, workspace, user)
    if team:
        await team_access(db, workspace, team, user)
    rows = (
        (
            await db.execute(
                REPORT_SELECT_ISSUES,
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
