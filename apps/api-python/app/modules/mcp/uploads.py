"""Upload URLs that let an MCP agent attach a local file to an issue.

A tool call cannot carry a file: MCP requests are capped at 256 KiB and a model cannot copy a
binary file into its arguments. `create_attachment_upload` therefore returns a short-lived URL
that the agent posts the file to with a shell tool such as curl. The URL holds a signed token
bound to one connection, user, issue and file name. Every check of the tool call runs again at
upload time, because the connection, its scopes or the user's access may change in between.
VI: URL upload cho phép agent MCP đính kèm file trên máy vào issue. Lời gọi tool không mang được
VI: file: request MCP giới hạn 256 KiB và model không chép được file nhị phân vào tham số. Vì vậy
VI: `create_attachment_upload` trả về URL sống ngắn để agent gửi file bằng công cụ shell như curl.
VI: URL chứa token đã ký, gắn với một kết nối, người dùng, issue và tên file. Mọi kiểm tra của lời
VI: gọi tool chạy lại lúc upload, vì kết nối, scope hay quyền của người dùng có thể đổi trong lúc đó.
"""

from __future__ import annotations

import json
from datetime import timedelta
from hashlib import sha256
from mimetypes import guess_type
from time import monotonic

import jwt
from fastapi import File, Request, UploadFile
from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...domains.native_attachments import (
    MAX_ATTACHMENT_BYTES,
    _authorize_entity,
    store_attachment,
)
from .connections import load_principal
from .policy import AccessPolicy

UPLOAD_TTL = timedelta(minutes=10)
UPLOAD_AUDIENCE = "flowie-mcp-upload"
# The upload is recorded under this name in mcp_requests (single use) and in the MCP call log.
# VI: Lượt upload được ghi với tên này trong mcp_requests (dùng một lần) và trong log lời gọi MCP.
UPLOAD_TOOL = "upload_attachment"

router = APIRouter(prefix="/api/v1/mcp/uploads", tags=["mcp"])


def upload_link(settings, principal, issue: dict, filename: str) -> dict:
    """Signs an upload URL for `filename` on `issue`, which the caller has already authorized.
    VI: Ký URL upload cho `filename` vào `issue`, issue mà bên gọi đã kiểm tra quyền.
    """
    now = _utcnow()
    expires = now + UPLOAD_TTL
    token = jwt.encode(
        {
            "iss": "flowie",
            "aud": UPLOAD_AUDIENCE,
            "jti": _cuid(),
            "cid": principal.connection_id,
            "sub": principal.user["id"],
            "wid": principal.workspace_id,
            "iid": issue["id"],
            "name": filename,
            "iat": now,
            "exp": expires,
        },
        settings.auth_jwt_secret,
        algorithm="HS256",
    )
    url = f"{settings.api_public_url}/mcp/uploads/{token}"
    return {
        "issueId": issue["id"],
        "filename": filename,
        "uploadUrl": url,
        "method": "POST",
        "field": "file",
        "maxBytes": MAX_ATTACHMENT_BYTES,
        "expiresAt": expires,
        "curl": f'curl -sS -F "file=@<path to {filename}>" "{url}"',
    }


def _claims(token: str, settings) -> dict:
    try:
        claims = jwt.decode(
            token,
            settings.auth_jwt_secret,
            algorithms=["HS256"],
            audience=UPLOAD_AUDIENCE,
            issuer="flowie",
            options={"require": ["jti", "cid", "sub", "wid", "iid", "name", "exp"]},
        )
    except jwt.PyJWTError as error:
        raise ApiError(
            401, "The upload URL is invalid or expired. Ask for a new one.", "Unauthorized"
        ) from error
    return claims


@router.post("/{token}")
async def upload_attachment(token: str, request: Request, file: UploadFile = File()) -> dict:
    """Stores the posted file as an attachment of the token's issue, uploaded by the connection
    owner. A second post of the same URL returns the first result instead of a duplicate.
    VI: Lưu file được gửi thành đính kèm của issue trong token, người tải lên là chủ kết nối.
    VI: Gửi lại cùng URL trả về kết quả lần đầu thay vì tạo bản trùng.
    """
    from .application import ToolApplication

    started = monotonic()
    settings = request.app.state.settings
    claims = _claims(token, settings)
    if not settings.mcp_writes_enabled:
        raise ApiError(403, "MCP writes are disabled.", "Forbidden")
    async with request.app.state.session_factory() as db:
        principal = await load_principal(db, claims["cid"])
        if (
            principal.user["id"] != claims["sub"]
            or principal.workspace_id != claims["wid"]
        ):
            raise ApiError(401, "The upload URL is invalid or expired.", "Unauthorized")
        principal.require("issues:write", "issues:read")
        application = ToolApplication(request.app.state.session_factory, settings)
        if await application.read_only(principal):
            raise ApiError(403, "Your role in this workspace is read-only.", "Forbidden")
        issue = await AccessPolicy(db, principal).issue(claims["iid"])
        await _authorize_entity(
            db, principal.workspace_id, "issue", issue["id"], principal.user["id"], writing=True
        )
        key = {"connection": principal.connection_id, "tool": UPLOAD_TOOL, "key": claims["jti"]}
        # The lock makes two concurrent posts of one URL store a single file.
        # VI: Khóa giúp hai lần gửi đồng thời cùng một URL chỉ lưu một file.
        await db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
            {"key": f"{principal.connection_id}:{UPLOAD_TOOL}:{claims['jti']}"},
        )
        previous = (
            await db.execute(
                text("""SELECT result FROM mcp_requests
                WHERE connection_id=:connection AND tool=:tool AND key=:key"""),
                key,
            )
        ).scalar_one_or_none()
        if previous:
            return previous
        body = await file.read(MAX_ATTACHMENT_BYTES + 1)
        # The type follows the name fixed at tool time, not the client's header, so a file cannot
        # claim to be an image it is not named as.
        # VI: Kiểu file theo tên đã chốt lúc gọi tool, không theo header của client, nên file không
        # VI: thể tự nhận là ảnh khi tên của nó không phải ảnh.
        mime = guess_type(claims["name"])[0] or "application/octet-stream"
        data = await store_attachment(
            db, settings, principal.workspace_id, principal.user["id"], "issue",
            issue["id"], claims["name"], mime, body,
        )
        correlation = _cuid()
        result = {"data": data, "correlationId": correlation}
        await application.audit(
            db, principal, UPLOAD_TOOL, correlation, "succeeded", data["id"],
            duration_ms=int((monotonic() - started) * 1000),
        )
        await db.execute(
            text("""INSERT INTO mcp_requests (connection_id,tool,key,request_hash,result)
            VALUES (:connection,:tool,:key,:hash,CAST(:result AS jsonb))"""),
            {
                **key,
                "hash": sha256(token.encode()).hexdigest(),
                "result": json.dumps(result, default=str),
            },
        )
        await db.commit()
        return result
