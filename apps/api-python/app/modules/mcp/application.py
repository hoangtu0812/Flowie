from __future__ import annotations

import asyncio
import json
import logging
from hashlib import sha256
from time import monotonic

from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy import text

from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ...core.clock import _utcnow
from .commands import CommandService
from .connections import validate_current
from .log_redaction import failure_details, redact_arguments
from .queries import QueryService
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
                    text("SELECT role FROM workspace_members WHERE workspace_id = :workspace AND user_id = :user AND status = 'ACTIVE'"),
                    {"workspace": principal.workspace_id, "user": principal.user["id"]},
                )
            ).scalar_one_or_none()
        return role == "ADMIN_VIEWER"

    async def call(self, principal, name: str, arguments: dict) -> dict:
        correlation, started = _cuid(), monotonic()
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
            payload = tool.model.model_validate(arguments)
            await consume_quota(self.factory, principal.workspace_id, name)
        except ApiError as error:
            await self.failed_audit(
                principal, name, correlation, error, started, arguments
            )
            raise
        except ValidationError as error:
            api_error = ApiError(
                400, "Tool arguments do not match the input schema.", "Bad Request"
            )
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
        if tool.handler.startswith("run_"):
            from ..agent_runs.service import RunService

            return await getattr(
                RunService(db, principal, self.settings), tool.handler[4:]
            )(payload)
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
                    text("SELECT id,name,slug FROM workspaces WHERE id=:id"),
                    {"id": principal.workspace_id},
                )
            ).mappings()
            return {"items": [dict(row) for row in rows]}
        return await getattr(QueryService(db, principal, self.settings), tool.handler)(
            payload
        )

    async def mutate(self, db, principal, tool, payload, correlation, started=None):
        await db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
            {"key": f"requests:{principal.connection_id}"},
        )
        if tool.scope == "runs:write":
            from ..agent_runs.service import RunService

            service = RunService(db, principal, self.settings)
        else:
            service = CommandService(db, principal, self.settings)
        await service.prepare(tool.name, payload)
        key = f"{principal.connection_id}:{tool.name}:{payload.idempotencyKey}"
        await db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"), {"key": key}
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
                    text("""SELECT request_hash,result FROM mcp_requests
            WHERE connection_id=:connection AND tool=:tool AND key=:key"""),
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
            if tool.name in {"claim_issue", "heartbeat_run"}:
                from ..agent_runs.service import RunService
                from ..agent_runs.contracts import RunInput

                replay = previous["result"]["data"]
                run = await RunService(db, principal, self.settings).get(
                    RunInput(runId=replay["id"])
                )
                if (
                    run["connectionId"] != principal.connection_id
                    or run["state"] != "RUNNING"
                    or run["leaseUntil"] <= _utcnow()
                    or run["fencingToken"] != replay["fencingToken"]
                ):
                    raise ApiError(
                        409,
                        "The cached lease is no longer valid. Start a new claim.",
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
                text("SELECT COUNT(*) FROM mcp_requests WHERE connection_id=:id"),
                {"id": principal.connection_id},
            )
        ).scalar_one()
        if used >= self.settings.mcp_max_idempotency_keys:
            raise ApiError(
                429,
                "This connection reached its mutation-key budget. Ask an administrator to review the budget.",
                "Too Many Requests",
            )
        await db.execute(text("SELECT set_config('flowie.mcp_write','true',true)"))
        data = jsonable_encoder(await service.execute(tool.name, payload))
        if tool.name in {"create_issue", "update_issue", "transition_issue"}:
            data.pop("parentIssueId", None)
            data.pop("parent", None)
            data.pop("duplicateOfId", None)
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
        )
        await db.execute(
            text("""INSERT INTO mcp_requests (connection_id,tool,key,request_hash,result)
            VALUES (:connection,:tool,:key,:hash,CAST(:result AS jsonb))"""),
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
            text("""INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
            VALUES (:id,:workspace,:actor,:action,'mcp-tool',:entity,CAST(:metadata AS jsonb),:now)"""),
            {
                "id": _cuid(),
                "workspace": principal.workspace_id,
                "actor": principal.user["id"],
                "action": f"mcp.{name}.{outcome}",
                "entity": entity_id,
                "now": _utcnow(),
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
                    "denied"
                    if isinstance(error, ApiError)
                    and error.status_code in {401, 403, 404}
                    else "failed",
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
