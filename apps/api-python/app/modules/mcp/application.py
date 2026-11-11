from __future__ import annotations

import asyncio
import json
import logging
from hashlib import sha256
from time import monotonic

from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..teams.insights_api import hcm_today
from .command_service import CommandService
from .commands import (
    AUDIT_INSERT_AUDIT_LOGS,
    MUTATE_INSERT_MCP_REQUESTS,
    MUTATE_LOCK,
    MUTATE_LOCK_2,
    MUTATE_LOCK_3,
)
from .compact import compact_comment, compact_document, compact_issue
from .connections import validate_current
from .contracts import normalize_arguments
from .log_redaction import failure_details, redact_arguments
from .planning import planning_warnings
from .queries import (
    MUTATE_SELECT_MCP_REQUESTS,
    MUTATE_SELECT_MCP_REQUESTS_2,
    READ_ONLY_SELECT_WORKSPACE_MEMBERS,
    READ_SELECT_WORKSPACES,
)
from .query_service import QueryService
from .quotas import consume_quota
from .registry import TOOLS

logger = logging.getLogger(__name__)


class ToolApplication:
    def __init__(self, factory, settings):
        self.factory, self.settings = factory, settings

    async def read_only(self, principal) -> bool:
        """Whether the connection's user is a read-only admin (ADMIN_VIEWER) of its workspace;
        MCP calls carry no session cookie, so the app-wide write guard does not see them.
        VI: Người dùng của kết nối có phải quản trị chỉ đọc (ADMIN_VIEWER) của workspace hay không;
        VI: lời gọi MCP không có cookie phiên nên lớp chặn ghi toàn app không thấy chúng.
        """
        async with self.factory() as db:
            role = (
                await db.execute(
                    READ_ONLY_SELECT_WORKSPACE_MEMBERS,
                    {"workspace": principal.workspace_id, "user": principal.user["id"]},
                )
            ).scalar_one_or_none()
        return role == "ADMIN_VIEWER"

    async def call(self, principal, name: str, arguments: dict) -> dict:
        correlation, started = cuid(), monotonic()
        tool = TOOLS.get(name)
        try:
            if not tool:
                # Unknown names are client input; the cut keeps the audit action bounded.
                # VI: Tên tool lạ do client gửi; cắt ngắn để action audit có độ dài giới hạn.
                name = name[:100]
                raise ApiError(404, "Tool not found.", "Not Found")
            principal.require(tool.scope, *tool.extra_scopes)
            if tool.write and not self.settings.mcp_writes_enabled:
                raise ApiError(403, "MCP writes are disabled.", "Forbidden")
            if tool.write and await self.read_only(principal):
                raise ApiError(403, "Your role in this workspace is read-only.", "Forbidden")
            payload = tool.model.model_validate(normalize_arguments(tool.model, arguments))
            await consume_quota(self.factory, principal.workspace_id, name)
        except ApiError as error:
            await self.failed_audit(
                principal, name, correlation, error, started, arguments
            )
            raise
        except ValidationError as error:
            api_error = invalid_arguments(error, "Tool arguments do not match the input schema: ")
            await self.failed_audit(
                principal, name, correlation, api_error, started, arguments
            )
            raise api_error from error
        async with self.factory() as db:
            try:
                async with asyncio.timeout(self.settings.mcp_tool_timeout_seconds):
                    await validate_current(db, principal)
                    if tool.write:
                        from ..work_items.lifecycle import actor_context
                        db.info['lifecycle_source']='AI'
                        await actor_context(db,principal.user['id'],source='AI')
                        result = await self.mutate(
                            db, principal, tool, payload, correlation, started
                        )
                    else:
                        result = await self.read(db, principal, tool, payload)
                        await self.audit(
                            db,
                            principal,
                            name,
                            correlation,
                            "succeeded",
                            duration_ms=int((monotonic() - started) * 1000),
                            details={"resultBytes": result_bytes(result)},
                        )
                    result = jsonable_encoder(result)
                    # Image bytes are capped by the image reader itself; the JSON limit applies
                    # to every other field.
                    # VI: Byte ảnh đã có giới hạn riêng trong bộ đọc ảnh; giới hạn JSON áp dụng
                    # VI: cho mọi trường còn lại.
                    measured = (
                        {key: value for key, value in result.items() if key != "imageBase64"}
                        if isinstance(result, dict)
                        else result
                    )
                    if (
                        len(json.dumps(measured).encode())
                        > self.settings.mcp_max_result_bytes
                    ):
                        raise ApiError(
                            413,
                            "Result is too large. Use a narrower query.",
                            "Payload Too Large",
                        )
                    await db.commit()
                logger.info(
                    "MCP tool=%s connection=%s status=ok duration_ms=%d",
                    name,
                    principal.connection_id,
                    (monotonic() - started) * 1000,
                )
                return result
            except BaseException as error:
                await db.rollback()
                # A handler that builds a web input model from the tool arguments (for example
                # document content that grows past its limit after edits) fails pydantic
                # validation: that is a client error, not an internal one.
                # VI: Handler dựng model input của web từ tham số tool (ví dụ nội dung tài liệu
                # VI: vượt giới hạn sau khi áp dụng edits) bị pydantic từ chối: đó là lỗi của
                # VI: client, không phải lỗi nội bộ.
                if isinstance(error, ValidationError):
                    api_error = invalid_arguments(error, "Tool arguments are not valid: ")
                    await self.failed_audit(
                        principal, name, correlation, api_error, started, arguments
                    )
                    raise api_error from error
                if not isinstance(error, asyncio.CancelledError):
                    await self.failed_audit(
                        principal, name, correlation, error, started, arguments
                    )
                if isinstance(error, TimeoutError):
                    raise ApiError(
                        504,
                        "Tool timed out. Retry writes with the same idempotency key.",
                        "Gateway Timeout",
                    ) from error
                raise

    async def read(self, db, principal, tool, payload):
        if tool.handler == "access":
            return {
                "connectionId": principal.connection_id,
                "workspaceId": principal.workspace_id,
                "scopes": sorted(principal.scopes),
                "teamIds": principal.team_ids,
                "projectIds": principal.project_ids,
                "writesEnabled": self.settings.mcp_writes_enabled,
            }
        if tool.handler == "workspaces":
            rows = (
                await db.execute(
                    READ_SELECT_WORKSPACES,
                    {"id": principal.workspace_id},
                )
            ).mappings()
            return {"items": [dict(row) for row in rows]}
        return await getattr(QueryService(db, principal, self.settings), tool.handler)(
            payload
        )

    async def mutate(self, db, principal, tool, payload, correlation, started=None):
        await db.execute(
            MUTATE_LOCK,
            {"key": f"requests:{principal.connection_id}"},
        )
        service = CommandService(db, principal, self.settings)
        await service.prepare(tool.name, payload)
        key = f"{principal.connection_id}:{tool.name}:{payload.idempotencyKey}"
        await db.execute(
            MUTATE_LOCK_2, {"key": key}
        )
        params = {
            "connection": principal.connection_id,
            "tool": tool.name,
            "key": payload.idempotencyKey,
        }
        fingerprint = sha256(
            json.dumps(
                payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
            ).encode()
        ).hexdigest()
        previous = (
            (
                await db.execute(
                    MUTATE_SELECT_MCP_REQUESTS_2,
                    params,
                )
            )
            .mappings()
            .first()
        )
        if previous:
            if previous["request_hash"] != fingerprint:
                raise ApiError(
                    409,
                    "This idempotency key was already used with different arguments.",
                    "Conflict",
                )
            await self.audit(
                db,
                principal,
                tool.name,
                correlation,
                "succeeded",
                previous["result"]["data"].get("id"),
                duration_ms=int((monotonic() - started) * 1000) if started else None,
            )
            return previous["result"]
        used = (
            await db.execute(
                MUTATE_SELECT_MCP_REQUESTS,
                {"id": principal.connection_id},
            )
        ).scalar_one()
        if used >= self.settings.mcp_max_idempotency_keys:
            raise ApiError(
                429,
                "This connection reached its mutation-key budget. Ask an administrator to review the budget.",
                "Too Many Requests",
            )
        await db.execute(MUTATE_LOCK_3)
        data = jsonable_encoder(await service.execute(tool.name, payload))
        if tool.name in {"create_issue", "update_issue", "transition_issue", "start_issue", "finish_issue"}:
            data.pop("parentIssueId", None)
            data.pop("parent", None)
            data.pop("duplicateOfId", None)
            sent = set(payload.model_fields_set) - {"idempotencyKey", "expectedVersion", "issueId"}
            data = {
                **compact_issue(data, sent),
                **({"commentId": data["commentId"]} if "commentId" in data else {}),
                "planningWarnings": planning_warnings(data, hcm_today()),
            }
        elif tool.name in {"add_comment", "update_comment"}:
            data = compact_comment(data)
        elif tool.name in {"create_document", "update_document", "restore_document"}:
            data = compact_document(data, payload.includeContent)
        result = {
            "data": data,
            "correlationId": correlation,
        }
        await self.audit(
            db,
            principal,
            tool.name,
            correlation,
            "succeeded",
            result["data"].get("id"),
            duration_ms=int((monotonic() - started) * 1000) if started else None,
            details={"resultBytes": result_bytes(result)},
        )
        await db.execute(
            MUTATE_INSERT_MCP_REQUESTS,
            {**params, "hash": fingerprint, "result": json.dumps(result)},
        )
        return result

    async def audit(
        self,
        db,
        principal,
        name,
        correlation,
        outcome,
        entity_id=None,
        duration_ms=None,
        details=None,
    ):
        await db.execute(
            AUDIT_INSERT_AUDIT_LOGS,
            {
                "id": cuid(),
                "workspace": principal.workspace_id,
                "actor": principal.user["id"],
                "action": f"mcp.{name}.{outcome}",
                "entity": entity_id,
                "now": utcnow(),
                "metadata": json.dumps(
                    {
                        "connectionId": principal.connection_id,
                        "source":"AI",
                        "correlationId": correlation,
                        "tool": name,
                        "outcome": outcome,
                        "durationMs": duration_ms,
                        **(details or {}),
                    }
                ),
            },
        )

    async def failed_audit(
        self, principal, name, correlation, error, started=None, arguments=None
    ):
        """Records a failed or denied call with its error and masked arguments in its own
        session, so the caller's rollback cannot drop it. Any failure here is only logged:
        the client always receives the tool's original error.
        VI: Ghi lời gọi lỗi hoặc bị từ chối kèm lỗi và tham số đã che trong phiên riêng, để
        VI: rollback của lời gọi không xóa mất. Lỗi ở đây chỉ được ghi log: client luôn nhận
        VI: lỗi gốc của tool."""
        logger.warning(
            "MCP tool=%s connection=%s status=%s",
            name,
            principal.connection_id,
            getattr(error, "status_code", 500),
        )
        try:
            async with self.factory() as db:
                await self.audit(
                    db,
                    principal,
                    name,
                    correlation,
                    audit_outcome(error),
                    duration_ms=int((monotonic() - started) * 1000)
                    if started
                    else None,
                    details={
                        **failure_details(error),
                        "arguments": redact_arguments(arguments or {}),
                    },
                )
                await db.commit()
        except Exception:
            logger.warning("MCP audit is unavailable correlation=%s", correlation)


def audit_outcome(error: BaseException) -> str:
    """`denied` only when access was refused: 401, 403, or a 404 raised by AccessPolicy for a
    record outside the connection's scope ("… not found in the allowed scope."). Every other
    error, including a 404 for data that does not exist yet ("No TDS exists … send content")
    and an unknown tool name, is a `failed` call the client can fix.
    VI: `denied` chỉ khi bị từ chối truy cập: 401, 403, hoặc 404 do AccessPolicy trả cho bản ghi
    VI: ngoài phạm vi kết nối ("… not found in the allowed scope."). Mọi lỗi khác, kể cả 404 vì
    VI: dữ liệu chưa có ("No TDS exists … send content") và tên tool lạ, là `failed` mà client sửa
    VI: được.
    """
    if isinstance(error, ApiError) and (
        error.status_code in {401, 403}
        or (error.status_code == 404 and "in the allowed scope" in error.message)
    ):
        return "denied"
    return "failed"


def invalid_arguments(error: ValidationError, prefix: str) -> ApiError:
    """400 naming the wrong arguments without echoing their values.
    VI: Lỗi 400 nêu tham số sai mà không lặp lại giá trị của chúng."""
    return ApiError(400, prefix + schema_errors(error), "Bad Request")


def schema_errors(error: ValidationError, limit: int = 5) -> str:
    """Which arguments are wrong and why, without echoing the values the client sent.
    VI: Tham số nào sai và vì sao, không lặp lại giá trị client đã gửi.
    """
    parts = [
        f"{'.'.join(str(part) for part in item['loc']) or 'arguments'}: {item['msg']}"
        for item in error.errors(include_input=False, include_url=False)[:limit]
    ]
    return "; ".join(parts)[:600]


def result_bytes(result) -> int:
    """Serialized size of a tool result, logged so token-heavy tools can be found.
    VI: Kích thước kết quả tool sau khi tuần tự hoá, ghi log để tìm tool tốn token.
    """
    return len(json.dumps(jsonable_encoder(result)).encode())
