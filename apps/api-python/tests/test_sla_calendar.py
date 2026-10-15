from datetime import datetime

import pytest
from pydantic import ValidationError

from app.modules.sla.calendar import add_working_seconds, working_seconds_between
from app.modules.sla.contracts import BusinessCalendar, PolicyValues, CalendarPreview


def test_working_calendar_counts_only_open_windows_holidays_and_split_shifts():
    calendar = BusinessCalendar(timezone="Asia/Ho_Chi_Minh", holidays=["2026-10-19"])
    friday = datetime(2026, 10, 16, 9, 30)
    deadline = add_working_seconds(friday, 2 * 3600, calendar)
    assert deadline == datetime(2026, 10, 20, 3, 30)
    assert working_seconds_between(friday, deadline, calendar) == 7200
    assert (
        working_seconds_between(friday, datetime(2026, 11, 1), calendar, cap=7200)
        == 7200
    )
    split = BusinessCalendar(
        timezone="UTC",
        windows=[
            {"weekday": 0, "start": "09:00", "end": "12:00"},
            {"weekday": 0, "start": "13:00", "end": "17:00"},
        ],
    )
    assert add_working_seconds(datetime(2026, 10, 19, 11, 30), 3600, split) == datetime(
        2026, 10, 19, 13, 30
    )
    assert (
        working_seconds_between(
            datetime(2026, 10, 19, 12), datetime(2026, 10, 19, 13), split
        )
        == 0
    )
    assert add_working_seconds(datetime(2026, 10, 18), 0, split) == datetime(
        2026, 10, 18
    )


def test_business_budget_uses_actual_utc_intervals_across_dst():
    calendar = BusinessCalendar(timezone="America/New_York")
    friday = datetime(2026, 3, 6, 21)
    assert add_working_seconds(friday, 2 * 3600, calendar) == datetime(2026, 3, 9, 14)
    assert working_seconds_between(friday, datetime(2026, 3, 9, 14), calendar) == 7200
    assert add_working_seconds(friday, 60, None) == datetime(2026, 3, 6, 21, 1)


def test_policy_and_calendar_reject_overlapping_invalid_or_unusable_windows():
    for start in ["2026-10-15T09:00:00", "9999-12-31T23:59:00Z"]:
        with pytest.raises(ValidationError):
            CalendarPreview(startAt=start, deadlineMinutes=60)
    for value in [
        {"windows": []},
        {"timezone": "Invalid/Zone"},
        {"windows": [{"weekday": 1, "start": "23:00", "end": "01:00"}]},
        {"windows": [{"weekday": 1, "start": "09:00", "end": "09:30"}]},
        {
            "windows": [
                {"weekday": 1, "start": "09:00", "end": "12:00"},
                {"weekday": 1, "start": "11:30", "end": "17:00"},
            ]
        },
        {"holidays": ["2026-10-19", "2026-10-19"]},
    ]:
        with pytest.raises(ValidationError):
            BusinessCalendar.model_validate(value)
    for value in [
        {"warningMinutes": 60},
        {"pauseStatusIds": ["same", "same"]},
        {"name": "  "},
    ]:
        with pytest.raises(ValidationError):
            PolicyValues.model_validate(
                {"name": "Policy", "deadlineMinutes": 60, **value}
            )
