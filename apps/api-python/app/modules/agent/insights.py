"""Read-only answers built from workspace data, limited to the teams the asker can read, and the tools the model may call.

VI: Câu trả lời chỉ đọc dựng từ dữ liệu workspace, giới hạn trong các team người hỏi được đọc, và các tool model được gọi.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from ..teams.insights_api import (
    hcm_today,
    workload_report,
)
from .ask import InsightTool
from .intents import (
    DEADLINE_LISTED_ISSUES,
    DEADLINE_WINDOW_DAYS,
    _is_cycle_progress_question,
    _is_deadline_question,
    _is_initiative_delivery_question,
    _is_issue_assignee_question,
    _is_issue_count_question,
    _is_issue_status_question,
    _is_overdue_issue_question,
    _is_project_delivery_question,
    _is_project_progress_question,
    _is_stale_issue_question,
    _is_workload_question,
)
from .models import ReadOnlyCapability, ReadOnlyInsight
from .queries import (
    CYCLE_PROGRESS_INSIGHT_SELECT_CYCLES,
    DEADLINE_INSIGHT_SELECT_ISSUES,
    DEADLINE_INSIGHT_SELECT_TEAMS,
    INITIATIVE_DELIVERY_INSIGHT_SELECT_INITIATIVES,
    ISSUE_ASSIGNEE_INSIGHT_SELECT_ISSUES,
    ISSUE_COUNT_INSIGHT_SELECT_ISSUES,
    ISSUE_STATUS_INSIGHT_SELECT_ISSUES,
    MEMBER_TEAMS_SELECT_TEAMS,
    OVERDUE_ISSUE_INSIGHT_SELECT_ISSUES,
    OVERDUE_ISSUE_INSIGHT_SELECT_ISSUES_2,
    PROJECT_DELIVERY_INSIGHT_SELECT_PROJECTS,
    PROJECT_PROGRESS_INSIGHT_SELECT_PROJECTS,
    STALE_ISSUE_INSIGHT_SELECT_ISSUES,
    WORKLOAD_INSIGHT_SELECT_ISSUES,
    WORKLOAD_INSIGHT_SELECT_TEAMS,
)


async def _overdue_issue_insight(
    db: AsyncSession, workspace_id: str, user_id: str, *, team_ids: list[str] | None = None
) -> ReadOnlyInsight:
    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()
    params = {'workspace_id': workspace_id, 'user_id': user_id, 'today': today, 'team_ids': team_ids}
    summary = await db.execute(
        OVERDUE_ISSUE_INSIGHT_SELECT_ISSUES,
        params,
    )
    totals = summary.mappings().one()
    by_team = await db.execute(
        OVERDUE_ISSUE_INSIGHT_SELECT_ISSUES_2,
        params,
    )
    teams = [dict(row) for row in by_team.mappings().all()]
    team_breakdown = ', '.join(f"{team['name']}: {team['total']}" for team in teams)
    if totals['total']:
        content = (
            f"Hiện có {totals['total']} issue đang trễ hạn, tính đến {today.isoformat()}. "
            f"Chúng thuộc {totals['team_count']} team bạn có quyền xem; issue trễ lâu nhất là {totals['longest_days']} ngày."
        )
        if team_breakdown:
            content += f" Theo team: {team_breakdown}."
    else:
        content = f"Không có issue nào đang trễ hạn tính đến {today.isoformat()} trong các team bạn có quyền xem."
    return {
        'capability': 'issues.overdue',
        'content': content,
        'data': {'asOfDate': today.isoformat(), 'total': totals['total'], 'teamCount': totals['team_count'], 'longestDays': totals['longest_days'], 'teams': teams},
    }


def _named_teams(teams: list[dict[str, Any]], message: str) -> list[dict[str, Any]]:
    """Teams whose identifier ("DTD") or name appears in ``message`` as a whole word, ignoring case.

    Only the asker's own teams are passed in, so naming another team never widens what they see.
    VI: Các team có mã ("DTD") hoặc tên xuất hiện trong ``message`` dưới dạng từ nguyên, không phân
    VI: biệt hoa thường. Chỉ team của chính người hỏi được truyền vào, nên nêu team khác không mở rộng
    VI: phạm vi họ được xem.
    """
    normalized = message.casefold()
    return [
        team for team in teams
        if any(
            re.search(rf'(?<![\w-]){re.escape(term.casefold())}(?![\w-])', normalized)
            for term in (team['identifier'], team['name']) if term
        )
    ]


async def _team_scope(db: AsyncSession, workspace_id: str, user_id: str, message: str) -> list[dict[str, Any]]:
    """The asker's teams named in ``message``; empty when it names none, meaning every team.
    VI: Các team của người hỏi được nêu trong ``message``; rỗng khi không nêu team nào, nghĩa là mọi team.
    """
    if not message:
        return []
    rows = await db.execute(MEMBER_TEAMS_SELECT_TEAMS, {'workspace_id': workspace_id, 'user_id': user_id})
    return _named_teams([dict(row) for row in rows.mappings().all()], message)


async def _deadline_insight(db: AsyncSession, workspace_id: str, user_id: str, message: str = '') -> ReadOnlyInsight:
    """Open issues due today, due within the next week and overdue, per team the user belongs to.

    When ``message`` names some of the user's teams ("DTD", or a follow-up reply carrying it), the
    report covers only those teams; otherwise it covers all of them.
    VI: Khi ``message`` nêu tên một số team của người dùng ("DTD", hoặc câu trả lời nối tiếp chứa nó),
    VI: báo cáo chỉ tính các team đó; nếu không thì tính mọi team.

    Counts come from SQL so the answer never depends on the provider; the listed issues are the
    ones due today, capped so the reply stays readable.
    VI: Issue chưa xong đến hạn hôm nay, trong tuần tới và đã quá hạn, theo từng team người dùng
    VI: là thành viên. Số liệu lấy từ SQL nên câu trả lời không phụ thuộc provider; danh sách chỉ
    VI: nêu issue đến hạn hôm nay, có giới hạn để câu trả lời dễ đọc.
    """
    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()
    window_end = today + timedelta(days=DEADLINE_WINDOW_DAYS)
    scope = await _team_scope(db, workspace_id, user_id, message)
    params = {
        'workspace_id': workspace_id, 'user_id': user_id, 'today': today, 'window_end': window_end,
        'team_ids': [team['id'] for team in scope] or None,
    }
    scope_names = ', '.join(team['name'] for team in scope)
    teams = [dict(row) for row in (await db.execute(DEADLINE_INSIGHT_SELECT_TEAMS, params)).mappings().all()]
    issues = [
        {**row, 'due_date': row['due_date'].isoformat()}
        for row in (dict(item) for item in (await db.execute(DEADLINE_INSIGHT_SELECT_ISSUES, params)).mappings().all())
    ]
    due_today = sum(team['due_today'] for team in teams)
    due_soon = sum(team['due_soon'] for team in teams)
    overdue = sum(team['overdue'] for team in teams)
    today_issues = [issue for issue in issues if issue['due_date'] == today.isoformat()][:DEADLINE_LISTED_ISSUES]
    if due_today:
        listed = '; '.join(
            f"{issue['identifier']} {issue['title']} ({issue['assignee'] or 'chưa phân công'})" for issue in today_issues
        )
        subject = f'team {scope_names} ' if scope else ''
        content = f'Hôm nay ({today.isoformat()}) {subject}có {due_today} issue chưa hoàn thành đến hạn: {listed}'
        content += f' và {due_today - len(today_issues)} issue khác.' if due_today > len(today_issues) else '.'
    else:
        where = f'team {scope_names}' if scope else 'các team bạn có quyền xem'
        content = f'Hôm nay ({today.isoformat()}) không có issue nào đến hạn trong {where}.'
    content += (
        f' Trong {DEADLINE_WINDOW_DAYS} ngày tới (đến {window_end.isoformat()}) còn {due_soon} issue đến hạn;'
        f' {overdue} issue đã quá hạn.'
    )
    if teams:
        content += ' Theo team: ' + '; '.join(
            f"{team['name']}: {team['due_today']} hôm nay, {team['due_soon']} sắp tới, {team['overdue']} quá hạn"
            for team in teams
        ) + '.'
    return {
        'capability': 'issues.overdue',
        'content': content,
        'data': {
            'asOfDate': today.isoformat(), 'windowEnd': window_end.isoformat(), 'teamScope': [team['name'] for team in scope],
            'dueToday': due_today, 'dueSoon': due_soon, 'overdue': overdue, 'teams': teams, 'issues': issues,
        },
    }


async def _issue_count_insight(db: AsyncSession, workspace_id: str, user_id: str, *, team_ids: list[str] | None = None) -> ReadOnlyInsight:
    result = await db.execute(ISSUE_COUNT_INSIGHT_SELECT_ISSUES, {'workspace_id': workspace_id, 'user_id': user_id, 'team_ids': team_ids})
    row = result.mappings().one()
    return {'capability': 'issues.count', 'content': f"Bạn có quyền xem {row['total']} issue: {row['open']} chưa hoàn thành và {row['completed']} đã hoàn thành.", 'data': dict(row)}


WORKLOAD_BAND_LABELS = {'healthy': 'ổn định', 'busy': 'bận', 'overloaded': 'quá tải', 'unknown': 'chưa rõ'}


async def _workload_insight(db: AsyncSession, workspace_id: str, user_id: str, *, team_ids: list[str] | None = None) -> ReadOnlyInsight:
    """Workspace-wide load overview built from the deterministic Phase-1 scores.

    Numbers come from SQL via team_insights; the agent only phrases them.
    """
    today = hcm_today()
    teams = await db.execute(
        WORKLOAD_INSIGHT_SELECT_TEAMS,
        {'workspace_id': workspace_id, 'user_id': user_id, 'team_ids': team_ids},
    )
    team_rows = [dict(row) for row in teams.mappings().all()]
    if not team_rows:
        return {
            'capability': 'team.workload',
            'content': 'Bạn chưa thuộc team nào trong workspace này nên chưa có dữ liệu khối lượng công việc.',
            'data': {'asOfDate': today, 'teams': []},
        }
    unassigned = await db.execute(
        WORKLOAD_INSIGHT_SELECT_ISSUES,
        {'workspace_id': workspace_id},
    )
    unassigned_by_team = {row['team_id']: row['total'] for row in unassigned.mappings().all()}
    summaries: list[dict[str, Any]] = []
    for team in team_rows:
        report = await workload_report(db, team['id'], workspace_id, today)
        members = sorted(report['members'], key=lambda member: member['score'], reverse=True)
        top = members[0] if members else None
        summaries.append({
            'teamId': team['id'], 'teamName': team['name'],
            'memberCount': len(members), 'averageScore': report['teamAverageScore'],
            'unassigned': unassigned_by_team.get(team['id'], 0),
            'topLoaded': {
                'name': top['name'], 'score': top['score'], 'band': top['band'],
                'openCount': top['openCount'], 'overdueCount': top['overdueCount'],
            } if top else None,
        })
    parts = []
    for summary in summaries:
        if summary['topLoaded']:
            top = summary['topLoaded']
            parts.append(
                f"{summary['teamName']}: TB {summary['averageScore']}, "
                f"tải nặng nhất {top['name']} (score {top['score']}, "
                f"{WORKLOAD_BAND_LABELS.get(top['band'], top['band'])}, "
                f"{top['openCount']} mở, {top['overdueCount']} trễ), "
                f"{summary['unassigned']} chưa gán"
            )
        else:
            parts.append(f"{summary['teamName']}: chưa có thành viên")
    content = (
        f"Khối lượng công việc tính đến {today} ({len(summaries)} team): " + '; '.join(parts) + '. '
        'Mở trang Members của team để xem chi tiết từng người và gợi ý phân bổ.'
    )
    return {'capability': 'team.workload', 'content': content, 'data': {'asOfDate': today, 'teams': summaries}}


async def _issue_status_insight(db: AsyncSession, workspace_id: str, user_id: str) -> ReadOnlyInsight:
    result = await db.execute(ISSUE_STATUS_INSIGHT_SELECT_ISSUES, {'workspace_id': workspace_id, 'user_id': user_id})
    rows = [dict(row) for row in result.mappings().all()]
    detail = ', '.join(f"{row['name']}: {row['total']}" for row in rows) or 'chưa có issue'
    return {'capability': 'issues.by_status', 'content': f'Issue theo trạng thái: {detail}.', 'data': {'statuses': rows}}


async def _issue_assignee_insight(db: AsyncSession, workspace_id: str, user_id: str) -> ReadOnlyInsight:
    result = await db.execute(ISSUE_ASSIGNEE_INSIGHT_SELECT_ISSUES, {'workspace_id': workspace_id, 'user_id': user_id})
    rows = [dict(row) for row in result.mappings().all()]
    detail = ', '.join(f"{row['name']}: {row['total']}" for row in rows) or 'chưa có issue'
    return {'capability': 'issues.by_assignee', 'content': f'Issue theo người phụ trách: {detail}.', 'data': {'assignees': rows}}


async def _project_progress_insight(db: AsyncSession, workspace_id: str, user_id: str) -> ReadOnlyInsight:
    result = await db.execute(PROJECT_PROGRESS_INSIGHT_SELECT_PROJECTS, {'workspace_id': workspace_id, 'user_id': user_id})
    rows = [dict(row) for row in result.mappings().all()]
    for row in rows:
        row['progressPercent'] = round(row['completed'] * 100 / row['total']) if row['total'] else 0
    detail = ', '.join(f"{row['identifier']}: {row['progressPercent']}% ({row['completed']}/{row['total']})" for row in rows) or 'chưa có dự án'
    return {'capability': 'projects.progress', 'content': f'Tiến độ dự án: {detail}.', 'data': {'projects': rows}}


def _project_delivery_reason(row: dict[str, Any], today: date) -> tuple[str, list[str]]:
    target_date = row['targetDate']
    reasons: list[str] = []
    if target_date and target_date < today:
        reasons.append(f"trễ {(today - target_date).days} ngày so với target {target_date.isoformat()}")
        state = 'delayed'
    elif row['health'] == 'off-track':
        reasons.append('health đang là Off track')
        state = 'at-risk'
    elif row['health'] == 'at-risk':
        reasons.append('health đang là At risk')
        state = 'at-risk'
    elif row['overdueIssues']:
        state = 'at-risk'
    elif row['health'] == 'on-track' and target_date:
        state = 'on-track'
    else:
        state = 'insufficient-data'
    if row['overdueIssues']:
        reasons.append(f"{row['overdueIssues']} issue chưa hoàn thành đã quá hạn")
    if state == 'insufficient-data':
        if not target_date:
            reasons.append('chưa có target date')
        if row['health'] == 'no-update':
            reasons.append('chưa có cập nhật health')
    return state, reasons


async def _project_delivery_insight(db: AsyncSession, workspace_id: str, user_id: str, *, team_ids: list[str] | None = None) -> ReadOnlyInsight:
    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()
    result = await db.execute(
        PROJECT_DELIVERY_INSIGHT_SELECT_PROJECTS,
        {'workspace_id': workspace_id, 'user_id': user_id, 'today': today, 'team_ids': team_ids},
    )
    rows: list[dict[str, Any]] = []
    for raw_row in result.mappings().all():
        row = {
            'name': raw_row['name'], 'identifier': raw_row['identifier'], 'health': raw_row['health'],
            'targetDate': raw_row['target_date'], 'total': raw_row['total'],
            'completed': raw_row['completed'], 'overdueIssues': raw_row['overdue_issues'],
        }
        row['progressPercent'] = round(row['completed'] * 100 / row['total']) if row['total'] else 0
        row['deliveryState'], row['reasons'] = _project_delivery_reason(row, today)
        rows.append(row)

    delayed = [row for row in rows if row['deliveryState'] == 'delayed']
    at_risk = [row for row in rows if row['deliveryState'] == 'at-risk']
    on_track = [row for row in rows if row['deliveryState'] == 'on-track']
    insufficient = [row for row in rows if row['deliveryState'] == 'insufficient-data']

    def describe(row: dict[str, Any]) -> str:
        detail = '; '.join(row['reasons']) or 'không có dấu hiệu chậm'
        return f"{row['identifier']} ({row['name']}): {detail}; tiến độ {row['progressPercent']}% ({row['completed']}/{row['total']})"

    sections: list[str] = []
    if delayed:
        sections.append('Dự án đang chậm: ' + '. '.join(describe(row) for row in delayed) + '.')
    else:
        sections.append(f'Không có dự án nào đã quá target date và chưa hoàn thành, tính đến {today.isoformat()}.')
    if at_risk:
        sections.append('Cần theo dõi: ' + '. '.join(describe(row) for row in at_risk) + '.')
    if on_track:
        sections.append('Đang ổn: ' + '. '.join(describe(row) for row in on_track) + '.')
    if insufficient:
        sections.append('Chưa thể đánh giá lịch: ' + '. '.join(describe(row) for row in insufficient) + '.')
    return {
        'capability': 'projects.delivery',
        'content': ' '.join(sections),
        'data': {
            'asOfDate': today.isoformat(), 'delayed': delayed, 'atRisk': at_risk,
            'onTrack': on_track, 'insufficientData': insufficient,
        },
    }


async def _stale_issue_insight(db: AsyncSession, workspace_id: str, user_id: str, *, team_ids: list[str] | None = None) -> ReadOnlyInsight:
    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()
    stale_since = today - timedelta(days=14)
    result = await db.execute(
        STALE_ISSUE_INSIGHT_SELECT_ISSUES,
        {'workspace_id': workspace_id, 'user_id': user_id, 'today': today, 'stale_since': stale_since, 'team_ids': team_ids},
    )
    rows = [
        {
            'identifier': row['identifier'], 'title': row['title'], 'updatedDate': row['updated_date'],
            'dueDate': row['due_date'], 'status': row['status_name'], 'inactiveDays': row['inactive_days'],
        }
        for row in result.mappings().all()
    ]
    if rows:
        detail = '. '.join(
            f"{row['identifier']} ({row['title']}): không cập nhật {row['inactiveDays']} ngày, trạng thái {row['status']}"
            + (f", quá hạn từ {row['dueDate'].isoformat()}" if row['dueDate'] and row['dueDate'] < today else '')
            for row in rows
        )
        content = f"Có {len(rows)} issue đang treo từ 14 ngày trở lên, tính đến {today.isoformat()}: {detail}."
    else:
        content = f"Không có issue nào chưa hoàn thành và không cập nhật trong ít nhất 14 ngày, tính đến {today.isoformat()}."
    return {
        'capability': 'issues.stale',
        'content': content,
        'data': {'asOfDate': today.isoformat(), 'staleAfterDays': 14, 'issues': rows},
    }


async def _initiative_delivery_insight(db: AsyncSession, workspace_id: str, user_id: str) -> ReadOnlyInsight:
    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()
    result = await db.execute(
        INITIATIVE_DELIVERY_INSIGHT_SELECT_INITIATIVES,
        {'workspace_id': workspace_id, 'user_id': user_id},
    )
    delayed: list[dict[str, Any]] = []
    at_risk: list[dict[str, Any]] = []
    insufficient: list[dict[str, Any]] = []
    for raw_row in result.mappings().all():
        target_date = raw_row['target_date']
        row = {
            'name': raw_row['name'], 'health': raw_row['health'], 'targetDate': target_date,
            'totalProjects': raw_row['total_projects'], 'completedProjects': raw_row['completed_projects'],
        }
        row['progressPercent'] = round(row['completedProjects'] * 100 / row['totalProjects']) if row['totalProjects'] else 0
        if target_date and target_date < today:
            row['deliveryState'] = 'delayed'
            row['reason'] = f"trễ {(today - target_date).days} ngày so với target {target_date.isoformat()}"
            delayed.append(row)
        elif row['health'] in {'at-risk', 'off-track'}:
            row['deliveryState'] = 'at-risk'
            row['reason'] = f"health đang là {row['health'].replace('-', ' ')}"
            at_risk.append(row)
        else:
            row['deliveryState'] = 'insufficient-data'
            row['reason'] = 'chưa có target date' if not target_date else 'chưa có dấu hiệu chậm'
            insufficient.append(row)

    def describe(row: dict[str, Any]) -> str:
        return f"{row['name']}: {row['reason']}; tiến độ project {row['progressPercent']}% ({row['completedProjects']}/{row['totalProjects']})"

    sections: list[str] = []
    if delayed:
        sections.append('Initiative đang trễ: ' + '. '.join(describe(row) for row in delayed) + '.')
    else:
        sections.append(f'Không có initiative nào đã quá target date và chưa hoàn thành, tính đến {today.isoformat()}.')
    if at_risk:
        sections.append('Initiative cần theo dõi: ' + '. '.join(describe(row) for row in at_risk) + '.')
    missing_dates = [row for row in insufficient if row['targetDate'] is None]
    if missing_dates:
        sections.append('Không thể đánh giá tiến độ lịch cho: ' + '. '.join(describe(row) for row in missing_dates) + '.')
    return {
        'capability': 'initiatives.delivery',
        'content': ' '.join(sections),
        'data': {'asOfDate': today.isoformat(), 'delayed': delayed, 'atRisk': at_risk, 'insufficientData': insufficient},
    }


async def _cycle_progress_insight(db: AsyncSession, workspace_id: str, user_id: str) -> ReadOnlyInsight:
    result = await db.execute(CYCLE_PROGRESS_INSIGHT_SELECT_CYCLES, {'workspace_id': workspace_id, 'user_id': user_id})
    rows = [dict(row) for row in result.mappings().all()]
    for row in rows:
        row['progressPercent'] = round(row['completed'] * 100 / row['total']) if row['total'] else 0
    detail = ', '.join(f"{row['name']}: {row['progressPercent']}% ({row['completed']}/{row['total']})" for row in rows) or 'chưa có cycle'
    return {'capability': 'cycles.progress', 'content': f'Tiến độ cycle: {detail}.', 'data': {'cycles': rows}}


READ_ONLY_CAPABILITIES: tuple[ReadOnlyCapability, ...] = (
    ('team.workload', _is_workload_question, _workload_insight),
    ('projects.delivery', _is_project_delivery_question, _project_delivery_insight),
    ('issues.stale', _is_stale_issue_question, _stale_issue_insight),
    ('initiatives.delivery', _is_initiative_delivery_question, _initiative_delivery_insight),
    ('issues.overdue', _is_overdue_issue_question, _overdue_issue_insight),
    # Deadlines share the overdue tool so workspaces that installed it get them without a migration.
    # VI: Deadline dùng chung tool quá hạn để workspace đã cài tool đó có ngay, không cần migration.
    ('issues.overdue', _is_deadline_question, _deadline_insight),
    ('issues.by_status', _is_issue_status_question, _issue_status_insight),
    ('issues.by_assignee', _is_issue_assignee_question, _issue_assignee_insight),
    ('projects.progress', _is_project_progress_question, _project_progress_insight),
    ('cycles.progress', _is_cycle_progress_question, _cycle_progress_insight),
    ('issues.count', _is_issue_count_question, _issue_count_insight),
)

TOOL_DETAILS = {
    'team.workload': ('Team workload', 'Summarize deterministic workload scores per team: most loaded member, average load and unassigned issues.'),
    'issues.count': ('Issue count', 'Count accessible issues, including open and completed totals.'),
    'issues.overdue': ('Deadlines and overdue issues', 'Report accessible open issues due today, due within the next 7 days, or past their due date.'),
    'issues.by_status': ('Issues by status', 'Break down accessible issues by workflow status.'),
    'issues.by_assignee': ('Issues by assignee', 'Break down accessible issues by assigned person.'),
    'projects.progress': ('Project progress', 'Show completion progress for accessible projects.'),
    'projects.delivery': ('Project delivery health', 'Identify delayed, at-risk, on-track, and insufficiently scheduled projects.'),
    'issues.stale': ('Stale issues', 'List accessible open issues that have not been updated for at least 14 days.'),
    'initiatives.delivery': ('Initiative delivery health', 'Identify delayed and at-risk initiatives using their target dates and health.'),
    'cycles.progress': ('Cycle progress', 'Show completion progress for accessible cycles.'),
    'workspace.analyst': ('Progress Q&A and reports', 'Answer open questions about progress, workload and project status, and write detailed leadership reports, from the workspace data you can see.'),
}

def _team_insight(run: Callable[..., Awaitable[ReadOnlyInsight]]) -> Callable[[AsyncSession, str, str, str], Awaitable[ReadOnlyInsight]]:
    """Adapt an insight taking ``team_ids`` to the Q&A tool signature. A team the asker does not
    belong to is an error the model sees, never a silent widening to every team.
    VI: Chuyển insight nhận ``team_ids`` sang chữ ký tool hỏi đáp. Team người hỏi không thuộc về là
    VI: lỗi model nhìn thấy, không bao giờ âm thầm mở rộng ra mọi team.
    """
    async def scoped(db: AsyncSession, workspace_id: str, user_id: str, team: str) -> ReadOnlyInsight:
        scope = await _team_scope(db, workspace_id, user_id, team)
        if team and not scope:
            raise ApiError(404, f'No team of the asker matches "{team[:50]}". Call list_teams for valid identifiers.', 'Not Found')
        if run is _deadline_insight:
            return await _deadline_insight(db, workspace_id, user_id, team)
        return await run(db, workspace_id, user_id, team_ids=[item['id'] for item in scope] or None)
    return scoped


def _unscoped_insight(run: Callable[[AsyncSession, str, str], Awaitable[ReadOnlyInsight]]) -> Callable[[AsyncSession, str, str, str], Awaitable[ReadOnlyInsight]]:
    async def unscoped(db: AsyncSession, workspace_id: str, user_id: str, _team: str) -> ReadOnlyInsight:
        return await run(db, workspace_id, user_id)
    return unscoped


# The fixed reports as Q&A tools. Their numbers come from SQL, so the model can quote them.
# VI: Các báo cáo cố định dưới dạng tool hỏi đáp. Số liệu lấy từ SQL nên model trích dẫn được.
INSIGHT_TOOLS: tuple[InsightTool, ...] = (
    InsightTool('get_deadlines', 'Open issues due today and within the next 7 days and overdue counts, per team, listing the issues due in that window with assignee and status.', _team_insight(_deadline_insight)),
    InsightTool('get_overdue_summary', 'Count open issues past their due date per team, with the longest delay in days.', _team_insight(_overdue_issue_insight)),
    InsightTool('get_issue_counts', 'Count accessible issues: total, open and completed.', _team_insight(_issue_count_insight)),
    InsightTool('get_workload', TOOL_DETAILS['team.workload'][1], _team_insight(_workload_insight)),
    InsightTool('get_project_delivery', TOOL_DETAILS['projects.delivery'][1], _team_insight(_project_delivery_insight)),
    InsightTool('get_stale_issues', TOOL_DETAILS['issues.stale'][1], _team_insight(_stale_issue_insight)),
    InsightTool('get_issues_by_status', TOOL_DETAILS['issues.by_status'][1], _unscoped_insight(_issue_status_insight), scoped=False),
    InsightTool('get_issues_by_assignee', TOOL_DETAILS['issues.by_assignee'][1], _unscoped_insight(_issue_assignee_insight), scoped=False),
    InsightTool('get_project_progress', TOOL_DETAILS['projects.progress'][1], _unscoped_insight(_project_progress_insight), scoped=False),
    InsightTool('get_initiative_delivery', TOOL_DETAILS['initiatives.delivery'][1], _unscoped_insight(_initiative_delivery_insight), scoped=False),
    InsightTool('get_cycle_progress', TOOL_DETAILS['cycles.progress'][1], _unscoped_insight(_cycle_progress_insight), scoped=False),
)

def _matching_read_only_capability(message: str) -> ReadOnlyCapability | None:
    for _name, matches, execute in READ_ONLY_CAPABILITIES:
        if matches(message):
            return (_name, matches, execute)
    return None


