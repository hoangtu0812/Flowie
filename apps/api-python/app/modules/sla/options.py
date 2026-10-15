from sqlalchemy import text

from ..access.projects import _workspace_manager, _team_access


async def policy_options(db, workspace, user, team):
    await _workspace_manager(db, workspace, user["id"])
    if team:
        await _team_access(db, workspace, team, user["id"])
    params = {"workspace": workspace, "team": team}
    statuses = (
        (
            await db.execute(
                text(
                    "SELECT id,name FROM issue_statuses WHERE workspace_id=:workspace AND (team_id IS NULL OR team_id=:team) AND category NOT IN ('COMPLETED','CANCELED') ORDER BY position,name,id"
                ),
                params,
            )
        )
        .mappings()
        .all()
    )
    members = (
        (
            await db.execute(
                text("""SELECT u.id,u.name FROM workspace_members wm JOIN users u ON u.id=wm.user_id
        WHERE wm.workspace_id=:workspace AND wm.status='ACTIVE' AND u.status='ACTIVE'
        AND (CAST(:team AS text) IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=:team AND tm.user_id=u.id)) ORDER BY u.name,u.id"""),
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
