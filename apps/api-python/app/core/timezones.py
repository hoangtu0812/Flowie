from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .errors import ApiError


def time_zone(name):
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ApiError(
            400,
            "Use a recognized IANA time zone, for example Asia/Ho_Chi_Minh.",
            "Bad Request",
        ) from error


def local_instant(wall: datetime, zone: ZoneInfo):
    # Choose the first fold; move gaps to the first valid wall minute, including date-line jumps.
    for minutes in range(26 * 60 + 1):
        candidate = wall + timedelta(minutes=minutes)
        instant = candidate.replace(tzinfo=zone, fold=0).astimezone(timezone.utc)
        if instant.astimezone(zone).replace(tzinfo=None) == candidate:
            return instant.replace(tzinfo=None)
    raise ApiError(400, "The requested local time cannot be resolved.", "Bad Request")
