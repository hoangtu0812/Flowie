import re

from sqlalchemy import text


def notification_scope(alias="n", *, actor=None):
    actor = actor or f"{alias}.user_id"
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", alias) or not (
        actor == f"{alias}.user_id" or re.fullmatch(r":[a-z_][a-z0-9_]*", actor)
    ):
        raise ValueError("Notification scope identifiers must be static")

    def team(entity, nullable=False):
        member = f"""EXISTS(SELECT 1 FROM teams scope_team JOIN team_members scope_member ON scope_member.team_id=scope_team.id
            WHERE scope_team.id={entity}.team_id AND scope_team.workspace_id={alias}.workspace_id
            AND scope_team.archived_at IS NULL AND scope_member.user_id={actor})"""
        return f"({entity}.team_id IS NULL OR {member})" if nullable else member

    project = f"p.workspace_id={alias}.workspace_id AND p.archived_at IS NULL AND {team('p', True)}"
    issue = (
        f"i.workspace_id={alias}.workspace_id AND i.archived_at IS NULL AND {team('i', True)}"
    )
    return f"""EXISTS(SELECT 1 FROM workspace_members scope_wm JOIN users scope_user ON scope_user.id=scope_wm.user_id
        WHERE scope_wm.workspace_id={alias}.workspace_id AND scope_wm.user_id={actor} AND scope_wm.status='ACTIVE' AND scope_user.status='ACTIVE')
        AND (
            ({alias}.entity_type='issue' AND EXISTS(SELECT 1 FROM issues i WHERE i.id={alias}.entity_id AND {issue}))
            OR ({alias}.entity_type='project' AND EXISTS(SELECT 1 FROM projects p WHERE p.id={alias}.entity_id AND {project}))
            OR ({alias}.entity_type='project-update' AND EXISTS(SELECT 1 FROM project_updates pu JOIN projects p ON p.id=pu.project_id WHERE pu.id={alias}.entity_id AND {project}))
            OR ({alias}.entity_type='comment' AND EXISTS(SELECT 1 FROM comments c JOIN issues i ON i.id=c.issue_id WHERE c.id={alias}.entity_id AND c.deleted_at IS NULL AND {issue}))
            OR ({alias}.entity_type='document' AND EXISTS(SELECT 1 FROM documents d WHERE d.id={alias}.entity_id AND d.workspace_id={alias}.workspace_id AND d.archived_at IS NULL AND {team("d", True)}))
            OR ({alias}.entity_type='review' AND EXISTS(SELECT 1 FROM code_reviews review JOIN scm_repositories repository ON repository.id=review.repository_id
                WHERE review.id={alias}.entity_id AND review.workspace_id={alias}.workspace_id AND repository.enabled=true AND repository.archived_at IS NULL
                AND (EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id={alias}.workspace_id AND wm.user_id={actor} AND wm.status='ACTIVE' AND wm.role IN ('OWNER','ADMIN'))
                    OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=repository.team_id AND tm.user_id={actor}))))
            OR ({alias}.entity_type='workspace' AND {alias}.entity_id={alias}.workspace_id)
        )"""


async def readable_recipients(db, workspace, entity_type, entity_id, recipients):
    candidates = list(set(recipients))
    if not candidates:
        return set()
    rows = await db.execute(
        text(
            """WITH n AS (SELECT CAST(:workspace AS text) AS workspace_id,CAST(:entity_type AS text) AS entity_type,CAST(:entity_id AS text) AS entity_id,unnest(CAST(:users AS text[])) AS user_id)
        SELECT n.user_id FROM n WHERE """
            + notification_scope()
        ),
        {
            "workspace": workspace,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "users": candidates,
        },
    )
    return set(rows.scalars().all())


async def readable_records(db, records):
    valid = [
        row
        for row in records
        if isinstance(row, dict) and isinstance(row.get("id"), str)
    ]
    allowed = set()
    for start in range(0, len(valid), 500):
        rows = (
            await db.execute(
                text(
                    "SELECT n.id,n.workspace_id,n.user_id FROM notifications n WHERE n.id=ANY(CAST(:ids AS text[])) AND "
                    + notification_scope()
                ),
                {"ids": [row["id"] for row in valid[start : start + 500]]},
            )
        ).all()
        allowed.update(rows)
    return [
        row
        for row in valid
        if (row["id"], row.get("workspaceId"), row.get("userId")) in allowed
    ]
