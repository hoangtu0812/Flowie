from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.dates import parse_date
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.projects import team_access, workspace_access
from ..identity.auth import current_user
from ..work_items.issue_queries import issue_row
from .commands import (
    ADD_ISSUE_INSERT_ISSUE_CYCLES,
    CREATE_CYCLE_INSERT_CYCLES,
    DELETE_CYCLE_DELETE_CYCLES,
    RECONCILE_SCHEDULE_STATUSES_UPDATE_CYCLES,
    REMOVE_ISSUE_DELETE_ISSUE_CYCLES,
    update_cycle_update_cycles_sql,
)
from .queries import (
    CYCLE_ISSUES_SELECT_ISSUE_CYCLES,
    CYCLE_SELECT_CYCLES,
    CYCLE_SELECT_ISSUE_CYCLES,
    RECONCILE_SCHEDULE_STATUSES_SELECT_CYCLES,
    list_cycles_select_cycles_sql,
)

router = APIRouter(prefix='/api/v1/_native/cycles', tags=['native-cycles'])
# The active/upcoming cycle views already consume this exact read shape. Keep
# mutations staged privately until their UI adapters are audited one by one.
# VI: Màn cycle đang chạy/sắp tới đã dùng đúng dạng dữ liệu đọc này. Các thao
# tác ghi vẫn để ở prefix riêng cho đến khi từng adapter UI được kiểm tra.
public_router = APIRouter(prefix='/api/v1/cycles', tags=['cycles'])
CycleStatus = Literal['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELED']


class CreateCycleInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    teamId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    status: CycleStatus = 'UPCOMING'
    startDate: str | None = None
    endDate: str | None = None


class UpdateCycleInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    status: CycleStatus | None = None
    startDate: str | None = None
    endDate: str | None = None


class CycleIssueInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    issueId: str = Field(min_length=1)


def _day(value: datetime) -> datetime:
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


def _iso_day(value: datetime) -> str:
    return _day(value).date().isoformat()


def _cycle_progress(cycle: Mapping[Any, Any], links: list[dict[str, Any]]) -> dict[str, Any]:
    start = _day(cycle['start_date'] or cycle['created_at'])
    requested_end = _day(cycle['end_date'] or utcnow())
    today = _day(utcnow())
    end = min(requested_end, today) if cycle['status'] == 'ACTIVE' else requested_end
    final_day = max(start, end)
    if cycle['status'] in {'UPCOMING', 'CANCELED'}:
        return {'scope': len(links), 'scopeDelta': 0, 'started': 0, 'completed': 0, 'burnup': []}
    total_days = max(0, (final_day - start).days)
    step = max(1, (total_days + 120) // 120)
    days = [start + timedelta(days=offset) for offset in range(0, total_days + 1, step)]
    if not days or days[-1] != final_day:
        days.append(final_day)
    burnup: list[dict[str, Any]] = []
    for day in days:
        cutoff = day + timedelta(days=1) - timedelta(microseconds=1)
        linked = [link for link in links if link['created_at'] <= cutoff]
        completed = sum(1 for link in linked if link['completed_at'] and link['completed_at'] <= cutoff)
        current_started = sum(
            1
            for link in linked
            if link['status_category'] == 'STARTED' and link['updated_at'] <= cutoff
        )
        elapsed = 1 if total_days == 0 else (day - start).days / total_days
        burnup.append({
            'date': _iso_day(day),
            'scope': len(linked),
            'started': completed + current_started,
            'completed': completed,
            'ideal': round(len(links) * min(1, max(0, elapsed))),
        })
    initial_scope = burnup[0]['scope'] if burnup else 0
    scope = burnup[-1]['scope'] if burnup else len(links)
    return {
        'scope': scope,
        'scopeDelta': round(((scope - initial_scope) / initial_scope) * 100) if initial_scope else 0,
        'started': sum(1 for link in links if link['status_category'] == 'STARTED'),
        'completed': sum(1 for link in links if link['completed_at']),
        'burnup': burnup,
    }


async def _cycle(
    db: AsyncSession, cycle_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    result = await db.execute(
        CYCLE_SELECT_CYCLES,
        {'cycle_id': cycle_id, 'workspace_id': workspace_id},
    )
    cycle = result.mappings().first()
    if not cycle:
        raise ApiError(404, 'Cycle not found.', 'Not Found')
    await team_access(db, workspace_id, cycle['team_id'], user_id)
    links = await db.execute(
        CYCLE_SELECT_ISSUE_CYCLES,
        {'cycle_id': cycle_id},
    )
    link_rows = [dict(row) for row in links.mappings().all()]
    return {
        'id': cycle['id'],
        'workspaceId': cycle['workspace_id'],
        'teamId': cycle['team_id'],
        'name': cycle['name'],
        'description': cycle['description'],
        'status': cycle['status'],
        'startDate': cycle['start_date'],
        'endDate': cycle['end_date'],
        'createdAt': cycle['created_at'],
        'updatedAt': cycle['updated_at'],
        '_count': {'issueLinks': len(link_rows)},
        'progress': _cycle_progress(cycle, link_rows),
    }


def _validate_dates(start_date: datetime | None, end_date: datetime | None) -> None:
    if start_date and end_date and end_date < start_date:
        raise ApiError(400, 'Cycle end date must be after the start date.', 'Bad Request')


def _scheduled_status(
    status: CycleStatus,
    start_date: datetime | None,
    end_date: datetime | None,
) -> CycleStatus:
    """Resolve a non-terminal cycle state from its calendar boundaries."""
    if status == 'CANCELED':
        return status
    today = _day(utcnow())
    if end_date and _day(end_date) < today:
        return 'COMPLETED'
    if start_date and _day(start_date) <= today:
        return 'ACTIVE'
    return 'UPCOMING'


async def _reconcile_schedule_statuses(
    db: AsyncSession, workspace_id: str, team_id: str
) -> None:
    """Persist date-driven state changes so filtered Cycle views remain consistent."""
    result = await db.execute(
        RECONCILE_SCHEDULE_STATUSES_SELECT_CYCLES,
        {'workspace_id': workspace_id, 'team_id': team_id},
    )
    updates = []
    for cycle in result.mappings().all():
        resolved = _scheduled_status(cycle['status'], cycle['start_date'], cycle['end_date'])
        if resolved != cycle['status']:
            updates.append({'id': cycle['id'], 'status': resolved, 'updated_at': utcnow()})
    if updates:
        await db.execute(
            RECONCILE_SCHEDULE_STATUSES_UPDATE_CYCLES,
            updates,
        )
        await db.commit()


@router.get('')
@public_router.get('')
async def list_cycles(
    workspaceId: str = Query(min_length=1),
    teamId: str = Query(min_length=1),
    status: CycleStatus | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await workspace_access(db, workspaceId, user['id'])
    await team_access(db, workspaceId, teamId, user['id'])
    await _reconcile_schedule_statuses(db, workspaceId, teamId)
    params: dict[str, Any] = {'workspace_id': workspaceId, 'team_id': teamId}
    if status is not None:
        params['status'] = status
    result = await db.execute(list_cycles_select_cycles_sql(status is not None), params)
    return {'data': [await _cycle(db, row['id'], workspaceId, user['id']) for row in result.mappings().all()]}


@router.post('')
@public_router.post('')
async def create_cycle(
    payload: CreateCycleInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await workspace_access(db, payload.workspaceId, user['id'])
    await team_access(db, payload.workspaceId, payload.teamId, user['id'])
    start_date, end_date = parse_date(payload.startDate), parse_date(payload.endDate)
    _validate_dates(start_date, end_date)
    cycle_id, now = cuid(), utcnow()
    status = _scheduled_status(payload.status, start_date, end_date)
    await db.execute(
        CREATE_CYCLE_INSERT_CYCLES,
        {
            'id': cycle_id, 'workspace_id': payload.workspaceId, 'team_id': payload.teamId,
            'name': payload.name.strip(), 'description': payload.description, 'status': status,
            'start_date': start_date, 'end_date': end_date, 'now': now,
        },
    )
    await db.commit()
    return {'data': await _cycle(db, cycle_id, payload.workspaceId, user['id'])}


@router.patch('/{cycle_id}')
@public_router.patch('/{cycle_id}')
async def update_cycle(
    cycle_id: str,
    payload: UpdateCycleInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    current = await _cycle(db, cycle_id, workspaceId, user['id'])
    values = payload.model_dump(exclude_unset=True)
    start_date = parse_date(values['startDate']) if 'startDate' in values else current['startDate']
    end_date = parse_date(values['endDate']) if 'endDate' in values else current['endDate']
    _validate_dates(start_date, end_date)
    requested_status = values.get('status', current['status'])
    schedule_changed = 'startDate' in values or 'endDate' in values
    resolved_status = (
        current['status']
        if not schedule_changed and 'status' not in values
        else requested_status
        if values.get('status') in {'COMPLETED', 'CANCELED'}
        else _scheduled_status(requested_status, start_date, end_date)
    )
    columns = {'name': 'name', 'description': 'description', 'startDate': 'start_date', 'endDate': 'end_date'}
    sets: list[str] = []
    params: dict[str, Any] = {'cycle_id': cycle_id, 'now': utcnow()}
    for field, column in columns.items():
        if field in values:
            params[field] = parse_date(values[field]) if field in {'startDate', 'endDate'} else values[field]
            if field == 'name' and isinstance(params[field], str):
                params[field] = params[field].strip()
            sets.append(f'{column} = :{field}')
    if resolved_status != current['status']:
        params['status'] = resolved_status
        sets.append('status = :status')
    if sets:
        await db.execute(update_cycle_update_cycles_sql(sets), params)
        await db.commit()
    return {'data': await _cycle(db, cycle_id, workspaceId, user['id'])}


@router.post('/{cycle_id}/issues')
@public_router.post('/{cycle_id}/issues')
async def add_issue(
    cycle_id: str,
    payload: CycleIssueInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    cycle = await _cycle(db, cycle_id, payload.workspaceId, user['id'])
    issue = await issue_row(db, payload.issueId, payload.workspaceId, user['id'])
    if issue['teamId'] != cycle['teamId']:
        raise ApiError(404, 'Issue not found for this team.', 'Not Found')
    await db.execute(
        ADD_ISSUE_INSERT_ISSUE_CYCLES,
        {'issue_id': payload.issueId, 'cycle_id': cycle_id},
    )
    await db.commit()
    return {'data': {'issueId': payload.issueId, 'cycleId': cycle_id}}


@router.get('/{cycle_id}/issues')
@public_router.get('/{cycle_id}/issues')
async def cycle_issues(
    cycle_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _cycle(db, cycle_id, workspaceId, user['id'])
    result = await db.execute(
        CYCLE_ISSUES_SELECT_ISSUE_CYCLES,
        {'cycle_id': cycle_id},
    )
    return {'data': [await issue_row(db, row['issue_id'], workspaceId, user['id']) for row in result.mappings().all()]}


@router.delete('/{cycle_id}/issues/{issue_id}')
@public_router.delete('/{cycle_id}/issues/{issue_id}')
async def remove_issue(
    cycle_id: str,
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _cycle(db, cycle_id, workspaceId, user['id'])
    deleted = await db.execute(
        REMOVE_ISSUE_DELETE_ISSUE_CYCLES,
        {'cycle_id': cycle_id, 'issue_id': issue_id},
    )
    if not deleted.mappings().first():
        raise ApiError(404, 'Issue is not in this cycle.', 'Not Found')
    await db.commit()
    return {'data': {'issueId': issue_id, 'cycleId': cycle_id, 'removed': True}}


@router.delete('/{cycle_id}')
async def delete_cycle(
    cycle_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _cycle(db, cycle_id, workspaceId, user['id'])
    await db.execute(DELETE_CYCLE_DELETE_CYCLES, {'cycle_id': cycle_id, 'workspace_id': workspaceId})
    await db.commit()
    return {'data': {'id': cycle_id, 'deleted': True}}
