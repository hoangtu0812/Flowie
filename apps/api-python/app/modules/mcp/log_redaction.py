"""Shapes what an MCP call log may keep about a failed or denied tool call.
The log is read by workspace administrators and by the connection owner, so it keeps
enough to debug (status, error, a trimmed copy of the arguments) and nothing that grants
access: credentials are masked by field name and by value pattern, URLs keep only their
host, and every string, list, object and the whole copy are bounded in size.
VI: Quy định log lời gọi MCP được giữ gì về một lời gọi tool lỗi hoặc bị từ chối. Log
VI: được quản trị viên workspace và chủ kết nối đọc, nên chỉ giữ đủ để debug (mã lỗi, lỗi,
VI: bản rút gọn của tham số) và không giữ gì cấp được quyền truy cập: thông tin xác thực
VI: bị che theo tên trường và theo mẫu giá trị, URL chỉ giữ host, mọi chuỗi, mảng, object
VI: và cả bản sao đều bị giới hạn kích thước."""

from __future__ import annotations

import json
import re

from ...core.errors import ApiError

REDACTED = "[redacted]"
MAX_STRING, MAX_ITEMS, MAX_KEYS, MAX_DEPTH, MAX_JSON = 200, 10, 30, 4, 4000
# idempotencyKey is a retry key chosen by the client, not a credential, and helps match
# a failed write with its retry.
# VI: idempotencyKey là khóa thử lại do client chọn, không phải thông tin xác thực, và giúp
# VI: ghép lời gọi ghi lỗi với lần thử lại.
SENSITIVE_KEY = re.compile(
    r"token|secret|password|passwd|authorization|cookie|credential|api[_-]?key|signature|webhook",
    re.IGNORECASE,
)
SAFE_KEYS = {"idempotencyKey"}
SECRET_VALUE = re.compile(r"(?i)bearer\s+\S+|flowie_mcp_[\w-]+")
URL = re.compile(r"(?i)\b(https?://[^\s/?#]+)[^\s]*")


def _text(value: str, limit: int = MAX_STRING) -> str:
    value = SECRET_VALUE.sub(REDACTED, value)
    # Webhook and signed URLs carry their secret in the path or query, so only the host stays.
    # VI: URL webhook và URL có chữ ký mang bí mật trong path hoặc query, nên chỉ giữ host.
    value = URL.sub(lambda match: match.group(1) + ("/…" if match.group(0) != match.group(1) else ""), value)
    return value if len(value) <= limit else value[:limit] + "…"


def _copy(value, depth: int):
    if isinstance(value, str):
        return _text(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if depth >= MAX_DEPTH:
        return "[nested]"
    if isinstance(value, dict):
        items = list(value.items())
        copy = {
            str(key)[:100]: REDACTED
            if str(key) not in SAFE_KEYS and SENSITIVE_KEY.search(str(key))
            else _copy(item, depth + 1)
            for key, item in items[:MAX_KEYS]
        }
        if len(items) > MAX_KEYS:
            copy["…"] = f"{len(items) - MAX_KEYS} more"
        return copy
    if isinstance(value, (list, tuple)):
        copy = [_copy(item, depth + 1) for item in value[:MAX_ITEMS]]
        if len(value) > MAX_ITEMS:
            copy.append(f"… {len(value) - MAX_ITEMS} more")
        return copy
    return _text(str(value))


def redact_arguments(arguments):
    """Returns a JSON-safe, bounded copy of tool arguments with credentials masked.
    VI: Trả bản sao tham số tool an toàn cho JSON, có giới hạn và đã che thông tin xác thực."""
    copy = _copy(arguments, 0)
    encoded = json.dumps(copy, ensure_ascii=False)
    return copy if len(encoded) <= MAX_JSON else encoded[:MAX_JSON] + "…"


def failure_details(error: BaseException) -> dict:
    """Status, error type and message for the log. Internal errors keep only the exception
    class name because their text can contain SQL or record data.
    VI: Mã trạng thái, loại lỗi và thông báo cho log. Lỗi nội bộ chỉ giữ tên lớp exception vì
    VI: nội dung của nó có thể chứa SQL hoặc dữ liệu bản ghi."""
    if isinstance(error, ApiError):
        return {
            "statusCode": error.status_code,
            "error": error.error,
            "message": _text(error.message, 500),
        }
    if isinstance(error, TimeoutError):
        return {"statusCode": 504, "error": "TimeoutError", "message": "Tool timed out."}
    return {
        "statusCode": 500,
        "error": type(error).__name__[:100],
        "message": "Tool execution failed.",
    }
