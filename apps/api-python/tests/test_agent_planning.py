from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.errors import ApiError
from app.domains.agent import (
    AgentProposal,
    _matching_read_only_capability,
    _sse,
    _is_overdue_issue_question,
    _validate_proposal,
    _validated_endpoint,
)


class AgentPlanningTests(unittest.TestCase):
    def test_rejects_provider_url_outside_the_official_host(self) -> None:
        with self.assertRaises(ApiError):
            _validated_endpoint('OPENAI', 'https://credential-collector.example/v1')

    def test_accepts_the_google_api_endpoint(self) -> None:
        self.assertEqual(
            _validated_endpoint('GOOGLE', 'https://generativelanguage.googleapis.com/v1beta/'),
            'https://generativelanguage.googleapis.com/v1beta',
        )

    def test_rejects_an_issue_team_outside_the_workspace_catalog(self) -> None:
        proposal = AgentProposal.model_validate(
            {
                'summary': 'Draft one issue.',
                'issues': [
                    {
                        'key': 'outside-team',
                        'title': 'Outside workspace team',
                        'teamId': 'team-not-in-workspace',
                    }
                ],
            }
        )

        with self.assertRaises(ApiError):
            _validate_proposal(proposal, {'teams': [{'id': 'team-1'}], 'projects': []})

    def test_rejects_an_empty_actionable_plan(self) -> None:
        proposal = AgentProposal.model_validate({'summary': 'Nothing to create.'})

        with self.assertRaises(ApiError):
            _validate_proposal(proposal, {'teams': [], 'projects': []})

    def test_recognizes_overdue_issue_questions_in_vietnamese_and_english(self) -> None:
        self.assertTrue(_is_overdue_issue_question('Thống kê số issue đang trễ hạn'))
        self.assertTrue(_is_overdue_issue_question('How many issues are overdue?'))
        self.assertFalse(_is_overdue_issue_question('Create an issue to review overdue invoices'))

    def test_exposes_the_matching_read_only_capability(self) -> None:
        capability = _matching_read_only_capability('How many issues are overdue?')

        self.assertIsNotNone(capability)
        self.assertEqual(capability[0], 'issues.overdue')

    def test_serializes_sse_events(self) -> None:
        self.assertEqual(
            _sse('progress', {'id': 'workspace.catalog'}),
            'event: progress\ndata: {"id": "workspace.catalog"}\n\n',
        )


if __name__ == '__main__':
    unittest.main()
