from __future__ import annotations
from datetime import datetime, timezone
from .errors import ApiError


def _date(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ApiError(
            400, "date must be a valid ISO 8601 datetime", "Bad Request"
        ) from error
    return (
        parsed.astimezone(timezone.utc).replace(tzinfo=None)
        if parsed.tzinfo
        else parsed
    )
