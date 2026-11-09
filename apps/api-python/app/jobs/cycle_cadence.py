"""Keeps each team's cycles rolling: completes past ones, activates the current
one, and fills the calendar out to one cadence beyond today.

Ported from the retired BullMQ worker (`apps/worker/src/cycle-cadence.ts`).
Dates are whole UTC days throughout, as they were there: a cycle boundary must
not shift because the server runs in Ho Chi Minh time.

VI: Giữ cho cycle của mỗi team chạy liên tục: hoàn thành cycle đã qua, kích hoạt
cycle hiện tại, và lấp lịch tới một chu kỳ sau hôm nay. Chuyển từ worker BullMQ
đã nghỉ (`apps/worker/src/cycle-cadence.ts`). Toàn bộ tính theo ngày UTC trọn
vẹn, đúng như bên đó: ranh giới một cycle không được xê dịch chỉ vì server chạy
theo giờ Hồ Chí Minh.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..core.clock import _utcnow
from ..core.identifiers import _cuid
from ..core.utc_responses import utc_response_value

logger = logging.getLogger(__name__)


def start_of_utc_day(value: datetime) -> datetime:
    """Midnight UTC of the given instant, returned naive to match the columns.

    VI: Nửa đêm UTC của thời điểm đã cho, trả về dạng naive cho khớp với cột.
    """
    moment = value.astimezone(UTC).replace(tzinfo=None) if value.tzinfo else value
    return datetime(moment.year, moment.month, moment.day)


def _add_days(value: datetime, days: int) -> datetime:
    return value + timedelta(days=days)


def _next_cycle_name(names: set[str]) -> str:
    """First free ``Cycle N``, so a team that deleted Cycle 2 reuses the number.

    VI: Số ``Cycle N`` còn trống đầu tiên, nên team đã xoá Cycle 2 sẽ dùng lại
    VI: số đó.
    """
    number = 1
    while f'Cycle {number}' in names:
        number += 1
    name = f'Cycle {number}'
    names.add(name)
    return name


async def _create_generated_cycle(db: AsyncSession, team: dict[str, Any], names: set[str],
                                  start_date: datetime, end_date: datetime, status: str,
                                  writes_enabled: bool) -> bool:
    """Creates one cycle unless the team already has that exact span.

    The span is the identity: regenerating after a restart must not produce a
    second cycle covering the same days.

    VI: Tạo một cycle trừ khi team đã có đúng khoảng ngày đó. Khoảng ngày chính
    VI: là danh tính: sinh lại sau khi khởi động lại không được tạo thêm cycle
    VI: thứ hai phủ cùng những ngày ấy.
    """
    existing = await db.execute(
        text('SELECT id FROM cycles WHERE team_id = :team_id AND start_date = :start_date'
             ' AND end_date = :end_date LIMIT 1'),
        {'team_id': team['id'], 'start_date': start_date, 'end_date': end_date},
    )
    if existing.first() is not None:
        return False
    if not writes_enabled:
        _next_cycle_name(names)
        return True
    now = _utcnow()
    cycle_id = _cuid()
    await db.execute(
        text('''INSERT INTO cycles (id, workspace_id, team_id, name, status, start_date, end_date,
                                    created_at, updated_at)
                VALUES (:id, :workspace_id, :team_id, :name, :status, :start_date, :end_date,
                        :now, :now)'''),
        {'id': cycle_id, 'workspace_id': team['workspace_id'], 'team_id': team['id'],
         'name': _next_cycle_name(names), 'status': status,
         'start_date': start_date, 'end_date': end_date, 'now': now},
    )
    await db.execute(
        text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id,
                                        metadata, created_at)
                VALUES (:id, :workspace_id, NULL, 'cycle.auto_generated', 'cycle', :entity_id,
                        CAST(:metadata AS jsonb), :now)'''),
        {'id': _cuid(), 'workspace_id': team['workspace_id'], 'entity_id': cycle_id,
         # The span lands in a jsonb column that no response serialiser touches
         # again, so the offset has to be attached here. The worker this
         # replaces wrote a UTC designator and a reader of the audit trail
         # would otherwise take these for local times.
         # VI: Khoảng ngày rơi vào cột jsonb mà không bộ tuần tự hoá phản hồi
         # VI: nào chạm tới nữa, nên offset phải được gắn ngay ở đây. Worker mà
         # VI: nó thay thế có ghi chỉ báo UTC, và người đọc nhật ký kiểm toán
         # VI: nếu không sẽ hiểu đây là giờ địa phương.
         'metadata': json.dumps({'teamId': team['id'], 'cadenceWeeks': team['cycle_cadence_weeks'],
                                 'startDate': utc_response_value(start_date).isoformat(),
                                 'endDate': utc_response_value(end_date).isoformat()}), 'now': now},
    )
    return True


async def _apply_team_cadence(db: AsyncSession, team: dict[str, Any], today: datetime,
                              writes_enabled: bool) -> dict[str, int]:
    duration_days = team['cycle_cadence_weeks'] * 7
    cycles = (await db.execute(
        text('''SELECT id, name, status, start_date, end_date FROM cycles
                WHERE team_id = :team_id ORDER BY start_date ASC, created_at ASC'''),
        {'team_id': team['id']},
    )).mappings().all()
    names = {cycle['name'] for cycle in cycles}
    dated = [cycle for cycle in cycles if cycle['start_date'] and cycle['end_date']]

    completed = 0
    if writes_enabled:
        result = await db.execute(
            text('''UPDATE cycles SET status = 'COMPLETED', updated_at = :now
                    WHERE team_id = :team_id AND status IN ('ACTIVE', 'UPCOMING')
                      AND end_date < :today'''),
            {'team_id': team['id'], 'today': today, 'now': _utcnow()},
        )
        completed = cast(CursorResult[Any], result).rowcount or 0
    else:
        completed = (await db.execute(
            text('''SELECT count(*) FROM cycles WHERE team_id = :team_id
                    AND status IN ('ACTIVE', 'UPCOMING') AND end_date < :today'''),
            {'team_id': team['id'], 'today': today},
        )).scalar_one()

    # The cycle covering today wins the activation; when two overlap, the one
    # that started most recently is the current one.
    # VI: Cycle đang phủ hôm nay là cycle được kích hoạt; khi hai cycle chồng
    # VI: nhau, cycle bắt đầu muộn hơn mới là cycle hiện tại.
    covering = sorted(
        [cycle for cycle in dated if cycle['start_date'] <= today <= cycle['end_date']],
        key=lambda cycle: cycle['start_date'], reverse=True,
    )
    covering_cycle = covering[0] if covering else None

    activated = 0
    if covering_cycle is not None and covering_cycle['status'] == 'UPCOMING':
        if writes_enabled:
            result = await db.execute(
                text("UPDATE cycles SET status = 'ACTIVE', updated_at = :now"
                     " WHERE id = :id AND status = 'UPCOMING'"),
                {'id': covering_cycle['id'], 'now': _utcnow()},
            )
            activated = cast(CursorResult[Any], result).rowcount or 0
        else:
            activated = 1

    created = 0
    current_end = covering_cycle['end_date'] if covering_cycle else None
    if covering_cycle is None:
        # No cycle covers today, so one starts today — but it must stop short of
        # a cycle already planned ahead rather than overlap it.
        # VI: Không cycle nào phủ hôm nay nên tạo một cycle bắt đầu từ hôm nay —
        # VI: nhưng nó phải dừng trước một cycle đã lên lịch phía trước chứ không
        # VI: được chồng lên.
        next_future = next((cycle for cycle in dated if cycle['start_date'] > today), None)
        planned_end = _add_days(today, duration_days - 1)
        end_date = min(planned_end, _add_days(next_future['start_date'], -1)) if next_future else planned_end
        if end_date >= today:
            if await _create_generated_cycle(db, team, names, today, end_date, 'ACTIVE', writes_enabled):
                created += 1
            current_end = end_date

    latest_end = current_end
    for cycle in dated:
        if latest_end is None or cycle['end_date'] > latest_end:
            latest_end = cycle['end_date']
    horizon = _add_days(today, duration_days)
    cursor = latest_end
    while cursor is None or cursor < horizon:
        start_date = _add_days(cursor, 1) if cursor else today
        end_date = _add_days(start_date, duration_days - 1)
        status = 'ACTIVE' if start_date <= today else 'UPCOMING'
        if await _create_generated_cycle(db, team, names, start_date, end_date, status, writes_enabled):
            created += 1
        cursor = end_date

    return {'created': created, 'activated': activated, 'completed': completed}


async def run_cycle_cadence(factory: async_sessionmaker[AsyncSession], now: datetime | None = None,
                            writes_enabled: bool = False) -> dict[str, int]:
    """Roll every team that configured a cadence.

    With ``writes_enabled`` false nothing is written and the counts describe
    what the run would have done.

    VI: Cuộn lịch cho mọi team có cấu hình nhịp cycle. Khi ``writes_enabled`` là
    false thì không ghi gì và các con số mô tả việc lượt chạy đó lẽ ra đã làm.
    """
    today = start_of_utc_day(now or _utcnow())
    result = {'teams': 0, 'created': 0, 'activated': 0, 'completed': 0}
    async with factory() as db:
        teams = (await db.execute(
            text('''SELECT id, workspace_id, cycle_cadence_weeks FROM teams
                    WHERE archived_at IS NULL AND cycle_cadence_weeks IS NOT NULL''')
        )).mappings().all()
        result['teams'] = len(teams)
        for team in teams:
            if not team['cycle_cadence_weeks']:
                continue
            applied = await _apply_team_cadence(db, dict(team), today, writes_enabled)
            result['created'] += applied['created']
            result['activated'] += applied['activated']
            result['completed'] += applied['completed']
            if writes_enabled:
                await db.commit()
        if not writes_enabled:
            await db.rollback()
    return result
