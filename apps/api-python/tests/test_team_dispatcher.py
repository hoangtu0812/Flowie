from __future__ import annotations

import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domains.team_dispatcher import (
    DispatcherSettingsInput,
    as_db_date,
    dispatch_cutoff_utc,
    dispatcher_report_lines,
    remaining_budget,
    seconds_until_next_dispatch,
)


class DispatcherBudgetTests(unittest.TestCase):
    def test_remaining_budget(self) -> None:
        self.assertEqual(remaining_budget(5, 2), 3)
        self.assertEqual(remaining_budget(5, 5), 0)
        self.assertEqual(remaining_budget(5, 9), 0)

    def test_db_date_param_is_a_date_object(self) -> None:
        """Regression: DATE columns need date objects, ISO strings crash asyncpg."""
        value = as_db_date("2026-09-10")
        self.assertIsInstance(value, date)
        self.assertEqual(value.isoformat(), "2026-09-10")

    def test_settings_input_bounds(self) -> None:
        settings = DispatcherSettingsInput.model_validate({"maxActionsPerDay": 10})
        self.assertEqual(settings.maxActionsPerDay, 10)
        self.assertTrue(settings.dryRun)
        with self.assertRaises(Exception):
            DispatcherSettingsInput.model_validate({"maxActionsPerDay": 0})
        with self.assertRaises(Exception):
            DispatcherSettingsInput.model_validate({"maxActionsPerDay": 21})


class DispatcherReportTests(unittest.TestCase):
    def test_report_lines_cover_actions(self) -> None:
        result = {
            "teamName": "CDS",
            "dryRun": False,
            "applied": [{"identifier": "CDS-1", "suggestedUserName": "An"}],
            "nudged": [{"identifier": "CDS-2", "assignee": "Binh"}],
            "wouldApply": [],
            "wouldNudge": [],
            "skippedBudget": 2,
        }
        lines = dispatcher_report_lines(result)
        self.assertIn("Team CDS", lines[0])
        self.assertTrue(any("CDS-1" in line and "An" in line for line in lines))
        self.assertTrue(any("CDS-2" in line and "Binh" in line for line in lines))
        self.assertTrue(any("budget" in line for line in lines))

    def test_dry_run_is_marked(self) -> None:
        result = {
            "teamName": "CDS",
            "dryRun": True,
            "applied": [],
            "nudged": [],
            "wouldApply": [{"identifier": "CDS-3", "suggestedUserName": "An"}],
            "wouldNudge": [],
            "skippedBudget": 0,
        }
        lines = dispatcher_report_lines(result)
        self.assertIn("[dry-run]", lines[0])
        self.assertTrue(any("Would assign CDS-3" in line for line in lines))


class DispatcherScheduleTests(unittest.TestCase):
    def test_cutoff_is_today_0830_naive_utc(self) -> None:
        now = datetime(2026, 9, 10, 15, 0, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))
        cutoff = dispatch_cutoff_utc(now.astimezone(timezone.utc))
        self.assertEqual(cutoff, datetime(2026, 9, 10, 1, 30))
        self.assertIsNone(cutoff.tzinfo)

    def test_next_run_skips_to_tomorrow_after_window(self) -> None:
        now = datetime(2026, 9, 10, 9, 0, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))
        seconds = seconds_until_next_dispatch(now.astimezone(timezone.utc))
        self.assertAlmostEqual(seconds, 23.5 * 3600, delta=2.0)


if __name__ == "__main__":
    unittest.main()
