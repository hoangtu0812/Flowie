from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import text

from ...db.session import get_session
from ...domains.auth import current_user
from ..access.membership import _workspace_role
from . import connections
from .contracts import ConnectionInput
from .domain import ALL_SCOPES
from .domain import Principal
from .policy import AccessPolicy

router = APIRouter(prefix="/api/v1/mcp", tags=["mcp-connections"])


@router.get("/resources")
async def resources(
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _workspace_role(db, workspaceId, user["id"])
    policy = AccessPolicy(db, Principal("", workspaceId, user, frozenset(), (), ()))
    teams = (
        await db.execute(
            text(f"""SELECT t.id,t.name FROM teams t WHERE t.workspace_id=:workspace
        AND t.archived_at IS NULL AND {policy.team_clause("t.id")} ORDER BY t.name,t.id LIMIT 201"""),
            policy.params,
        )
    ).mappings()
    projects = (
        await db.execute(
            text(f"""SELECT p.id,p.name,p.team_id AS "teamId" FROM projects p
        WHERE p.workspace_id=:workspace AND p.archived_at IS NULL AND {policy.team_clause("p.team_id", shared=True)}
        ORDER BY p.name,p.id LIMIT 201"""),
            policy.params,
        )
    ).mappings()
    team_rows, project_rows = (
        [dict(row) for row in teams],
        [dict(row) for row in projects],
    )
    labels = (
        await db.execute(
            text(
                "SELECT id,name FROM labels WHERE workspace_id=:workspace ORDER BY name,id LIMIT 201"
            ),
            policy.params,
        )
    ).mappings()
    label_rows = [dict(row) for row in labels]
    return {
        "data": {
            "teams": team_rows[:200],
            "projects": project_rows[:200],
            "labels": label_rows[:200],
            "truncated": len(team_rows) > 200
            or len(project_rows) > 200
            or len(label_rows) > 200,
        }
    }


@router.get("/configuration")
async def configuration(request: Request, user=Depends(current_user)):
    settings = request.app.state.settings
    return {
        "data": {
            "enabled": settings.mcp_enabled,
            "writesEnabled": settings.mcp_writes_enabled,
            "endpointPath": "/mcp/",
            "authentication": "scoped-token",
            "scopes": sorted(ALL_SCOPES),
        }
    }


@router.get("/connections")
async def list_connections(
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    return {"data": await connections.list_connections(db, workspaceId, user)}


@router.post("/connections", status_code=201)
async def create_connection(
    payload: ConnectionInput,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    return {"data": await connections.create(db, workspaceId, user, payload)}


@router.delete("/connections/{connection_id}")
async def revoke_connection(
    connection_id: str,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await connections.revoke(db, workspaceId, user, connection_id)
    return {"data": {"id": connection_id, "revoked": True}}


@router.get("/audit")
async def connection_audit(
    workspaceId: str = Query(min_length=1),
    limit: int = Query(default=50, ge=1, le=100),
    user=Depends(current_user),
    db=Depends(get_session),
):
    role = await _workspace_role(db, workspaceId, user["id"])
    rows = (
        await db.execute(
            text("""SELECT id,action,entity_id AS "entityId",metadata,created_at AS "createdAt"
        FROM audit_logs WHERE workspace_id=:workspace AND action LIKE 'mcp.%'
        AND (:manager OR actor_id=:user) ORDER BY created_at DESC,id DESC LIMIT :limit"""),
            {
                "workspace": workspaceId,
                "manager": role in {"OWNER", "ADMIN"},
                "user": user["id"],
                "limit": limit,
            },
        )
    ).mappings()
    return {"data": [dict(row) for row in rows]}
