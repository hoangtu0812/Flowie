from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError


async def allocate_issue_number(db, workspace_id: str, team_id: str | None):
    if team_id:
        result = await db.execute(
            text("""UPDATE teams SET issue_sequence=issue_sequence+1, updated_at=:now
                WHERE id=:team AND workspace_id=:workspace AND archived_at IS NULL
                RETURNING id, identifier, issue_sequence"""),
            {"team": team_id, "workspace": workspace_id, "now": _utcnow()},
        )
    else:
        result = await db.execute(
            text("""UPDATE workspaces SET issue_sequence=issue_sequence+1
                WHERE id=:workspace RETURNING NULL::text AS id,
                NULL::text AS identifier, issue_sequence"""),
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
