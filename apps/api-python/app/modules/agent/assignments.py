"""Assignment suggestions in Agent chat: picking the team, explaining the plan and storing the turn.

VI: Gợi ý phân công trong Agent chat: chọn team, giải thích kế hoạch và lưu lượt chat.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from ..ai.calls import (
    call_provider,
)
from ..teams.insights_api import (
    assignment_suggestions,
    hcm_today,
)
from .models import ProgressReporter
from .planning import _persist_chat_turn, _persist_turn, _workspace_catalog
from .providers import UNTRUSTED_FACTS_RULE, _configured_provider

logger = logging.getLogger(__name__)

ASSIGNMENT_LIMIT = 10


def _resolve_assignment_team(
    message: str, teams: list[dict[str, Any]]
) -> tuple[dict[str, Any] | None, bool]:
    """Match a team by identifier or name; reports ambiguity instead of guessing."""
    normalized = message.casefold()
    matches = [
        team for team in teams
        if re.search(r'\b' + re.escape(team['identifier'].casefold()) + r'\b', normalized)
        or team['name'].casefold() in normalized
    ]
    if len(matches) == 1:
        return matches[0], False
    return None, len(matches) > 1


def _assignment_explainer_prompt(plan: dict[str, Any]) -> str:
    return f'''You explain a deterministic task-assignment plan. Do NOT change any IDs, names, or numbers; do NOT add or remove items.
{UNTRUSTED_FACTS_RULE}
Return exactly one JSON object: {{"notes": {{"<issueId>": "<one short sentence>"}}}}.
Write each note in Vietnamese, at most 25 words: why this person fits (lowest current load and/or shared skill labels from past completions). When nothing stands out, write "Tai hien tai thap nhat team." Omit issues you cannot comment on.
Deterministic plan:
{json.dumps(plan, ensure_ascii=False)}'''


def _parse_assignment_notes(raw: Any, valid_ids: set[str]) -> dict[str, str]:
    """Keep only grounded notes: known issue IDs with short string values."""
    if not isinstance(raw, dict):
        return {}
    notes = raw.get('notes')
    if not isinstance(notes, dict):
        return {}
    return {
        issue_id: note[:200]
        for issue_id, note in notes.items()
        if issue_id in valid_ids and isinstance(note, str) and note.strip()
    }


async def _explain_assignment(
    provider: dict[str, Any] | None, plan: dict[str, Any], valid_ids: set[str]
) -> dict[str, str]:
    """LLM-written rationales for a deterministic plan; never decides the plan."""
    if provider is None:
        return {}
    history = [{'role': 'user', 'content': _assignment_explainer_prompt(plan)}]
    try:
        raw = await call_provider(provider, 'agent.assignment', 'You explain assignment plans as JSON.', history)
        return _parse_assignment_notes(json.loads(raw), valid_ids)
    except Exception as error:
        logger.warning('Assignment explanation fell back to deterministic reasons: %s', error)
        return {}


async def _assignment_turn(
    request: Request,
    db: AsyncSession,
    *,
    workspace_id: str,
    message: str,
    conversation_id: str,
    conversation: Any,
    is_new_conversation: bool,
    user: Any,
    progress: ProgressReporter,
) -> dict[str, Any]:
    """Deterministic assignment drafts with LLM-written rationales.

    The plan (who gets what) always comes from team_insights; the provider
    only phrases one-line notes. Nothing changes until the user applies a row.
    """
    await progress({'id': 'assignment.catalog', 'label': 'Loading workspace teams', 'state': 'running', 'orb': 'searching'})
    catalog = await _workspace_catalog(db, workspace_id)
    await progress({'id': 'assignment.catalog', 'label': 'Workspace teams ready', 'state': 'completed', 'orb': 'searching'})
    team, ambiguous = _resolve_assignment_team(message, catalog['teams'])
    if team is None:
        names = ', '.join(team['name'] for team in catalog['teams'][:10]) or 'chưa có team'
        hint = (
            'Nhiều team khớp yêu cầu, hãy nêu rõ tên team.'
            if ambiguous else 'Hãy nêu rõ tên team (ví dụ: "gợi ý phân công team CDS").'
        )
        return await _persist_chat_turn(
            db,
            conversation_id=conversation_id,
            conversation=conversation,
            workspace_id=workspace_id,
            user_id=user['id'],
            is_new_conversation=is_new_conversation,
            user_content=message.strip(),
            assistant_content=f'{hint} Các team hiện có: {names}.',
            progress=progress,
        )
    await progress({'id': 'assignment.suggest', 'label': f"Scoring unassigned work in {team['name']}", 'state': 'running', 'orb': 'solving'})
    plan = await assignment_suggestions(db, team['id'], workspace_id, hcm_today(), ASSIGNMENT_LIMIT)
    await progress({'id': 'assignment.suggest', 'label': 'Assignment draft ready', 'state': 'completed', 'orb': 'solving'})
    if not plan['suggestions']:
        return await _persist_chat_turn(
            db,
            conversation_id=conversation_id,
            conversation=conversation,
            workspace_id=workspace_id,
            user_id=user['id'],
            is_new_conversation=is_new_conversation,
            user_content=message.strip(),
            assistant_content=(
                f"Team {team['name']} không còn issue mở nào chưa gán "
                f"(tổng {plan['unassignedTotal']} chưa gán). Không có gì để đề xuất."
            ),
            progress=progress,
        )
    await progress({'id': 'assignment.explain', 'label': 'Explaining the draft', 'state': 'running', 'orb': 'composing'})
    try:
        provider: dict[str, Any] | None = await _configured_provider(request, db, workspace_id, user['id'])
    except ApiError:
        provider = None
    valid_ids = {item['issueId'] for item in plan['suggestions']}
    notes = await _explain_assignment(provider, plan, valid_ids)
    await progress({'id': 'assignment.explain', 'label': 'Draft explained', 'state': 'completed', 'orb': 'composing'})
    items = [
        {
            'issueId': item['issueId'], 'identifier': item['identifier'], 'title': item['title'],
            'priority': item['priority'], 'estimatedEffort': item['estimatedEffort'],
            'labels': [label['name'] for label in item['labels']],
            'suggestedUserId': item['suggestedUserId'], 'suggestedUserName': item['suggestedUserName'],
            'reason': item['reason'], 'note': notes.get(item['issueId'], item['reason']),
        }
        for item in plan['suggestions']
    ]
    top = items[0]
    summary = (
        f"Đề xuất phân công cho team {team['name']}: {len(items)} issue "
        f"(trong tổng {plan['unassignedTotal']} chưa gán). "
        f"Ưu tiên {top['identifier']} → {top['suggestedUserName']}. "
        'Xem từng dòng bên dưới và bấm Áp dụng — chưa có gì thay đổi cho đến khi bạn duyệt.'
    )
    proposal = {
        'kind': 'assignment', 'teamId': team['id'], 'teamName': team['name'],
        'unassignedTotal': plan['unassignedTotal'], 'items': items,
    }
    await progress({'id': 'conversation.persist', 'label': 'Saving conversation', 'state': 'running', 'orb': 'shaping'})
    data = await _persist_turn(
        db,
        conversation_id=conversation_id,
        conversation=conversation,
        workspace_id=workspace_id,
        user_id=user['id'],
        is_new_conversation=is_new_conversation,
        user_content=message.strip(),
        assistant_content=summary,
        proposal=proposal,
    )
    await progress({'id': 'conversation.persist', 'label': 'Conversation saved', 'state': 'completed', 'orb': 'shaping'})
    data['responseType'] = 'ASSIGN_PROPOSAL'
    return data


