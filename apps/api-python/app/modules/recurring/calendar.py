from calendar import monthrange
from datetime import datetime, time, timedelta, timezone

from ...core.errors import ApiError
from ...core.timezones import local_instant, time_zone


def next_occurrence(rule, after):
    zone = time_zone(rule.timezone)
    if after.tzinfo:
        after = after.astimezone(timezone.utc).replace(tzinfo=None)
    day = max(
        rule.startDate, after.replace(tzinfo=timezone.utc).astimezone(zone).date()
    )
    anchor_monday = rule.startDate - timedelta(days=rule.startDate.weekday())
    hour, minute = map(int, rule.time.split(":"))
    for _ in range(366 * 4):
        eligible = False
        if rule.frequency == "DAILY":
            eligible = (day - rule.startDate).days % rule.interval == 0
        elif rule.frequency == "WEEKLY":
            eligible = (
                (day - anchor_monday).days // 7
            ) % rule.interval == 0 and day.weekday() in rule.weekdays
        elif rule.frequency == "MONTHLY":
            months = (
                (day.year - rule.startDate.year) * 12 + day.month - rule.startDate.month
            )
            eligible = months % rule.interval == 0 and day.day == min(
                rule.monthDay, monthrange(day.year, day.month)[1]
            )
        if eligible:
            candidate = local_instant(datetime.combine(day, time(hour, minute)), zone)
            if candidate > after:
                return candidate
        day += timedelta(days=1)
    raise ApiError(400, "No occurrence is available within four years.", "Bad Request")


def upcoming(rule, after, count=5):
    occurrences = []
    for _ in range(count):
        after = next_occurrence(rule, after)
        occurrences.append(after)
    return occurrences
