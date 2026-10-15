from datetime import datetime, time, timedelta, timezone

from ...core.errors import ApiError
from ...core.timezones import local_instant, time_zone
from .contracts import clock_minutes

HORIZON_DAYS = 366 * 10


def utc_naive(value):
    return (
        value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value
    )


def windows_for(day, calendar, zone, holidays):
    if day in holidays:
        return []
    windows = []
    for window in sorted(
        (row for row in calendar.windows if row.weekday == day.weekday()),
        key=lambda row: row.start,
    ):
        start = datetime.combine(day, time()) + timedelta(
            minutes=clock_minutes(window.start)
        )
        end = datetime.combine(day, time()) + timedelta(
            minutes=clock_minutes(window.end)
        )
        opened, closed = local_instant(start, zone), local_instant(end, zone)
        if opened < closed:
            windows.append((opened, closed))
    return windows


def add_working_seconds(start, seconds, calendar):
    start = utc_naive(start)
    if seconds < 0:
        raise ValueError("Remaining SLA time cannot be negative")
    if calendar is None or seconds == 0:
        return start + timedelta(seconds=seconds)
    zone = time_zone(calendar.timezone)
    holidays = set(calendar.holidays)
    day = start.replace(tzinfo=timezone.utc).astimezone(zone).date()
    for _ in range(HORIZON_DAYS):
        for opened, closed in windows_for(day, calendar, zone, holidays):
            cursor = max(start, opened)
            available = max(0, (closed - cursor).total_seconds())
            if available and seconds <= available:
                return cursor + timedelta(seconds=seconds)
            seconds -= available
        day += timedelta(days=1)
    raise ApiError(
        400,
        "The SLA deadline exceeds the ten-year calendar horizon; increase working hours or reduce the budget.",
        "Bad Request",
    )


def working_seconds_between(start, end, calendar, *, cap=None):
    start, end = utc_naive(start), utc_naive(end)
    if end <= start or cap == 0:
        return 0.0
    if calendar is None:
        return (
            min((end - start).total_seconds(), cap)
            if cap is not None
            else (end - start).total_seconds()
        )
    zone = time_zone(calendar.timezone)
    holidays = set(calendar.holidays)
    day = start.replace(tzinfo=timezone.utc).astimezone(zone).date()
    last = end.replace(tzinfo=timezone.utc).astimezone(zone).date()
    total = 0.0
    for _ in range(HORIZON_DAYS):
        if day > last:
            return total
        for opened, closed in windows_for(day, calendar, zone, holidays):
            total += max(0, (min(end, closed) - max(start, opened)).total_seconds())
            if cap is not None and total >= cap:
                return float(cap)
        day += timedelta(days=1)
    if day > last:
        return total
    raise ApiError(
        400, "The measured SLA interval exceeds the calendar horizon.", "Bad Request"
    )
