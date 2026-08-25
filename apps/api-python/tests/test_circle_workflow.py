from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domains.workflow_catalog import DEFAULT_CIRCLE_ISSUE_STATUSES


class CircleWorkflowTests(unittest.TestCase):
    def test_default_issue_workflow_matches_circle_catalog(self) -> None:
        self.assertEqual(
            [name for name, _, _ in DEFAULT_CIRCLE_ISSUE_STATUSES],
            [
                'In Progress',
                'Technical Review',
                'Done',
                'Paused',
                'Todo',
                'Backlog',
                'Triage',
                'Idea',
                'Product Feedback',
                'Blocked',
                'Shipped',
                'Canceled',
                'Duplicate',
            ],
        )

    def test_default_issue_workflow_uses_valid_persisted_categories(self) -> None:
        categories = {category for _, category, _ in DEFAULT_CIRCLE_ISSUE_STATUSES}

        self.assertEqual(
            categories,
            {'TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED'},
        )


if __name__ == '__main__':
    unittest.main()
