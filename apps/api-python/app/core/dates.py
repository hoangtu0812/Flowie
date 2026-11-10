from __future__ import annotations

from datetime import UTC, datetime

from .errors import ApiError


def parse_date(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ApiError(
            400, "date must be a valid ISO 8601 datetime", "Bad Request"
        ) from error
    return (
        parsed.astimezone(UTC).replace(tzinfo=None)
        if parsed.tzinfo
        else parsed
    )


# shortcut: private alias kept for callers not yet moved out of app/domains; delete it once DTD-523
# has switched every caller to `parse_date`.
# VI: shortcut: alias nội bộ giữ cho các nơi gọi chưa chuyển khỏi app/domains; xoá khi DTD-523 đã
# VI: chuyển mọi nơi gọi sang `parse_date`.
_date = parse_date
