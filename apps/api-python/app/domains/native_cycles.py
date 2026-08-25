from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .native_issues import _issue_row
from .native_projects import _date, _team_access, _workspace_access


router = APIRouter(prefix='/api/v1/_native/cycles', tags=['native-cycles'])
# The active/upcoming Circle views already consume this exact read shape. Keep
# mutations staged privately until their UI adapters are audited one by one.
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


def _cycle_progress(cycle: dict[str, Any], links: list[dict[str, Any]]) -> dict[str, Any]:
    start = _day(cycle['start_date'] or cycle['created_at'])
    requested_end = _day(cycle['end_date'] or _utcnow())
    today = _day(_utcnow())
    end = min(requested_end, today) if cycle['status'] == 'ACTIVE' else requested_end
    final_day = max(start, end)
    if cycle['status'] in {'UPCOMING', 'CANCELED'}:
        return {'scope': len(links), 'scopeDelta': 0, 'started': 0, 'completed': 0, 'burnup': []}
    total_days = max(0, (final_day - start).days)
    step = max(1, (total_days + 120) // 120)
    days = [start + timedelta(days=offset) for offset in range(0, total_days + 1, step)]
    if not days or days[-1] != final_day:
        days.append(final_day)
    burnup = []
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
        text('SELECT * FROM cycles WHERE id = :cycle_id AND workspace_id = :workspace_id LIMIT 1'),
        {'cycle_id': cycle_id, 'workspace_id': workspace_id},
    )
    cycle = result.mappings().first()
    if not cycle:
        raise ApiError(404, 'Cycle not found.', 'Not Found')
    await _team_access(db, workspace_id, cycle['team_id'], user_id)
    links = await db.execute(
        text(
            '''SELECT ic.issue_id, ic.created_at, i.updated_at, i.completed_at, s.category AS status_category
               FROM issue_cycles ic
               JOIN issues i ON i.id = ic.issue_id
               JOIN issue_statuses s ON s.id = i.status_id
               WHERE ic.cycle_id = :cycle_id AND i.archived_at IS NULL
               ORDER BY ic.created_at'''
        ),
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


@router.get('')
@public_router.get('')
async def list_cycles(
    workspaceId: str = Query(min_length=1),
    teamId: str = Query(min_length=1),
    status: CycleStatus | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    await _team_access(db, workspaceId, teamId, user['id'])
    result = await db.execute(
        text(
            '''SELECT id FROM cycles WHERE workspace_id = :workspace_id AND team_id = :team_id
               AND (:status IS NULL OR status = :status)
               ORDER BY start_date DESC NULLS LAST, created_at DESC'''
        ),
        {'workspace_id': workspaceId, 'team_id': teamId, 'status': status},
    )
    return {'data': [await _cycle(db, row['id'], workspaceId, user['id']) for row in result.mappings().all()]}


@router.post('')
async def create_cycle(
    payload: CreateCycleInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user['id'])
    await _team_access(db, payload.workspaceId, payload.teamId, user['id'])
    start_date, end_date = _date(payload.startDate), _date(payload.endDate)
    _validate_dates(start_date, end_date)
    cycle_id, now = _cuid(), _utcnow()
    await db.execute(
        text(
            '''INSERT INTO cycles (id, workspace_id, team_id, name, description, status, start_date, end_date, created_at, updated_at)
               VALUES (:id, :workspace_id, :team_id, :name, :description, :status, :start_date, :end_date, :now, :now)'''
        ),
        {
            'id': cycle_id, 'workspace_id': payload.workspaceId, 'team_id': payload.teamId,
            'name': payload.name.strip(), 'description': payload.description, 'status': payload.status,
            'start_date': start_date, 'end_date': end_date, 'now': now,
        },
    )
    await db.commit()
    return {'data': await _cycle(db, cycle_id, payload.workspaceId, user['id'])}


@router.patch('/{cycle_id}')
async def update_cycle(
    cycle_id: str,
    payload: UpdateCycleInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    current = await _cycle(db, cycle_id, workspaceId, user['id'])
    values = payload.model_dump(exclude_unset=True)
    start_date = _date(values['startDate']) if 'startDate' in values else current['startDate']
    end_date = _date(values['endDate']) if 'endDate' in values else current['endDate']
    _validate_dates(start_date, end_date)
    columns = {'name': 'name', 'description': 'description', 'status': 'status', 'startDate': 'start_date', 'endDate': 'end_date'}
    sets, params = [], {'cycle_id': cycle_id, 'now': _utcnow()}
    for field, column in columns.items():
        if field in values:
            params[field] = _date(values[field]) if field in {'startDate', 'endDate'} else values[field]
            if field == 'name' and isinstance(params[field], str):
                params[field] = params[field].strip()
            sets.append(f'{column} = :{field}')
    if sets:
        await db.execute(text(f"UPDATE cycles SET {', '.join(sets)}, updated_at = :now WHERE id = :cycle_id"), params)
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
    issue = await _issue_row(db, payload.issueId, payload.workspaceId, user['id'])
    if issue['teamId'] != cycle['teamId']:
        raise ApiError(404, 'Issue not found for this team.', 'Not Found')
    await db.execute(
        text('''INSERT INTO issue_cycles (issue_id, cycle_id) VALUES (:issue_id, :cycle_id)
                ON CONFLICT DO NOTHING'''),
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
        text('''SELECT issue_id FROM issue_cycles WHERE cycle_id = :cycle_id ORDER BY created_at DESC'''),
        {'cycle_id': cycle_id},
    )
    return {'data': [await _issue_row(db, row['issue_id'], workspaceId, user['id']) for row in result.mappings().all()]}


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
        text('DELETE FROM issue_cycles WHERE cycle_id = :cycle_id AND issue_id = :issue_id RETURNING issue_id'),
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
    await db.execute(text('DELETE FROM cycles WHERE id = :cycle_id AND workspace_id = :workspace_id'), {'cycle_id': cycle_id, 'workspace_id': workspaceId})
    await db.commit()
    return {'data': {'id': cycle_id, 'deleted': True}}
