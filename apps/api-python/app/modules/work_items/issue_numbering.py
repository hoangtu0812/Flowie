
from ...core.clock import utcnow
from ...core.errors import ApiError
from .commands import (
    ALLOCATE_ISSUE_NUMBER_UPDATE_TEAMS,
    ALLOCATE_ISSUE_NUMBER_UPDATE_WORKSPACES,
)


async def allocate_issue_number(db, workspace_id: str, team_id: str | None):
    if team_id:
        result = await db.execute(
            ALLOCATE_ISSUE_NUMBER_UPDATE_TEAMS,
            {"team": team_id, "workspace": workspace_id, "now": utcnow()},
        )
    else:
        result = await db.execute(
            ALLOCATE_ISSUE_NUMBER_UPDATE_WORKSPACES,
            {"workspace": workspace_id},
        )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, "Issue destination not found.", "Not Found")
    sequence = dict(row)
    # Team issues always have a hyphen-number suffix; the workspace namespace cannot collide.
    sequence["issue_identifier"] = (
        f"{row['identifier']}-{row['issue_sequence']}"
        if team_id
        else f"WS_{row['issue_sequence']}"
    )
    return sequence
