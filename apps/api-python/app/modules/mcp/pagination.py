from __future__ import annotations

import base64
import json
from datetime import datetime
from hashlib import sha256
from hmac import compare_digest, new as hmac_new

from ...core.errors import ApiError


class CursorCodec:
    """Bind cursors to the connection, tool and query to prevent cross-query reuse."""

    def __init__(self, secret: str, connection_id: str, tool: str, filters: dict):
        self.secret = secret.encode()
        self.binding = sha256(
            json.dumps(
                [connection_id, tool, filters], sort_keys=True, default=str
            ).encode()
        ).hexdigest()

    def encode(self, timestamp: datetime, identifier: str) -> str:
        payload = json.dumps(
            [self.binding, timestamp.isoformat(), identifier], separators=(",", ":")
        ).encode()
        signature = hmac_new(self.secret, payload, sha256).digest()
        return base64.urlsafe_b64encode(signature + payload).decode()

    def decode(self, cursor: str) -> tuple[datetime, str]:
        try:
            raw = base64.b64decode(cursor, altchars=b"-_", validate=True)
            signature, payload = raw[:32], raw[32:]
            if not compare_digest(
                signature, hmac_new(self.secret, payload, sha256).digest()
            ):
                raise ValueError
            binding, timestamp, identifier = json.loads(payload)
            if (
                binding != self.binding
                or not isinstance(identifier, str)
                or len(identifier) > 100
            ):
                raise ValueError
            parsed = datetime.fromisoformat(timestamp)
            if parsed.tzinfo is not None:
                raise ValueError
            return parsed, identifier
        except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
            raise ApiError(
                400, "Invalid cursor. Start a new search.", "Bad Request"
            ) from error


def literal_search(value: str) -> str:
    return (
        "%" + value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    )
