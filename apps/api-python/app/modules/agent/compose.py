"""Write with Agent for project updates and comments, and drafting and applying project schedules.

VI: Write with Agent cho cập nhật và bình luận dự án, cùng soạn và áp dụng lịch dự án.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from fastapi import Depends, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.projects import (
    team_access,
    workspace_access,
)
from ..identity.auth import current_user
from .commands import (
    APPLY_PROJECT_SCHEDULE_INSERT_ACTIVITIES,
    APPLY_PROJECT_SCHEDULE_INSERT_AUDIT_LOGS,
    APPLY_PROJECT_SCHEDULE_UPDATE_ISSUES,
    PROJECT_FACTS_UPDATE_PROJECT_UPDATES,
)
from .planning import _call_checked
from .providers import UNTRUSTED_FACTS_RULE, _configured_provider
from .queries import (
    PROJECT_FACTS_SELECT_ISSUES,
    PROJECT_FACTS_SELECT_ISSUES_2,
    PROJECT_FACTS_SELECT_ISSUES_3,
    PROJECT_FACTS_SELECT_ISSUES_4,
    PROJECT_FACTS_SELECT_PROJECT_MILESTONES,
    PROJECT_FACTS_SELECT_PROJECTS,
    PROJECT_SCHEDULE_FACTS_SELECT_ISSUES,
    PROJECT_SCHEDULE_FACTS_SELECT_PROJECTS,
)

router = APIRouter(tags=['agent'])

class ComposeProjectUpdateInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    projectId: str = Field(min_length=1)
    kind: Literal['update', 'comment'] = 'update'
    health: str | None = None
    notes: str | None = Field(default=None, max_length=2000)


class ComposedText(BaseModel):
    """The provider is held to JSON mode, so the draft arrives in one field."""

    model_config = ConfigDict(extra='ignore')

    body: str = Field(min_length=1, max_length=4000)


class ProjectScheduleInput(BaseModel):
    workspaceId: str = Field(min_length=1)


class ScheduledIssueDraft(BaseModel):
    model_config = ConfigDict(extra='forbid')

    issueId: str = Field(min_length=1)
    startDate: str = Field(min_length=10, max_length=10)
    targetDate: str = Field(min_length=10, max_length=10)
    dueDate: str = Field(min_length=10, max_length=10)
    rationale: str = Field(min_length=1, max_length=320)


class ProjectScheduleProposal(BaseModel):
    model_config = ConfigDict(extra='forbid')

    summary: str = Field(min_length=1, max_length=1000)
    schedules: list[ScheduledIssueDraft] = Field(min_length=1, max_length=100)


class ApplyProjectScheduleInput(ProjectScheduleInput):
    schedules: list[ScheduledIssueDraft] = Field(min_length=1, max_length=100)


COMPOSE_UPDATE_PROMPT = (
    'You write project status updates for a work tracker. '
    'You are given facts about one project as JSON. Write the update the project lead would post: '
    'what the state is, what moved, and what is at risk or blocked. '
    'Always state how many issues are overdue (overdue.count, even when it is zero) and name the most important ones with their owner. '
    'Use only the facts provided - never invent issues, dates, names, or numbers, and omit anything the facts do not cover. '
    + UNTRUSTED_FACTS_RULE
    + ' Only authorNotes comes from the author. '
    'When authorNotes is present, that is the angle the author wants: build the update around it. '
    'When intendedHealth is present, the update must read consistently with it. '
    'Write short paragraphs without headings, then end with a line "Khuyến nghị:" (or "Recommendations:" in English) '
    'followed by 1 to 3 lines starting with "- ", each a concrete next action. At most 200 words. '
    'Write in the language the project name and issue titles are written in. '
    'Respond with JSON shaped exactly as {"body": "<the update>"}.'
)

COMPOSE_COMMENT_PROMPT = (
    'You write short comments on a project in a work tracker. '
    'You are given facts about one project as JSON. Write a comment raising what most needs attention, '
    'including how many issues are overdue when overdue.count is above zero, and one recommended action. '
    'Use only the facts provided - never invent issues, dates, names, or numbers. '
    + UNTRUSTED_FACTS_RULE
    + ' Only authorNotes comes from the author. '
    'When authorNotes is present, that is the point the author wants made. '
    'Write plain prose, no headings and no markdown, at most 80 words. '
    'Write in the language the project name and issue titles are written in. '
    'Respond with JSON shaped exactly as {"body": "<the comment>"}.'
)

PROJECT_SCHEDULE_PROMPT = (
    'You are a project scheduler for a work tracker. You receive one project and its open issues as JSON. '
    + UNTRUSTED_FACTS_RULE
    + ' Create a realistic schedule for every listed issue. Use the issue title, description, estimated effort, '
    'parent-child relationship, project start, and project target date. Do not invent issues or change scope. '
    'Each child issue must fit inside its parent issue window. Schedule only on or after schedulingStart and no later '
    'than the project target date. targetDate is the end of work; dueDate must be on or after targetDate and no later '
    'than the project target date. Spread work sensibly and respect dependency order implied by parent-child structure. '
    'Respond in the language used by the project and issue titles. Respond with JSON shaped exactly as '
    '{"summary":"<brief scheduling summary>","schedules":[{"issueId":"<id>","startDate":"YYYY-MM-DD",'
    '"targetDate":"YYYY-MM-DD","dueDate":"YYYY-MM-DD","rationale":"<short reason>"}]}.'
)


async def _project_facts(db: AsyncSession, workspace_id: str, project_id: str, user_id: str) -> dict[str, Any]:
    """Everything a draft is allowed to be built from, and nothing else."""
    result = await db.execute(
        PROJECT_FACTS_SELECT_PROJECTS,
        {'project_id': project_id, 'workspace_id': workspace_id},
    )
    project = result.mappings().first()
    if not project:
        raise ApiError(404, 'Project not found.', 'Not Found')
    if project['team_id']:
        await team_access(db, workspace_id, project['team_id'], user_id)

    statuses = await db.execute(
        PROJECT_FACTS_SELECT_ISSUES,
        {'project_id': project_id},
    )
    counts = {row['category']: row['total'] for row in statuses.mappings().all()}

    open_issues = await db.execute(
        PROJECT_FACTS_SELECT_ISSUES_2,
        {'project_id': project_id},
    )

    milestones = await db.execute(
        PROJECT_FACTS_SELECT_PROJECT_MILESTONES,
        {'project_id': project_id},
    )

    previous = await db.execute(
        PROJECT_FACTS_UPDATE_PROJECT_UPDATES,
        {'project_id': project_id},
    )

    # Delivery signals the update must report: overdue work (with owners), work
    # untouched for 14 days, unassigned open work and last week's throughput.
    # VI: Tín hiệu tiến độ bản cập nhật phải nêu: việc trễ (kèm người phụ trách),
    # VI: việc không cập nhật 14 ngày, việc mở chưa gán và số việc xong tuần qua.
    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()
    signal_params = {'project_id': project_id, 'today': today, 'stale_since': today - timedelta(days=14), 'week_ago': today - timedelta(days=7)}
    signals = (await db.execute(
        PROJECT_FACTS_SELECT_ISSUES_4,
        signal_params,
    )).mappings().one()
    overdue_issues = await db.execute(
        PROJECT_FACTS_SELECT_ISSUES_3,
        signal_params,
    )

    completed = counts.get('COMPLETED', 0)
    total = sum(counts.values())
    return {
        'today': today.isoformat(),
        'overdue': {
            'count': signals['overdue'],
            'issues': [
                {'identifier': row['identifier'], 'title': row['title'], 'assignee': row['assignee'], 'daysLate': row['days_late']}
                for row in overdue_issues.mappings().all()
            ],
        },
        'staleOpenCount': signals['stale'],
        'unassignedOpenCount': signals['unassigned'],
        'completedLast7Days': signals['completed_week'],
        'project': {
            'name': project['name'],
            'description': project['description'],
            'status': project['status'],
            'priority': project['priority'],
            'health': project['health'],
            'team': project['team_name'],
            'lead': project['lead_name'],
            'startDate': project['start_date'].isoformat() if project['start_date'] else None,
            'targetDate': project['target_date'].isoformat() if project['target_date'] else None,
        },
        'issueCounts': {
            **counts,
            'total': total,
            'completedPercent': round(completed * 100 / total) if total else 0,
        },
        'openIssues': [
            {
                'identifier': row['identifier'],
                'title': row['title'],
                'status': row['status'],
                'dueDate': row['due_date'].isoformat() if row['due_date'] else None,
            }
            for row in open_issues.mappings().all()
        ],
        'milestones': [
            {
                'title': row['title'],
                'targetDate': row['target_date'].isoformat() if row['target_date'] else None,
                'completed': row['completed_at'] is not None,
            }
            for row in milestones.mappings().all()
        ],
        'previousUpdates': [
            {'body': row['body'], 'health': row['health'], 'postedAt': row['created_at'].isoformat()}
            for row in previous.mappings().all()
        ],
    }


@router.post('/compose/project-update')
async def compose_project_update(
    payload: ComposeProjectUpdateInput,
    request: Request,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, str]]:
    """Draft a project update from the project's own record.

    Nothing is written: the text comes back for the author to edit and post,
    so the agent never publishes on someone's behalf.
    """
    await workspace_access(db, payload.workspaceId, user['id'])
    facts = await _project_facts(db, payload.workspaceId, payload.projectId, user['id'])
    if payload.health:
        facts['intendedHealth'] = payload.health
    if payload.notes and payload.notes.strip():
        facts['authorNotes'] = payload.notes.strip()

    provider = await _configured_provider(request, db, payload.workspaceId, user['id'])
    system_prompt = COMPOSE_UPDATE_PROMPT if payload.kind == 'update' else COMPOSE_COMMENT_PROMPT
    history = [{'role': 'user', 'content': json.dumps(facts, ensure_ascii=False)}]
    try:
        composed = await _call_checked(provider, 'agent.compose', system_prompt, history, ComposedText.model_validate_json)
    except ValidationError as error:
        raise ApiError(
            502, 'The AI provider returned a draft in an invalid format. Please try again.', 'Bad Gateway'
        ) from error
    return {'data': {'body': composed.body.strip()}}


def _date_only(value: date | datetime | None) -> str | None:
    if value is None:
        return None
    return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()


async def _project_schedule_facts(
    db: AsyncSession, workspace_id: str, project_id: str, user_id: str
) -> dict[str, Any]:
    """Load only open project work because completed work must never be rescheduled."""
    result = await db.execute(
        PROJECT_SCHEDULE_FACTS_SELECT_PROJECTS,
        {'project_id': project_id, 'workspace_id': workspace_id},
    )
    project = result.mappings().first()
    if not project:
        raise ApiError(404, 'Project not found.', 'Not Found')
    if project['team_id']:
        await team_access(db, workspace_id, project['team_id'], user_id)
    if not project['target_date']:
        raise ApiError(400, 'Set the project target date before asking AI to schedule its issues.', 'Bad Request')

    issues = await db.execute(
        PROJECT_SCHEDULE_FACTS_SELECT_ISSUES,
        {'project_id': project_id, 'workspace_id': workspace_id},
    )
    rows = issues.mappings().all()
    if not rows:
        raise ApiError(400, 'This project has no open issues to schedule.', 'Bad Request')
    if len(rows) > 100:
        raise ApiError(400, 'AI scheduling supports up to 100 open issues per project.', 'Bad Request')

    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()
    project_start = _date_only(project['start_date'])
    target_date = _date_only(project['target_date'])
    assert target_date is not None
    schedule_start = max(date.fromisoformat(project_start), today) if project_start else today
    if date.fromisoformat(target_date) < schedule_start:
        raise ApiError(400, 'The project target date must be today or later to create a new schedule.', 'Bad Request')
    return {
        'project': {
            'id': project['id'],
            'name': project['name'],
            'description': project['description'],
            'startDate': project_start,
            'targetDate': target_date,
        },
        'schedulingStart': schedule_start.isoformat(),
        'issues': [
            {
                'id': row['id'],
                'parentIssueId': row['parent_issue_id'],
                'identifier': row['identifier'],
                'title': row['title'],
                'description': (row['description'] or '')[:1600],
                'estimatedEffort': row['estimated_effort'],
                'status': row['status_name'],
                'currentStartDate': _date_only(row['start_date']),
                'currentTargetDate': _date_only(row['target_date']),
                'currentDueDate': _date_only(row['due_date']),
            }
            for row in rows
        ],
    }


def _parse_schedule_proposal(raw: str) -> ProjectScheduleProposal:
    try:
        return ProjectScheduleProposal.model_validate_json(raw)
    except ValidationError as first_error:
        decoder = json.JSONDecoder()
        for index, character in enumerate(raw):
            if character != '{':
                continue
            try:
                payload, _end = decoder.raw_decode(raw[index:])
                return ProjectScheduleProposal.model_validate(payload)
            except (json.JSONDecodeError, ValidationError):
                continue
        raise first_error


def _validate_schedule_proposal(proposal: ProjectScheduleProposal, facts: dict[str, Any]) -> None:
    issues = {issue['id']: issue for issue in facts['issues']}
    scheduled_ids = [schedule.issueId for schedule in proposal.schedules]
    if len(scheduled_ids) != len(set(scheduled_ids)) or set(scheduled_ids) != set(issues):
        raise ApiError(502, 'The AI provider must schedule every open project issue exactly once.', 'Bad Gateway')

    scheduling_start = date.fromisoformat(facts['schedulingStart'])
    project_target = date.fromisoformat(facts['project']['targetDate'])
    scheduled: dict[str, tuple[date, date, date]] = {}
    for schedule in proposal.schedules:
        try:
            start = date.fromisoformat(schedule.startDate)
            target = date.fromisoformat(schedule.targetDate)
            due = date.fromisoformat(schedule.dueDate)
        except ValueError as error:
            raise ApiError(502, 'The AI provider returned an invalid schedule date.', 'Bad Gateway') from error
        if start < scheduling_start or target < start or due < target or due > project_target:
            raise ApiError(502, 'The AI provider returned dates outside the project schedule.', 'Bad Gateway')
        scheduled[schedule.issueId] = (start, target, due)

    for issue_id, issue in issues.items():
        parent_id = issue['parentIssueId']
        if not parent_id or parent_id not in scheduled:
            continue
        child_start, child_target, child_due = scheduled[issue_id]
        parent_start, parent_target, parent_due = scheduled[parent_id]
        if child_start < parent_start or child_target > parent_target or child_due > parent_due:
            raise ApiError(502, 'The AI provider scheduled a sub-issue outside its parent issue window.', 'Bad Gateway')


@router.post('/projects/{project_id}/schedule')
async def draft_project_schedule(
    project_id: str,
    payload: ProjectScheduleInput,
    request: Request,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    """Return a validated proposal; schedule dates remain unchanged until the user applies it."""
    await workspace_access(db, payload.workspaceId, user['id'])
    facts = await _project_schedule_facts(db, payload.workspaceId, project_id, user['id'])
    provider = await _configured_provider(request, db, payload.workspaceId, user['id'])
    history = [{'role': 'user', 'content': json.dumps(facts, ensure_ascii=False)}]

    def valid_schedule(raw: str) -> ProjectScheduleProposal:
        proposal = _parse_schedule_proposal(raw)
        _validate_schedule_proposal(proposal, facts)
        return proposal

    try:
        proposal = await _call_checked(provider, 'agent.schedule', PROJECT_SCHEDULE_PROMPT, history, valid_schedule)
    except ValidationError as error:
        raise ApiError(502, 'The AI provider returned a schedule in an invalid format. Please try again.', 'Bad Gateway') from error
    issue_lookup = {issue['id']: issue for issue in facts['issues']}
    return {
        'data': {
            'summary': proposal.summary.strip(),
            'projectTargetDate': facts['project']['targetDate'],
            'schedules': [
                {
                    **schedule.model_dump(),
                    'identifier': issue_lookup[schedule.issueId]['identifier'],
                    'title': issue_lookup[schedule.issueId]['title'],
                }
                for schedule in proposal.schedules
            ],
        }
    }


@router.post('/projects/{project_id}/schedule/apply')
async def apply_project_schedule(
    project_id: str,
    payload: ApplyProjectScheduleInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    """Apply an already reviewed schedule atomically after revalidating current project scope."""
    await workspace_access(db, payload.workspaceId, user['id'])
    facts = await _project_schedule_facts(db, payload.workspaceId, project_id, user['id'])
    proposal = ProjectScheduleProposal(summary='Applied reviewed schedule.', schedules=payload.schedules)
    _validate_schedule_proposal(proposal, facts)
    now = utcnow()
    for schedule in payload.schedules:
        await db.execute(
            APPLY_PROJECT_SCHEDULE_UPDATE_ISSUES,
            {
                'issue_id': schedule.issueId,
                'project_id': project_id,
                'workspace_id': payload.workspaceId,
                'start_date': date.fromisoformat(schedule.startDate),
                'target_date': date.fromisoformat(schedule.targetDate),
                'due_date': date.fromisoformat(schedule.dueDate),
                'now': now,
            },
        )
        await db.execute(
            APPLY_PROJECT_SCHEDULE_INSERT_ACTIVITIES,
            {
                'id': cuid(),
                'workspace_id': payload.workspaceId,
                'issue_id': schedule.issueId,
                'actor_id': user['id'],
                'data': json.dumps({'fields': ['startDate', 'targetDate', 'dueDate'], 'source': 'ai-scheduling'}),
                'now': now,
            },
        )
    await db.execute(
        APPLY_PROJECT_SCHEDULE_INSERT_AUDIT_LOGS,
        {
            'id': cuid(),
            'workspace_id': payload.workspaceId,
            'actor_id': user['id'],
            'project_id': project_id,
            'metadata': json.dumps({'issueCount': len(payload.schedules)}),
            'now': now,
        },
    )
    await db.commit()
    return {'data': {'updatedIssueIds': [schedule.issueId for schedule in payload.schedules]}}


