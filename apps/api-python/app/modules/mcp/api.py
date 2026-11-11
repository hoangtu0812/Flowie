from __future__ import annotations

from typing import Literal

from fastapi import Depends, Query, Request

from ...core.clock import utcnow
from ...core.pagination import CursorCodec
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.membership import workspace_role
from ..identity.auth import current_user
from . import connections, instructions
from .contracts import ConnectionInput, ConnectionUpdateInput, InstructionsInput
from .domain import ALL_SCOPES, Principal
from .policy import AccessPolicy
from .queries import (
    RESOURCES_SELECT_LABELS,
    connection_audit_errors_sql,
    connection_audit_select_audit_logs_sql,
    connection_audit_summary_connections_sql,
    connection_audit_summary_tools_sql,
    connection_audit_summary_totals_sql,
    resources_select_projects_sql,
    resources_select_teams_sql,
)

router = APIRouter(prefix="/api/v1/mcp", tags=["mcp-connections"])


@router.get("/resources")
async def resources(
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await workspace_role(db, workspaceId, user["id"])
    policy = AccessPolicy(db, Principal("", workspaceId, user, frozenset(), (), ()))
    teams = (
        await db.execute(
            resources_select_teams_sql(policy),
            policy.params,
        )
    ).mappings()
    projects = (
        await db.execute(
            resources_select_projects_sql(policy),
            policy.params,
        )
    ).mappings()
    team_rows, project_rows = (
        [dict(row) for row in teams],
        [dict(row) for row in projects],
    )
    labels = (
        await db.execute(
            RESOURCES_SELECT_LABELS,
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
    role = await workspace_role(db, workspace_id, user["id"])
    return {
        "workspace": workspace_id,
        "manager": role in {"OWNER", "ADMIN"},
        "user": user["id"],
        "span": AUDIT_WINDOWS.get(window),
        "now": utcnow(),
    }


@router.get("/audit")
async def connection_audit(
    request: Request,
    workspaceId: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=1000),
    connectionId: str | None = Query(default=None, min_length=1, max_length=100),
    outcome: Literal["succeeded", "failed", "denied"] | None = None,
    tool: str | None = Query(default=None, min_length=1, max_length=100),
    statusCode: int | None = Query(default=None, ge=100, le=599),
    message: str | None = Query(default=None, min_length=1, max_length=1000),
    window: AuditWindow | None = None,
    user=Depends(current_user),
    db=Depends(get_session),
):
    # Each outcome matches only its own calls, so the counts on the MCP logs tiles equal the
    # filtered log. `statusCode` and `message` (normalized like Top errors) select one group.
    # VI: Mỗi outcome chỉ khớp lời gọi của chính nó, để số trên các ô MCP logs bằng log đã
    # VI: lọc. `statusCode` và `message` (chuẩn hoá như Top errors) chọn một nhóm lỗi.
    codec = CursorCodec(
        request.app.state.settings.auth_jwt_secret,
        user["id"],
        "mcp-audit",
        {
            "workspace": workspaceId,
            "connection": connectionId,
            "outcome": outcome,
            "tool": tool,
            "statusCode": statusCode,
            "message": message,
            "window": window,
        },
    )
    params = {
        **await _audit_params(db, workspaceId, user, window),
        "connection": connectionId,
        "outcome": outcome,
        "tool": tool,
        "status": statusCode,
        "message": message,
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
                connection_audit_select_audit_logs_sql(AUDIT_CONNECTION, AUDIT_SCOPE, page),
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
        return [dict(row) for row in (await db.execute(sql, params)).mappings()]

    totals = (await rows(connection_audit_summary_totals_sql(counts, p95, scope)))[0]
    tools = await rows(
        connection_audit_summary_tools_sql(counts, p95, scope)
    )
    by_connection = await rows(
        connection_audit_summary_connections_sql(counts, scope)
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


@router.get("/audit/errors")
async def connection_audit_errors(
    workspaceId: str = Query(min_length=1),
    window: AuditWindow = "24h",
    user=Depends(current_user),
    db=Depends(get_session),
):
    """Top errors of MCP logs: failed and denied tool calls grouped by tool, HTTP status,
    outcome and normalized message (`AUDIT_MESSAGE`), most frequent first, at most 20
    groups, in the same scope as the log list. `message` of a group is the value the log
    list accepts as its `message` filter.
    VI: Top errors của MCP logs: lời gọi tool failed và denied gom theo tool, mã HTTP, kết
    VI: quả và thông báo đã chuẩn hoá (`AUDIT_MESSAGE`), nhiều nhất trước, tối đa 20 nhóm,
    VI: cùng phạm vi với danh sách log. `message` của nhóm là giá trị bộ lọc `message` của
    VI: danh sách log nhận."""
    params = await _audit_params(db, workspaceId, user, window)
    scope = f"FROM audit_logs a WHERE {AUDIT_SCOPE} AND a.entity_type='mcp-tool'"
    rows = (await db.execute(connection_audit_errors_sql(scope), params)).mappings()
    return {"data": {"window": window, "groups": [dict(row) for row in rows]}}
