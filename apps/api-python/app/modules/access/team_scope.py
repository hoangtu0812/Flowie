import re


def workspace_team_scope(
    alias,
    *,
    workspace="workspace",
    user="user",
    include_archived=False,
    include_archived_teams=False,
):
    for identifier in (alias, workspace, user):
        if not re.fullmatch(r"[a-z_][a-z0-9_]*", identifier):
            raise ValueError("SQL scope identifiers must be static identifiers")
    entity_state = "" if include_archived else f" AND {alias}.archived_at IS NULL"
    team_state = "" if include_archived_teams else " AND scope_t.archived_at IS NULL"
    return f"""{alias}.workspace_id=:{workspace} {entity_state}
        AND EXISTS(SELECT 1 FROM workspace_members scope_wm WHERE scope_wm.workspace_id=:{workspace}
            AND scope_wm.user_id=:{user} AND scope_wm.status='ACTIVE')
        AND ({alias}.team_id IS NULL OR EXISTS(SELECT 1 FROM teams scope_t JOIN team_members scope_tm ON scope_tm.team_id=scope_t.id
            WHERE scope_t.id={alias}.team_id AND scope_t.workspace_id=:{workspace} {team_state} AND scope_tm.user_id=:{user}))"""
