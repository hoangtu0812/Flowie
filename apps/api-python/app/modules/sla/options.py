
from ..access.projects import team_access, workspace_manager
from .queries import (
    POLICY_OPTIONS_SELECT_ISSUE_STATUSES,
    POLICY_OPTIONS_SELECT_WORKSPACE_MEMBERS,
)


async def policy_options(db, workspace, user, team):
    await workspace_manager(db, workspace, user["id"])
    if team:
        await team_access(db, workspace, team, user["id"])
    params = {"workspace": workspace, "team": team}
    statuses = (
        (
            await db.execute(
                POLICY_OPTIONS_SELECT_ISSUE_STATUSES,
                params,
            )
        )
        .mappings()
        .all()
    )
    members = (
        (
            await db.execute(
                POLICY_OPTIONS_SELECT_WORKSPACE_MEMBERS,
                params,
            )
        )
        .mappings()
        .all()
    )
    return {
        "data": {
            "statuses": [dict(row) for row in statuses],
            "members": [dict(row) for row in members],
        }
    }
