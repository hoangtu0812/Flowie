"""Shared visibility predicate for project reads before hydration or aggregation."""

from .team_scope import workspace_team_scope


def project_read_scope(
    alias="p",
    *,
    workspace="workspace",
    user="user",
    include_archived=False,
    include_archived_teams=False,
) -> str:
    return workspace_team_scope(
        alias,
        workspace=workspace,
        user=user,
        include_archived=include_archived,
        include_archived_teams=include_archived_teams,
    )
