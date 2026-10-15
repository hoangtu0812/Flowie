import re

from sqlalchemy import text

from ...core.errors import ApiError
from ...core.pagination import CursorCodec
from ..access.projects import _workspace_manager
from ..access.project_scope import project_read_scope


EVENTS = """WITH events AS (
    SELECT 'audit:'||id AS id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at FROM audit_logs
    UNION ALL
    SELECT 'activity:'||id,workspace_id,actor_id,type,
        CASE WHEN issue_id IS NOT NULL THEN 'issue' ELSE 'project' END,
        COALESCE(issue_id,project_id),data,created_at FROM activities
    WHERE issue_id IS NOT NULL OR project_id IS NOT NULL
), attributed AS (
    SELECT *,CASE WHEN entity_type='mcp-tool' THEN 'AI'
        WHEN upper(metadata->>'source') IN ('WEB','AI','SYSTEM') THEN upper(metadata->>'source')
        WHEN actor_id IS NULL THEN 'SYSTEM' ELSE 'UNKNOWN' END AS source FROM events
) """


def visible_entities():
    project = project_read_scope(include_archived=True, include_archived_teams=True)
    team = """EXISTS(SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id
        WHERE tm.user_id=:user AND t.id=i.team_id AND t.workspace_id=:workspace)"""
    issue = f"EXISTS(SELECT 1 FROM issues i WHERE i.id=ev.entity_id AND i.workspace_id=:workspace AND {team})"
    document = """EXISTS(SELECT 1 FROM documents d WHERE d.id=ev.entity_id AND d.workspace_id=:workspace AND
        (d.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=d.team_id AND tm.user_id=:user)))"""
    project_exists = (
        f"EXISTS(SELECT 1 FROM projects p WHERE p.id=ev.entity_id AND {project})"
    )
    initiative = "EXISTS(SELECT 1 FROM initiatives n WHERE n.id=ev.entity_id AND n.workspace_id=:workspace)"
    comment = f"""EXISTS(SELECT 1 FROM comments c JOIN issues i ON i.id=c.issue_id WHERE c.id=ev.entity_id
        AND i.workspace_id=:workspace AND {team})"""
    agent = f"""(EXISTS(SELECT 1 FROM agent_runs r JOIN issues i ON i.id=r.issue_id WHERE r.id=ev.entity_id AND r.workspace_id=:workspace AND {team})
        OR EXISTS(SELECT 1 FROM project_repositories r JOIN projects p ON p.id=r.project_id WHERE r.id=ev.entity_id AND {project})
        OR EXISTS(SELECT 1 FROM agent_automations r JOIN projects p ON p.id=r.project_id WHERE r.id=ev.entity_id AND {project}))"""
    # Unknown or removed entity scopes are excluded when current access cannot be established.
    return f"""(
        (ev.entity_type='issue' AND {issue}) OR (ev.entity_type='project' AND {project_exists})
        OR (ev.entity_type='document' AND {document}) OR (ev.entity_type='initiative' AND {initiative})
        OR (ev.entity_type='comment' AND {comment})
        OR (ev.entity_type='issue-status' AND EXISTS(SELECT 1 FROM issue_statuses s WHERE s.id=ev.entity_id AND s.workspace_id=:workspace
            AND (s.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=s.team_id AND tm.user_id=:user))))
        OR (ev.entity_type='issue-status' AND (ev.metadata->>'scope'='WORKSPACE' OR
            (ev.metadata->>'scope'='TEAM' AND EXISTS(SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id
            WHERE t.id=ev.metadata->>'teamId' AND t.workspace_id=:workspace AND tm.user_id=:user))))
        OR (ev.entity_type='mcp-tool' AND (ev.entity_id IS NULL OR {issue} OR {project_exists} OR {document} OR {comment} OR {agent}))
        OR (ev.entity_type='agent-run-management' AND {agent})
        OR (ev.entity_type='recurring-schedule' AND EXISTS(SELECT 1 FROM recurring_schedules rs JOIN teams t ON t.id=rs.team_id JOIN team_members tm ON tm.team_id=t.id WHERE rs.id=ev.entity_id AND rs.workspace_id=:workspace AND tm.user_id=:user))
        OR (ev.entity_type='sla-policy' AND EXISTS(SELECT 1 FROM sla_policies sp WHERE sp.id=ev.entity_id AND sp.workspace_id=:workspace AND
            (sp.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=sp.team_id AND tm.user_id=:user))))
        OR (ev.entity_type IN ('workspace','workspace-member','invitation','label','project-label','project-status','release','mcp-connection','ai-budget'))
    ) AND (ev.entity_type<>'initiative' OR NOT(ev.metadata ? 'projectId') OR
        EXISTS(SELECT 1 FROM projects p WHERE p.id=ev.metadata->>'projectId' AND {project}))"""


def query_scope(workspace, user, filters):
    params = {"workspace": workspace, "user": user}
    clauses = ["ev.workspace_id=:workspace", visible_entities()]
    for field, column in [
        ("actorId", "actor_id"),
        ("entityType", "entity_type"),
        ("source", "source"),
    ]:
        value = getattr(filters, field)
        if value:
            clauses.append(f"ev.{column}=:{field}")
            params[field] = value
    if filters.since:
        clauses.append("ev.created_at>=:since")
        params["since"] = filters.since
    if filters.until:
        clauses.append("ev.created_at<:until")
        params["until"] = filters.until
    return " AND ".join(clauses), params


def present(row):
    raw = row["metadata"] if isinstance(row["metadata"], dict) else {}
    metadata = {}
    for key in ["tool", "outcome"]:
        value = raw.get(key)
        if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}", value):
            metadata[key] = value
    fields = raw.get("fields")
    if isinstance(fields, list):
        metadata["fields"] = [
            value
            for value in fields[:30]
            if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_]{1,50}", value)
        ]
    return {
        "id": row["id"],
        "action": row["action"],
        "entityType": row["entity_type"],
        "entityId": row["entity_id"],
        "source": row["source"],
        "createdAt": row["created_at"],
        "actor": {"id": row["actor_id"], "name": row["actor_name"]}
        if row["actor_id"]
        else None,
        "metadata": metadata,
    }


async def audit_page(
    db, workspace, user, secret, filters, *, limit=50, cursor=None, export=False
):
    await _workspace_manager(db, workspace, user)
    predicate, params = query_scope(workspace, user, filters)
    codec = CursorCodec(
        secret,
        user,
        "workspace-audit",
        {"workspace": workspace, **filters.model_dump(mode="json")},
    )
    total = (
        await db.execute(
            text(EVENTS + "SELECT COUNT(*) FROM attributed ev WHERE " + predicate),
            params,
        )
    ).scalar_one()
    if export and total > 10000:
        raise ApiError(
            400, "Narrow the filters to at most 10000 audit events.", "Bad Request"
        )
    if cursor:
        params["time"], params["after"] = codec.decode(cursor)
        predicate += " AND (ev.created_at,ev.id)<(:time,:after)"
    params["limit"] = 10001 if export else limit + 1
    rows = (
        (
            await db.execute(
                text(
                    EVENTS
                    + """SELECT ev.*,u.name AS actor_name FROM attributed ev LEFT JOIN users u ON u.id=ev.actor_id
        WHERE """
                    + predicate
                    + " ORDER BY ev.created_at DESC,ev.id DESC LIMIT :limit"
                ),
                params,
            )
        )
        .mappings()
        .all()
    )
    if export and len(rows) > 10000:
        raise ApiError(
            400, "Narrow the filters to at most 10000 audit events.", "Bad Request"
        )
    page = rows if export else rows[:limit]
    return {
        "data": [present(row) for row in page],
        "meta": {
            "total": total,
            "limit": len(page) if export else limit,
            "nextCursor": codec.encode(page[-1]["created_at"], page[-1]["id"])
            if not export and len(rows) > limit
            else None,
        },
    }
