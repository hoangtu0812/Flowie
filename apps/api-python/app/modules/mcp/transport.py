from __future__ import annotations

import json
import logging

from mcp.server.lowlevel import Server
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import (
    CallToolResult,
    ImageContent,
    ListToolsResult,
    TextContent,
    Tool,
    ToolAnnotations,
)
from starlette.requests import Request
from starlette.responses import JSONResponse
from sqlalchemy import text

from ...core.audit_context import audit_agent
from ...core.errors import ApiError
from ...core.clock import _utcnow
from .application import ToolApplication
from .connections import authenticate
from .domain import current_principal, principal_context
from .instructions import server_instructions
from .registry import TOOLS, visible_tools

logger = logging.getLogger(__name__)

# Sent to every MCP client when it connects (Codex, Claude, ChatGPT …), whatever folder or
# product it runs in, so all agents follow the same task workflow without a per-client
# AGENTS.md. This is the built-in text; a workspace may replace the workflow part.
# VI: Gửi tới mọi client MCP khi kết nối (Codex, Claude, ChatGPT …), dù chạy ở thư mục hay sản
# VI: phẩm nào, để mọi agent theo cùng một quy trình xử lý task mà không cần AGENTS.md riêng cho
# VI: từng client. Đây là văn bản có sẵn; workspace có thể thay phần quy trình.
SERVER_INSTRUCTIONS = server_instructions(None)


class WorkspaceServer(Server):
    """Answers initialize (and server/discover) with the connection's workspace instructions.
    The SDK reads `instructions` while handling the request, inside the context that
    ConnectionAuthMiddleware set, so each workspace gets its own text; outside a request the
    built-in text is used. Clients only read instructions at initialize, so a saved change
    reaches a client when it reconnects.
    VI: Trả lời initialize (và server/discover) bằng instruction của workspace của kết nối. SDK
    VI: đọc `instructions` khi xử lý request, trong context mà ConnectionAuthMiddleware đã đặt,
    VI: nên mỗi workspace nhận văn bản của mình; ngoài request thì dùng văn bản có sẵn. Client
    VI: chỉ đọc instruction lúc initialize, nên thay đổi đã lưu tới client khi nó kết nối lại."""

    @property
    def instructions(self) -> str:
        principal = principal_context.get(None)
        return server_instructions(principal.instructions if principal else None)

    @instructions.setter
    def instructions(self, value) -> None:
        # The SDK constructor assigns this; the value always comes from the getter above.
        # VI: Constructor của SDK gán thuộc tính này; giá trị luôn lấy từ getter ở trên.
        pass


class ConnectionAuthMiddleware:
    """Pure ASGI middleware preserves SDK streaming and request context."""

    def __init__(self, app, host_app):
        self.app, self.host_app = app, host_app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request = Request(scope)
        authorization = request.headers.get("authorization", "")
        try:
            scheme, token = authorization.split(" ", 1)
            if scheme.lower() != "bearer" or not token:
                raise ValueError
        except ValueError:
            return await JSONResponse(
                {"error": "A Bearer MCP connection token is required."},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )(scope, receive, send)
        try:
            async with self.host_app.state.session_factory() as db:
                principal = await authenticate(db, token)

                row = (
                    await db.execute(
                        text("""UPDATE mcp_connections SET
                    rate_count=CASE WHEN rate_window=date_trunc('minute',CAST(:now AS timestamp)) THEN rate_count+1 ELSE 1 END,
                    rate_window=date_trunc('minute',CAST(:now AS timestamp)) WHERE id=:id RETURNING rate_count"""),
                        {
                            "id": principal.connection_id,
                            "now": _utcnow(),
                        },
                    )
                ).first()
                await db.commit()
                if row[0] > self.host_app.state.settings.mcp_rate_limit:
                    return await JSONResponse(
                        {"error": "MCP request limit exceeded."},
                        status_code=429,
                        headers={"Retry-After": "60"},
                    )(scope, receive, send)
        except ApiError as error:
            return await JSONResponse(
                {"error": error.message},
                status_code=error.status_code,
                headers={"WWW-Authenticate": "Bearer"},
            )(scope, receive, send)
        except Exception:
            logger.warning("MCP authentication dependency is unavailable")
            return await JSONResponse(
                {"error": "MCP is temporarily unavailable."}, status_code=503
            )(scope, receive, send)
        context_token = principal_context.set(principal)
        agent_token = audit_agent.set(
            {"connectionId": principal.connection_id, "name": principal.connection_name}
        )
        try:
            await self.app(scope, receive, send)
        finally:
            audit_agent.reset(agent_token)
            principal_context.reset(context_token)


def build_server(host_app):
    settings = host_app.state.settings

    async def list_tools(ctx, params):
        principal = current_principal()
        return ListToolsResult(
            tools=[
                Tool(
                    name=tool.name,
                    description=tool.description,
                    input_schema=tool.model.model_json_schema(),
                    annotations=ToolAnnotations(
                        read_only_hint=not tool.write,
                        destructive_hint=False,
                        idempotent_hint=True,
                        open_world_hint=False,
                    ),
                )
                for tool in visible_tools(principal, settings.mcp_writes_enabled)
            ]
        )

    async def call_tool(ctx, params):
        try:
            result = await ToolApplication(
                host_app.state.session_factory, settings
            ).call(
                current_principal(),
                params.name,
                params.arguments or {},
            )
            # An image result travels as MCP image content so the client model can see it;
            # the remaining fields stay as structured JSON metadata.
            # VI: Kết quả ảnh được gửi dạng nội dung ảnh MCP để model phía client nhìn được;
            # VI: các trường còn lại giữ dạng metadata JSON có cấu trúc.
            image = result.pop("imageBase64", None) if isinstance(result, dict) else None
            content = [TextContent(type="text", text=json.dumps(result))]
            if image:
                content.insert(
                    0, ImageContent(type="image", data=image, mime_type=result["mimeType"])
                )
            return CallToolResult(content=content, structured_content=result)
        except ApiError as error:
            result = {
                "error": error.error,
                "message": error.message,
                "statusCode": error.status_code,
            }
        except Exception:
            logger.warning("MCP tool execution failed tool=%s", params.name)
            result = {
                "error": "Internal Server Error",
                "message": "Tool execution failed.",
                "statusCode": 500,
            }
        return CallToolResult(
            content=[TextContent(type="text", text=json.dumps(result))],
            structured_content=result,
            is_error=True,
        )

    server = WorkspaceServer(
        "Flowie",
        version="1.0.0",
        on_list_tools=list_tools,
        on_call_tool=call_tool,
        get_tool_input_schema=lambda name: (
            TOOLS[name].model.model_json_schema() if name in TOOLS else None
        ),
    )
    transport = server.streamable_http_app(
        streamable_http_path="/",
        json_response=True,
        stateless_http=True,
        max_request_body_size=262144,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=list(settings.mcp_allowed_hosts),
            allowed_origins=list(settings.cors_origins),
        ),
    )
    return server, ConnectionAuthMiddleware(transport, host_app)
