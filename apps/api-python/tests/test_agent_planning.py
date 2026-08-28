from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.errors import ApiError
from app.domains.agent import (
    AgentProposal,
    ProjectScheduleProposal,
    _apply_personal_skill_defaults,
    _is_initiative_delivery_question,
    _is_bare_creation_request,
    _is_project_delivery_question,
    _is_stale_issue_question,
    _matching_read_only_capability,
    _parse_agent_proposal,
    _parse_schedule_proposal,
    _sse,
    _is_overdue_issue_question,
    _validate_proposal,
    _validate_schedule_proposal,
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

    def test_recognizes_delivery_insight_questions(self) -> None:
        self.assertTrue(_is_project_delivery_question('Dự án nào đang chậm?'))
        self.assertTrue(_is_project_delivery_question('Dự án nào đang có tiến độ tốt?'))
        self.assertTrue(_is_project_delivery_question('Which projects are at risk?'))
        self.assertFalse(_is_project_delivery_question('Tạo issue để xử lý dự án chậm'))
        self.assertTrue(_is_stale_issue_question('Issue nào treo lâu?'))
        self.assertTrue(_is_initiative_delivery_question('Initiatives nào đang trễ?'))

    def test_routes_project_delivery_questions_to_the_delivery_tool(self) -> None:
        capability = _matching_read_only_capability('Dự án nào đang chậm?')

        self.assertIsNotNone(capability)
        self.assertEqual(capability[0], 'projects.delivery')

    def test_recognizes_a_bare_creation_request(self) -> None:
        self.assertTrue(_is_bare_creation_request('Tạo dự án'))
        self.assertTrue(_is_bare_creation_request('Create an issue.'))
        self.assertFalse(_is_bare_creation_request('Tạo dự án website cho team General'))

    def test_parses_a_json_object_wrapped_by_provider_markdown(self) -> None:
        proposal = _parse_agent_proposal(
            '```json\n'
            '{"summary":"Need details.","requiresClarification":true,"questions":["Which team?"],"projects":[],"issues":[]}\n'
            '```'
        )

        self.assertTrue(proposal.requiresClarification)
        self.assertEqual(proposal.questions, ['Which team?'])

    def test_parses_a_schedule_wrapped_by_provider_markdown(self) -> None:
        proposal = _parse_schedule_proposal(
            '```json\n'
            '{"summary":"Schedule the discovery work first.","schedules":['
            '{"issueId":"issue-1","startDate":"2026-08-28","targetDate":"2026-08-29",'
            '"dueDate":"2026-08-29","rationale":"It is the first task."}]}'
            '\n```'
        )

        self.assertEqual(proposal.schedules[0].issueId, 'issue-1')

    def test_rejects_schedule_dates_outside_the_project_window(self) -> None:
        proposal = ProjectScheduleProposal.model_validate(
            {
                'summary': 'Schedule the issue.',
                'schedules': [
                    {
                        'issueId': 'issue-1',
                        'startDate': '2026-08-27',
                        'targetDate': '2026-08-29',
                        'dueDate': '2026-08-29',
                        'rationale': 'One day of work.',
                    }
                ],
            }
        )

        with self.assertRaises(ApiError):
            _validate_schedule_proposal(
                proposal,
                {
                    'schedulingStart': '2026-08-28',
                    'project': {'targetDate': '2026-09-10'},
                    'issues': [{'id': 'issue-1', 'parentIssueId': None}],
                },
            )

    def test_exposes_the_matching_read_only_capability(self) -> None:
        capability = _matching_read_only_capability('How many issues are overdue?')

        self.assertIsNotNone(capability)
        self.assertEqual(capability[0], 'issues.overdue')

    def test_matches_the_general_issue_count_tool(self) -> None:
        capability = _matching_read_only_capability('Team tôi đang có bao nhiêu issue?')

        self.assertIsNotNone(capability)
        self.assertEqual(capability[0], 'issues.count')

    def test_applies_personal_issue_defaults_only_to_missing_values(self) -> None:
        proposal = AgentProposal.model_validate(
            {
                'summary': 'Draft one issue.',
                'issues': [
                    {
                        'key': 'skill-defaults',
                        'title': 'Use defaults',
                        'teamId': 'team-1',
                    }
                ],
            }
        )

        _apply_personal_skill_defaults(
            proposal,
            {'issue.defaults': {'defaultPriority': 'HIGH', 'dueInDays': 3}},
        )

        self.assertEqual(proposal.issues[0].priority, 'HIGH')
        self.assertIsNotNone(proposal.issues[0].dueDate)

    def test_serializes_sse_events(self) -> None:
        self.assertEqual(
            _sse('progress', {'id': 'workspace.catalog'}),
            'event: progress\ndata: {"id": "workspace.catalog"}\n\n',
        )


if __name__ == '__main__':
    unittest.main()
