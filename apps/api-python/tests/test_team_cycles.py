"""Cycle progress is derived from stored timestamps and never invented.
VI: Tiến độ cycle suy ra từ timestamp đã lưu và không bao giờ bịa ra.
"""
from datetime import datetime, timedelta

from app.modules.cycles import api as native_cycles
from app.modules.cycles.api import _cycle_progress

START = datetime(2026, 11, 2)


def link(created, *, completed=None, started=False, updated=None):
    return {
        "created_at": START + timedelta(days=created, hours=9),
        "completed_at": START + timedelta(days=completed, hours=17) if completed is not None else None,
        "status_category": "STARTED" if started else ("COMPLETED" if completed is not None else "UNSTARTED"),
        "updated_at": START + timedelta(days=updated if updated is not None else created, hours=10),
    }


def test_scope_growth_and_completion_come_from_timestamps(monkeypatch):
    monkeypatch.setattr(native_cycles, "utcnow", lambda: START + timedelta(days=10))
    cycle = {"start_date": START, "end_date": START + timedelta(days=2), "created_at": START, "status": "COMPLETED"}
    # One issue from day 0, completed on day 1; one added on day 1 and started on day 2.
    # VI: Một issue từ ngày 0, xong ở ngày 1; một issue thêm vào ngày 1 và bắt đầu ở ngày 2.
    progress = _cycle_progress(cycle, [link(0, completed=1), link(1, started=True, updated=2)])
    assert (progress["scope"], progress["scopeDelta"], progress["started"], progress["completed"]) == (2, 100, 1, 1)
    assert progress["burnup"] == [
        {"date": "2026-11-02", "scope": 1, "started": 0, "completed": 0, "ideal": 0},
        {"date": "2026-11-03", "scope": 2, "started": 1, "completed": 1, "ideal": 1},
        {"date": "2026-11-04", "scope": 2, "started": 2, "completed": 1, "ideal": 2},
    ]


def test_an_active_cycle_stops_at_today(monkeypatch):
    monkeypatch.setattr(native_cycles, "utcnow", lambda: START + timedelta(days=1, hours=12))
    cycle = {"start_date": START, "end_date": START + timedelta(days=13), "created_at": START, "status": "ACTIVE"}
    progress = _cycle_progress(cycle, [link(0)])
    assert progress["burnup"][-1]["date"] == "2026-11-03"


def test_an_upcoming_or_canceled_cycle_has_no_progress():
    links = [link(0, completed=1), link(1, started=True)]
    for status in ("UPCOMING", "CANCELED"):
        cycle = {"start_date": START, "end_date": START + timedelta(days=13), "created_at": START, "status": status}
        assert _cycle_progress(cycle, links) == {
            "scope": 2, "scopeDelta": 0, "started": 0, "completed": 0, "burnup": []
        }
