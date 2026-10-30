from __future__ import annotations

from typing import Literal

from fastapi import Depends, Query, Request
from ...core.utc_responses import UtcAPIRouter as APIRouter
from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.pagination import CursorCodec
from ...db.session import get_session
from ...domains.auth import current_user
from ..access.membership import _workspace_role
from . import connections, instructions
from .contracts import ConnectionInput, ConnectionUpdateInput, InstructionsInput
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


@router.get("/instructions")
async def read_instructions(
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    return {"data": await instructions.read(db, workspaceId, user)}


@router.put("/instructions")
async def save_instructions(
    payload: InstructionsInput,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    return {"data": await instructions.save(db, workspaceId, user, payload.workflow)}


# Tool events carry the connection in metadata; create/update/revoke events name it
# as the audited entity. Both resolve to one connection id for filtering and naming.
# VI: Sự kiện tool lưu kết nối trong metadata; sự kiện tạo/sửa/thu hồi lưu nó làm
# VI: thực thể được audit. Cả hai quy về một id kết nối để lọc và lấy tên.
AUDIT_CONNECTION = (
    "COALESCE(a.metadata->>'connectionId',"
    "CASE WHEN a.entity_type='mcp-connection' THEN a.entity_id END)"
)


# Time windows offered by MCP logs; values are trusted literals bound as SQL intervals.
# VI: Các khoảng thời gian của MCP logs; giá trị là hằng tin cậy, truyền vào SQL dạng interval.
AUDIT_WINDOWS = {"24h": "24 hours", "7d": "7 days", "30d": "30 days"}
AuditWindow = Literal["24h", "7d", "30d"]

# Workspace and visibility shared by the log list and its summary: administrators read
# every connection's events, members only the events they caused as connection owner.
# VI: Workspace và phạm vi dùng chung cho danh sách log và phần tổng hợp: quản trị viên đọc
# VI: sự kiện của mọi kết nối, thành viên chỉ đọc sự kiện họ gây ra với tư cách chủ kết nối.
AUDIT_SCOPE = """a.workspace_id=:workspace AND a.action LIKE 'mcp.%'
        AND (:manager OR a.actor_id=:user)
        AND (CAST(:span AS text) IS NULL OR a.created_at>CAST(:now AS timestamp)-CAST(:span AS interval))"""


async def _audit_params(db, workspace_id, user, window):
    role = await _workspace_role(db, workspace_id, user["id"])
    return {
        "workspace": workspace_id,
        "manager": role in {"OWNER", "ADMIN"},
        "user": user["id"],
        "span": AUDIT_WINDOWS.get(window),
        "now": _utcnow(),
    }


@router.get("/audit")
async def connection_audit(
    request: Request,
    workspaceId: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=1000),
    connectionId: str | None = Query(default=None, min_length=1, max_length=100),
    outcome: Literal["succeeded", "failed"] | None = None,
    tool: str | None = Query(default=None, min_length=1, max_length=100),
    window: AuditWindow | None = None,
    user=Depends(current_user),
    db=Depends(get_session),
):
    # "failed" also covers denied calls so every unsuccessful call is in one view.
    # VI: "failed" gồm cả lời gọi bị từ chối để mọi lời gọi không thành công nằm chung một chỗ.
    codec = CursorCodec(
        request.app.state.settings.auth_jwt_secret,
        user["id"],
        "mcp-audit",
        {
            "workspace": workspaceId,
            "connection": connectionId,
            "outcome": outcome,
            "tool": tool,
            "window": window,
        },
    )
    params = {
        **await _audit_params(db, workspaceId, user, window),
        "connection": connectionId,
        "outcome": outcome,
        "tool": tool,
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
        {AUDIT_CONNECTION} AS "connectionId",c.name AS "connectionName",u.name AS "actorName"
        FROM audit_logs a LEFT JOIN mcp_connections c ON c.id={AUDIT_CONNECTION} AND c.workspace_id=a.workspace_id
        LEFT JOIN users u ON u.id=a.actor_id
        WHERE {AUDIT_SCOPE}
        AND (CAST(:connection AS text) IS NULL OR {AUDIT_CONNECTION}=:connection)
        AND (CAST(:tool AS text) IS NULL OR a.metadata->>'tool'=:tool)
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


@router.get("/audit/summary")
async def connection_audit_summary(
    workspaceId: str = Query(min_length=1),
    window: AuditWindow = "24h",
    user=Depends(current_user),
    db=Depends(get_session),
):
    """Tool-call counts for the MCP logs dashboard, in the same scope as the log list.
    Configuration events are not tool calls and are left out.
    VI: Số liệu lời gọi tool cho dashboard MCP logs, cùng phạm vi với danh sách log. Sự kiện
    VI: cấu hình không phải lời gọi tool nên không được tính."""
    params = await _audit_params(db, workspaceId, user, window)
    counts = """count(*)::int AS calls,
        count(*) FILTER(WHERE a.metadata->>'outcome'='failed')::int AS failed,
        count(*) FILTER(WHERE a.metadata->>'outcome'='denied')::int AS denied"""
    p95 = 'percentile_cont(0.95) WITHIN GROUP(ORDER BY (a.metadata->>\'durationMs\')::int) AS "p95Ms"'
    scope = f"FROM audit_logs a WHERE {AUDIT_SCOPE} AND a.entity_type='mcp-tool'"

    async def rows(sql):
        return [dict(row) for row in (await db.execute(text(sql), params)).mappings()]

    totals = (await rows(f"SELECT {counts},{p95} {scope}"))[0]
    tools = await rows(
        f"""SELECT a.metadata->>'tool' AS tool,{counts},{p95} {scope}
        GROUP BY a.metadata->>'tool' ORDER BY count(*) DESC,1 LIMIT 100"""
    )
    by_connection = await rows(
        f"""SELECT s.*,c.name AS "connectionName",u.name AS "ownerName" FROM (
        SELECT a.metadata->>'connectionId' AS "connectionId",max(a.actor_id) AS actor,{counts},
        max(a.created_at) AS "lastCallAt" {scope} GROUP BY a.metadata->>'connectionId') s
        LEFT JOIN mcp_connections c ON c.id=s."connectionId" AND c.workspace_id=:workspace
        LEFT JOIN users u ON u.id=COALESCE(c.user_id,s.actor)
        ORDER BY s.calls DESC,s."connectionId" LIMIT 100"""
    )
    for row in by_connection:
        row.pop("actor", None)
    return {
        "data": {
            "window": window,
            "totals": totals,
            "tools": tools,
            "connections": by_connection,
        }
    }
