from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domains.team_insights import (
    digest_cutoff_utc,
    load_band,
    pick_candidate,
    seconds_until_next_digest,
    workload_score,
)


class WorkloadScoringTests(unittest.TestCase):
    def test_score_combines_effort_priority_and_overdue(self) -> None:
        score = workload_score(4.0, {"HIGH": 2, "LOW": 1}, 1)
        self.assertAlmostEqual(score, 4.0 + 2 * 2.0 + 0.5 + 2.0)

    def test_empty_workload_scores_zero(self) -> None:
        self.assertEqual(workload_score(0.0, {}, 0), 0.0)

    def test_band_follows_velocity_ratio(self) -> None:
        self.assertEqual(load_band(4.0, 10.0), "healthy")
        self.assertEqual(load_band(10.0, 10.0), "busy")
        self.assertEqual(load_band(15.0, 10.0), "overloaded")

    def test_band_is_unknown_without_velocity(self) -> None:
        self.assertEqual(load_band(5.0, 0.0), "unknown")


class AssignmentPickTests(unittest.TestCase):
    def test_lowest_score_wins(self) -> None:
        candidates = [
            {"user_id": "u1", "name": "An", "score": 8.0, "top_labels": []},
            {"user_id": "u2", "name": "Binh", "score": 3.0, "top_labels": []},
        ]
        chosen, matched = pick_candidate(candidates, set())
        self.assertEqual(chosen["user_id"], "u2")
        self.assertEqual(matched, [])

    def test_shared_labels_reduce_effective_score(self) -> None:
        candidates = [
            {"user_id": "u1", "name": "An", "score": 4.0, "top_labels": []},
            {
                "user_id": "u2",
                "name": "Binh",
                "score": 5.0,
                "top_labels": [{"id": "bug", "name": "Bug"}],
            },
        ]
        chosen, matched = pick_candidate(candidates, {"bug"})
        self.assertEqual(chosen["user_id"], "u2")
        self.assertEqual(matched, ["Bug"])


class DigestScheduleTests(unittest.TestCase):
    def test_next_run_is_tomorrow_after_digest_hour(self) -> None:
        now = datetime(2026, 9, 9, 9, 0, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))
        seconds = seconds_until_next_digest(now.astimezone(timezone.utc))
        self.assertAlmostEqual(seconds, 23 * 3600, delta=2.0)

    def test_next_run_is_today_before_digest_hour(self) -> None:
        now = datetime(2026, 9, 9, 6, 0, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))
        seconds = seconds_until_next_digest(now.astimezone(timezone.utc))
        self.assertAlmostEqual(seconds, 2 * 3600, delta=2.0)

    def test_cutoff_is_today_08h_naive_utc(self) -> None:
        now = datetime(2026, 9, 9, 15, 0, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))
        cutoff = digest_cutoff_utc(now.astimezone(timezone.utc))
        self.assertEqual(cutoff, datetime(2026, 9, 9, 1, 0))
        self.assertIsNone(cutoff.tzinfo)


if __name__ == "__main__":
    unittest.main()
