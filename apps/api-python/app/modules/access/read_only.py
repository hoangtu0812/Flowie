"""Read-only workspace administrators (ADMIN_VIEWER, DTD-190).

An ADMIN_VIEWER reads what a workspace admin reads, so the admin read checks accept the role,
and is stopped here from every write: one app-wide dependency refuses any mutating request
(POST, PUT, PATCH, DELETE) aimed at a workspace where the caller is ADMIN_VIEWER. Writes are
blocked in one place rather than in each handler, so a new endpoint cannot forget the rule. MCP
tool calls do not use the session cookie and are checked separately in the MCP application.
VI: Quản trị workspace chỉ đọc (ADMIN_VIEWER, DTD-190). ADMIN_VIEWER đọc được những gì admin
workspace đọc được, nên các kiểm tra quyền đọc của admin chấp nhận role này; mọi thao tác ghi bị
chặn tại đây: một dependency áp dụng toàn app từ chối mọi request thay đổi dữ liệu (POST, PUT,
PATCH, DELETE) nhắm vào workspace mà người gọi là ADMIN_VIEWER. Chặn ghi ở một chỗ thay vì từng
handler, nên endpoint mới không thể quên quy tắc. Lời gọi tool MCP không dùng cookie phiên và được
kiểm tra riêng trong MCP application.
"""

from __future__ import annotations

import json
import re

from fastapi import Request
from sqlalchemy import text
from starlette.requests import HTTPConnection

from ...core.errors import ApiError

READ_ONLY_ROLE = "ADMIN_VIEWER"
# Roles that may read admin-only pages and data. VI: Các role đọc được trang và dữ liệu chỉ dành cho admin.
ADMIN_READ_ROLES = frozenset({"OWNER", "ADMIN", READ_ONLY_ROLE})
WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# The caller's own account, sign-in and inbox are personal, not workspace data, and joining,
# creating or leaving a workspace changes only the caller's membership.
# VI: Tài khoản, đăng nhập và hộp thư của chính người gọi là dữ liệu cá nhân, không phải dữ liệu
# VI: workspace; nhận lời mời, tạo hay rời workspace chỉ đổi membership của chính người gọi.
PERSONAL_PATHS = re.compile(
    r"^/api/v1/(auth(/|$)|users/me(/|$)|notifications(/|$)|workspaces/?$|workspaces/invitations/|workspaces/[^/]+/leave$)"
)
WORKSPACE_PATH = re.compile(r"^/api/v1/workspaces/([^/]+)")


async def _target_workspace(request: Request) -> str | None:
    """The workspace a write is aimed at: `workspaceId` in the query, the /workspaces/{id} path,
    or `workspaceId` in a JSON body; None when it cannot be told.
    VI: Workspace mà thao tác ghi nhắm tới: `workspaceId` trên query, path /workspaces/{id}, hoặc
    VI: `workspaceId` trong body JSON; None khi không xác định được.
    """
    if workspace := request.query_params.get("workspaceId"):
        return workspace
    if match := WORKSPACE_PATH.match(request.url.path):
        return match.group(1)
    if "json" in request.headers.get("content-type", ""):
        try:
            body = json.loads(await request.body() or b"null")
        except ValueError:
            return None
        if isinstance(body, dict) and isinstance(body.get("workspaceId"), str):
            return body["workspaceId"]
    return None


async def enforce_read_only_role(connection: HTTPConnection) -> None:
    """Refuses writes by ADMIN_VIEWER members (403). A request whose workspace cannot be told is
    refused when the caller is ADMIN_VIEWER anywhere, so an unknown route fails closed. Requests
    without a valid session are left to the route's own authentication.

    It runs for every route, WebSockets included, so it takes the connection rather than a
    Request and returns at once for anything but an HTTP write. It opens its own short session
    only when it must look up roles, never holding a database connection for a stream.
    VI: Từ chối thao tác ghi của thành viên ADMIN_VIEWER (403). Request không xác định được
    VI: workspace bị từ chối khi người gọi là ADMIN_VIEWER ở bất kỳ workspace nào, nên route lạ bị
    VI: chặn theo hướng an toàn. Request không có phiên hợp lệ để route tự xác thực.
    VI: Dependency chạy cho mọi route, kể cả WebSocket, nên nhận connection thay vì Request và trả
    VI: về ngay với mọi thứ không phải thao tác ghi qua HTTP. Chỉ mở session ngắn của riêng nó khi
    VI: cần tra role, không bao giờ giữ kết nối database suốt một luồng stream.
    """
    if not isinstance(connection, Request):
        return
    request = connection
    if request.method not in WRITE_METHODS or PERSONAL_PATHS.match(request.url.path):
        return
    token = request.cookies.get("flowie_access")
    if not token:
        return
    from ..identity.security.sessions import decode_access

    try:
        user_id = decode_access(token, request.app.state.settings)["sub"]
    except ApiError:
        return
    factory = getattr(request.app.state, "session_factory", None)
    # The lifespan always sets the factory in a running server; only test apps built without the
    # lifespan lack it, and they are not serving real users.
    # VI: Lifespan luôn tạo factory khi server chạy thật; chỉ app test dựng không qua lifespan mới
    # VI: thiếu nó, và app đó không phục vụ người dùng thật.
    if factory is None:
        return
    async with factory() as db:
        roles = dict(
            (
                await db.execute(
                    text("SELECT workspace_id, role FROM workspace_members WHERE user_id = :user AND status = 'ACTIVE'"),
                    {"user": user_id},
                )
            ).all()
        )
    if READ_ONLY_ROLE not in roles.values():
        return
    workspace = await _target_workspace(request)
    if workspace is None or roles.get(workspace) == READ_ONLY_ROLE:
        raise ApiError(403, "Your role in this workspace is read-only.", "Forbidden")
