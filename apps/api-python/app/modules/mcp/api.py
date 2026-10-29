from __future__ import annotations

from typing import Literal

from fastapi import Depends, Query, Request
from ...core.utc_responses import UtcAPIRouter as APIRouter
from sqlalchemy import text

from ...core.pagination import CursorCodec
from ...db.session import get_session
from ...domains.auth import current_user
from ..access.membership import _workspace_role
from . import connections
from .contracts import ConnectionInput, ConnectionUpdateInput
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


@router.patch("/connections/{connection_id}")
async def update_connection(
    connection_id: str,
    payload: ConnectionUpdateInput,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    return {
        "data": await connections.update(db, workspaceId, user, connection_id, payload)
    }


@router.delete("/connections/{connection_id}")
async def revoke_connection(
    connection_id: str,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await connections.revoke(db, workspaceId, user, connection_id)
    return {"data": {"id": connection_id, "revoked": True}}


# Tool events carry the connection in metadata; create/update/revoke events name it
# as the audited entity. Both resolve to one connection id for filtering and naming.
# VI: Sự kiện tool lưu kết nối trong metadata; sự kiện tạo/sửa/thu hồi lưu nó làm
# VI: thực thể được audit. Cả hai quy về một id kết nối để lọc và lấy tên.
AUDIT_CONNECTION = (
    "COALESCE(a.metadata->>'connectionId',"
    "CASE WHEN a.entity_type='mcp-connection' THEN a.entity_id END)"
)


@router.get("/audit")
async def connection_audit(
    request: Request,
    workspaceId: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=1000),
    connectionId: str | None = Query(default=None, min_length=1, max_length=100),
    outcome: Literal["succeeded", "failed"] | None = None,
    user=Depends(current_user),
    db=Depends(get_session),
):
    role = await _workspace_role(db, workspaceId, user["id"])
    # "failed" also covers denied calls so every unsuccessful call is in one view.
    # VI: "failed" gồm cả lời gọi bị từ chối để mọi lời gọi không thành công nằm chung một chỗ.
    codec = CursorCodec(
        request.app.state.settings.auth_jwt_secret,
        user["id"],
        "mcp-audit",
        {"workspace": workspaceId, "connection": connectionId, "outcome": outcome},
    )
    params = {
        "workspace": workspaceId,
        "manager": role in {"OWNER", "ADMIN"},
        "user": user["id"],
        "connection": connectionId,
        "outcome": outcome,
        "limit": limit + 1,
    }
    page = ""
    if cursor:
        params["after"], params["after_id"] = codec.decode(cursor)
        page = "AND (a.created_at,a.id)<(:after,:after_id)"
    rows = [
        dict(row)
        for row in (
            await db.execute(
                text(f"""SELECT a.id,a.action,a.entity_id AS "entityId",a.metadata,a.created_at AS "createdAt",
        {AUDIT_CONNECTION} AS "connectionId",c.name AS "connectionName"
        FROM audit_logs a LEFT JOIN mcp_connections c ON c.id={AUDIT_CONNECTION} AND c.workspace_id=a.workspace_id
        WHERE a.workspace_id=:workspace AND a.action LIKE 'mcp.%'
        AND (:manager OR a.actor_id=:user)
        AND (CAST(:connection AS text) IS NULL OR {AUDIT_CONNECTION}=:connection)
        AND (CAST(:outcome AS text) IS NULL
            OR (:outcome='succeeded' AND a.action LIKE '%.succeeded')
            OR (:outcome='failed' AND (a.action LIKE '%.failed' OR a.action LIKE '%.denied')))
        {page} ORDER BY a.created_at DESC,a.id DESC LIMIT :limit"""),
                params,
            )
        ).mappings()
    ]
    items = rows[:limit]
    return {
        "data": {
            "items": items,
            "nextCursor": codec.encode(items[-1]["createdAt"], items[-1]["id"])
            if len(rows) > limit
            else None,
        }
    }
