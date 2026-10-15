"""Shared visibility predicate for project reads before hydration or aggregation."""

import re


def project_read_scope(alias="p", *, workspace="workspace", user="user") -> str:
    for identifier in (alias, workspace, user):
        if not re.fullmatch(r"[a-z_][a-z0-9_]*", identifier):
            raise ValueError("SQL scope identifiers must be static identifiers")
    return f"""{alias}.workspace_id=:{workspace} AND {alias}.archived_at IS NULL
        AND EXISTS (SELECT 1 FROM workspace_members scope_wm
            WHERE scope_wm.workspace_id=:{workspace} AND scope_wm.user_id=:{user}
            AND scope_wm.status='ACTIVE')
        AND ({alias}.team_id IS NULL OR EXISTS (
            SELECT 1 FROM teams scope_t JOIN team_members scope_tm ON scope_tm.team_id=scope_t.id
            WHERE scope_t.id={alias}.team_id AND scope_t.workspace_id=:{workspace}
            AND scope_t.archived_at IS NULL AND scope_tm.user_id=:{user}))"""
