from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domains.agent import (
    _assignment_explainer_prompt,
    _is_assignment_request,
    _is_workload_question,
    _parse_assignment_notes,
    _resolve_assignment_team,
)

TEAMS = [
    {'id': 't1', 'name': 'Team Dev CDS', 'identifier': 'CDS'},
    {'id': 't2', 'name': 'Platform', 'identifier': 'PLT'},
]


class WorkloadQuestionTests(unittest.TestCase):
    def test_matches_vietnamese_and_english(self) -> None:
        self.assertTrue(_is_workload_question('Ai đang quá tải vậy?'))
        self.assertTrue(_is_workload_question('Who is overloaded right now?'))
        self.assertTrue(_is_workload_question('Workload team CDS thế nào?'))

    def test_rejects_creation_requests(self) -> None:
        self.assertFalse(_is_workload_question('Tạo workload report mới'))


class AssignmentRequestTests(unittest.TestCase):
    def test_matches_assignment_intent(self) -> None:
        self.assertTrue(_is_assignment_request('Gợi ý phân công team CDS'))
        self.assertTrue(_is_assignment_request('Suggest assignments for team Platform'))
        self.assertTrue(_is_assignment_request('Auto assign unassigned issues'))

    def test_rejects_creation_requests(self) -> None:
        self.assertFalse(_is_assignment_request('Tạo issue mới cho team CDS'))


class AssignmentTeamResolutionTests(unittest.TestCase):
    def test_matches_identifier(self) -> None:
        team, ambiguous = _resolve_assignment_team('Gợi ý phân công team CDS', TEAMS)
        self.assertEqual((team or {}).get('id'), 't1')
        self.assertFalse(ambiguous)

    def test_matches_name(self) -> None:
        team, ambiguous = _resolve_assignment_team('suggest for team Platform', TEAMS)
        self.assertEqual((team or {}).get('id'), 't2')
        self.assertFalse(ambiguous)

    def test_reports_missing_and_ambiguous(self) -> None:
        team, ambiguous = _resolve_assignment_team('gợi ý phân công', TEAMS)
        self.assertIsNone(team)
        self.assertFalse(ambiguous)


class AssignmentNotesTests(unittest.TestCase):
    def test_keeps_only_grounded_notes(self) -> None:
        raw = {'notes': {'i1': 'Phù hợp vì tải thấp.', 'ghost': 'Bịa.', 'i2': 42, 'i3': '   '}}
        self.assertEqual(
            _parse_assignment_notes(raw, {'i1', 'i2', 'i3'}),
            {'i1': 'Phù hợp vì tải thấp.'},
        )

    def test_rejects_non_dict_payloads(self) -> None:
        self.assertEqual(_parse_assignment_notes([], {'i1'}), {})
        self.assertEqual(_parse_assignment_notes({'notes': 'text'}, {'i1'}), {})

    def test_prompt_grounds_the_model(self) -> None:
        plan = {'suggestions': [{'issueId': 'i1'}]}
        prompt = _assignment_explainer_prompt(plan)
        self.assertIn('Do NOT change any IDs', prompt)
        self.assertIn(json.dumps(plan, ensure_ascii=False), prompt)


if __name__ == '__main__':
    unittest.main()
