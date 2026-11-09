"""Team retention policies: auto-close stale open issues, auto-archive settled ones.

Ported from the retired BullMQ worker (`apps/worker/src/team-policies.ts`). The
eligibility rules decide which of a user's issues get cancelled and archived
without anyone asking, so each one is reproduced here deliberately rather than
approximated, and `writes_enabled` lets the job report what it would do before
it is trusted to do it.

VI: Chính sách lưu giữ của team: tự đóng issue mở đã lâu không động tới, tự lưu
trữ issue đã chốt. Chuyển từ worker BullMQ đã nghỉ
(`apps/worker/src/team-policies.ts`). Các điều kiện eligibility quyết định
issue nào của người dùng bị huỷ và lưu trữ mà không ai yêu cầu, nên từng điều
kiện được tái hiện có chủ ý chứ không làm gần đúng, và `writes_enabled` cho
phép job báo cáo việc nó định làm trước khi được tin để làm thật.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..core.clock import _utcnow
from ..core.identifiers import _cuid
from ..modules.operations.heartbeats import progress

logger = logging.getLogger(__name__)

OPEN_CATEGORIES = ('TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED')
CLOSED_CATEGORIES = ('COMPLETED', 'CANCELED')
DEFAULT_BATCH_SIZE = 200

# Both spellings of "cancelled" are accepted because a workspace may have named
# its own project status either way, and the original worker hard-coded all
# three alongside whatever the workspace configured.
# VI: Chấp nhận cả hai cách viết "cancelled" vì một workspace có thể đã đặt tên
# VI: project status theo cách nào cũng được, và worker gốc gài cứng cả ba cách
# VI: bên cạnh những gì workspace tự cấu hình.
BUILTIN_CLOSED_PROJECT_STATUSES = ('completed', 'canceled', 'cancelled')


def policy_cutoff(now: datetime, days: int) -> datetime:
    """Exact whole-day interval before ``now``, matching the worker's arithmetic.

    VI: Khoảng thời gian đúng bằng số ngày trọn vẹn trước ``now``, khớp với cách
    VI: tính của worker.
    """
    return now - timedelta(days=days)


# Issues eligible for auto-close: still open, untouched since the cutoff, not
# pinned by anything that signals the issue is still live — an active cycle, a
# recent comment or activity, an unfinished sub-issue, or a project that is
# still running. A due date in the future also protects it.
# VI: Issue đủ điều kiện tự đóng: còn mở, không ai động tới kể từ mốc cutoff, và
# VI: không bị giữ lại bởi bất cứ dấu hiệu nào cho thấy nó còn sống — cycle đang
# VI: chạy, comment hay activity gần đây, sub-issue chưa xong, hoặc project còn
# VI: hoạt động. Ngày đến hạn ở tương lai cũng bảo vệ nó.
_OPEN_ELIGIBILITY = '''
    issue.team_id = :team_id
    AND issue.archived_at IS NULL
    AND issue.updated_at <= :cutoff
    AND status.category = ANY(:open_categories)
    AND (issue.due_date IS NULL OR issue.due_date <= :now)
    AND NOT EXISTS (
        SELECT 1 FROM issue_cycles link JOIN cycles cycle ON cycle.id = link.cycle_id
        WHERE link.issue_id = issue.id AND cycle.status = 'ACTIVE')
    AND NOT EXISTS (
        SELECT 1 FROM comments comment
        WHERE comment.issue_id = issue.id AND comment.deleted_at IS NULL
          AND (comment.created_at > :cutoff OR comment.updated_at > :cutoff))
    AND NOT EXISTS (
        SELECT 1 FROM activities activity
        WHERE activity.issue_id = issue.id AND activity.created_at > :cutoff)
    AND NOT EXISTS (
        SELECT 1 FROM issues child JOIN issue_statuses child_status ON child_status.id = child.status_id
        WHERE child.parent_issue_id = issue.id AND child.archived_at IS NULL
          AND NOT (child_status.category = ANY(:closed_categories)))
    AND (
        issue.project_id IS NULL
        OR EXISTS (SELECT 1 FROM projects project
                   WHERE project.id = issue.project_id AND project.archived_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM projects project
                   WHERE project.id = issue.project_id AND project.archived_at IS NULL
                     AND project.status = ANY(:closed_project_statuses)))
'''

# Issues eligible for auto-archive: already completed or cancelled, settled
# since the cutoff, with nothing above or below them still moving — the parent
# must itself be closed or archived, every sub-issue must be closed and quiet,
# and no cycle may still be running or recently touched.
# VI: Issue đủ điều kiện tự lưu trữ: đã hoàn thành hoặc đã huỷ, yên kể từ mốc
# VI: cutoff, và không còn gì phía trên hay phía dưới nó chuyển động — issue cha
# VI: phải đã đóng hoặc đã lưu trữ, mọi sub-issue phải đã đóng và im, và không
# VI: cycle nào còn chạy hoặc vừa được động tới.
_CLOSED_ELIGIBILITY = '''
    issue.team_id = :team_id
    AND issue.archived_at IS NULL
    AND issue.updated_at <= :cutoff
    AND status.category = ANY(:closed_categories)
    AND NOT EXISTS (
        SELECT 1 FROM comments comment
        WHERE comment.issue_id = issue.id AND comment.deleted_at IS NULL
          AND (comment.created_at > :cutoff OR comment.updated_at > :cutoff))
    AND NOT EXISTS (
        SELECT 1 FROM activities activity
        WHERE activity.issue_id = issue.id AND activity.created_at > :cutoff)
    AND (
        issue.completed_at <= :cutoff OR issue.canceled_at <= :cutoff
        OR (issue.completed_at IS NULL AND issue.canceled_at IS NULL))
    AND (
        issue.parent_issue_id IS NULL
        OR EXISTS (SELECT 1 FROM issues parent
                   WHERE parent.id = issue.parent_issue_id AND parent.archived_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM issues parent
                   JOIN issue_statuses parent_status ON parent_status.id = parent.status_id
                   WHERE parent.id = issue.parent_issue_id AND parent.archived_at IS NULL
                     AND parent.updated_at <= :cutoff
                     AND parent_status.category = ANY(:closed_categories)))
    AND (
        issue.project_id IS NULL
        OR EXISTS (SELECT 1 FROM projects project
                   WHERE project.id = issue.project_id AND project.archived_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM projects project
                   WHERE project.id = issue.project_id AND project.archived_at IS NULL
                     AND project.updated_at <= :cutoff
                     AND project.status = ANY(:closed_project_statuses)))
    AND NOT EXISTS (
        SELECT 1 FROM issues child JOIN issue_statuses child_status ON child_status.id = child.status_id
        WHERE child.parent_issue_id = issue.id AND child.archived_at IS NULL
          AND (child.updated_at > :cutoff OR NOT (child_status.category = ANY(:closed_categories))))
    AND NOT EXISTS (
        SELECT 1 FROM issue_cycles link JOIN cycles cycle ON cycle.id = link.cycle_id
        WHERE link.issue_id = issue.id
          AND (cycle.status IN ('ACTIVE', 'UPCOMING')
               OR (cycle.status IN ('COMPLETED', 'CANCELED') AND cycle.updated_at > :cutoff)))
'''


async def _closed_project_status_names(db: AsyncSession, workspace_id: str) -> list[str]:
    rows = await db.execute(
        text("SELECT name FROM project_statuses WHERE workspace_id = :workspace_id"
             " AND category IN ('completed', 'canceled')"),
        {'workspace_id': workspace_id},
    )
    return list(dict.fromkeys([*BUILTIN_CLOSED_PROJECT_STATUSES, *rows.scalars().all()]))


async def _has_active_sla(db: AsyncSession, workspace_id: str, team_id: str | None, priority: str) -> bool:
    """A policy covering the issue keeps it open: an SLA is a promise to a person.

    VI: Một policy bao phủ issue thì giữ nó mở: SLA là lời hứa với một con người.
    """
    found = await db.execute(
        text('''SELECT 1 FROM sla_policies policy
                WHERE policy.workspace_id = :workspace_id AND policy.archived_at IS NULL
                  AND policy.enabled = true
                  AND (policy.team_id IS NULL OR policy.team_id = :team_id)
                  AND (policy.priority IS NULL OR policy.priority = :priority)
                LIMIT 1'''),
        {'workspace_id': workspace_id, 'team_id': team_id, 'priority': priority},
    )
    return found.first() is not None


def _eligibility_params(team: dict[str, Any], cutoff: datetime, now: datetime,
                        closed_project_statuses: list[str]) -> dict[str, Any]:
    return {
        'team_id': team['id'], 'cutoff': cutoff, 'now': now,
        'open_categories': list(OPEN_CATEGORIES), 'closed_categories': list(CLOSED_CATEGORIES),
        'closed_project_statuses': closed_project_statuses,
    }


async def _canceled_status_id(db: AsyncSession, team: dict[str, Any]) -> str | None:
    """The team's own canceled status, else the workspace-wide one.

    VI: Status huỷ của chính team, nếu không có thì lấy status dùng chung của
    VI: workspace.
    """
    for team_id in (team['id'], None):
        row = await db.execute(
            text('''SELECT id FROM issue_statuses
                    WHERE workspace_id = :workspace_id AND category = 'CANCELED'
                      AND (team_id = :team_id OR (:team_id IS NULL AND team_id IS NULL))
                    ORDER BY position ASC LIMIT 1'''),
            {'workspace_id': team['workspace_id'], 'team_id': team_id},
        )
        found = row.scalar_one_or_none()
        if found:
            return found
    return None


async def _apply_auto_close(db: AsyncSession, team: dict[str, Any], now: datetime,
                            closed_project_statuses: list[str], batch_size: int,
                            writes_enabled: bool, planned: list[str]) -> int:
    if not team['auto_close_days']:
        return 0
    cutoff = policy_cutoff(now, team['auto_close_days'])
    params = _eligibility_params(team, cutoff, now, closed_project_statuses)
    canceled_status = await _canceled_status_id(db, team)
    if not canceled_status:
        logger.warning('Skipping auto-close for team %s: no canceled status is configured.', team['id'])
        return 0

    candidates = (await db.execute(
        text(f'''SELECT issue.id, issue.workspace_id, issue.team_id, issue.status_id,
                        issue.identifier, issue.title, issue.priority
                 FROM issues issue JOIN issue_statuses status ON status.id = issue.status_id
                 WHERE {_OPEN_ELIGIBILITY}
                 ORDER BY issue.updated_at ASC LIMIT :batch_size'''),
        {**params, 'batch_size': batch_size},
    )).mappings().all()

    closed = 0
    for issue in candidates:
        if await _has_active_sla(db, issue['workspace_id'], issue['team_id'], issue['priority']):
            continue
        planned.append(issue['identifier'])
        if not writes_enabled:
            closed += 1
            continue
        # The eligibility is re-checked inside the claim so two runners cannot
        # both act on one issue; a lost race updates no row and is skipped.
        # VI: Điều kiện được kiểm lại ngay trong lệnh claim để hai tiến trình
        # VI: không cùng xử lý một issue; bên thua cuộc không cập nhật dòng nào
        # VI: và bị bỏ qua.
        claim = await db.execute(
            text(f'''UPDATE issues SET status_id = :status_id, completed_at = NULL,
                            canceled_at = :now, resolution = NULL, duplicate_of_id = NULL,
                            updated_at = :now
                     WHERE id = :id AND id IN (
                         SELECT issue.id FROM issues issue
                         JOIN issue_statuses status ON status.id = issue.status_id
                         WHERE {_OPEN_ELIGIBILITY})'''),
            {**params, 'id': issue['id'], 'status_id': canceled_status},
        )
        if not cast(CursorResult[Any], claim).rowcount:
            planned.pop()
            continue
        await db.execute(
            text('''INSERT INTO activities (id, workspace_id, issue_id, actor_id, type, data, created_at)
                    VALUES (:id, :workspace_id, :issue_id, NULL, 'issue.auto_closed',
                            CAST(:data AS jsonb), :now)'''),
            {'id': _cuid(), 'workspace_id': issue['workspace_id'], 'issue_id': issue['id'],
             'data': json.dumps({'previousStatusId': issue['status_id'], 'statusId': canceled_status,
                                 'inactivityDays': team['auto_close_days']}), 'now': now},
        )
        # Only subscribers who asked for completion notices hear about it, and a
        # person subscribed twice is told once.
        # VI: Chỉ subscriber đã bật nhận thông báo hoàn thành mới được báo, và
        # VI: người đăng ký hai lần chỉ được báo một lần.
        recipients = (await db.execute(
            text('''SELECT DISTINCT subscription.user_id FROM issue_subscriptions subscription
                    JOIN notification_preferences preference
                      ON preference.user_id = subscription.user_id
                     AND preference.workspace_id = :workspace_id
                    WHERE subscription.issue_id = :issue_id AND preference.issue_completed = true'''),
            {'workspace_id': issue['workspace_id'], 'issue_id': issue['id']},
        )).scalars().all()
        for user_id in recipients:
            await db.execute(
                text('''INSERT INTO notifications
                        (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                        VALUES (:id, :workspace_id, :user_id, 'issue.auto_closed', 'issue', :issue_id,
                                CAST(:data AS jsonb), :now)'''),
                {'id': _cuid(), 'workspace_id': issue['workspace_id'], 'user_id': user_id,
                 'issue_id': issue['id'],
                 'data': json.dumps({'identifier': issue['identifier'], 'title': issue['title'],
                                     'inactivityDays': team['auto_close_days']}), 'now': now},
            )
        await db.commit()
        closed += 1
    return closed


async def _apply_auto_archive(db: AsyncSession, team: dict[str, Any], now: datetime,
                              closed_project_statuses: list[str], batch_size: int,
                              writes_enabled: bool, planned: list[str]) -> int:
    if not team['auto_archive_days']:
        return 0
    cutoff = policy_cutoff(now, team['auto_archive_days'])
    params = _eligibility_params(team, cutoff, now, closed_project_statuses)

    candidates = (await db.execute(
        text(f'''SELECT issue.id, issue.workspace_id, issue.creator_id,
                        issue.identifier, issue.title
                 FROM issues issue JOIN issue_statuses status ON status.id = issue.status_id
                 WHERE {_CLOSED_ELIGIBILITY}
                 ORDER BY issue.updated_at ASC LIMIT :batch_size'''),
        {**params, 'batch_size': batch_size},
    )).mappings().all()

    archived = 0
    for issue in candidates:
        planned.append(issue['identifier'])
        if not writes_enabled:
            archived += 1
            continue
        claim = await db.execute(
            text(f'''UPDATE issues SET archived_at = :now, updated_at = :now
                     WHERE id = :id AND id IN (
                         SELECT issue.id FROM issues issue
                         JOIN issue_statuses status ON status.id = issue.status_id
                         WHERE {_CLOSED_ELIGIBILITY})'''),
            {**params, 'id': issue['id']},
        )
        if not cast(CursorResult[Any], claim).rowcount:
            planned.pop()
            continue
        await db.execute(
            text('''INSERT INTO activities (id, workspace_id, issue_id, actor_id, type, data, created_at)
                    VALUES (:id, :workspace_id, :issue_id, NULL, 'issue.auto_archived',
                            CAST(:data AS jsonb), :now)'''),
            {'id': _cuid(), 'workspace_id': issue['workspace_id'], 'issue_id': issue['id'],
             'data': json.dumps({'inactivityDays': team['auto_archive_days']}), 'now': now},
        )
        # Archiving tells the creator only, and does not consult the completion
        # preference: it is a different event from an issue being completed.
        # VI: Việc lưu trữ chỉ báo cho người tạo, và không xét tuỳ chọn thông báo
        # VI: hoàn thành: đây là sự kiện khác với việc issue được hoàn thành.
        await db.execute(
            text('''INSERT INTO notifications
                    (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                    VALUES (:id, :workspace_id, :user_id, 'issue.auto_archived', 'issue', :issue_id,
                            CAST(:data AS jsonb), :now)'''),
            {'id': _cuid(), 'workspace_id': issue['workspace_id'], 'user_id': issue['creator_id'],
             'issue_id': issue['id'],
             'data': json.dumps({'identifier': issue['identifier'], 'title': issue['title'],
                                 'inactivityDays': team['auto_archive_days']}), 'now': now},
        )
        await db.commit()
        archived += 1
    return archived


async def run_team_policies(factory: async_sessionmaker[AsyncSession], now: datetime | None = None,
                            batch_size: int = DEFAULT_BATCH_SIZE,
                            writes_enabled: bool = False) -> dict[str, Any]:
    """Scan every team that configured a retention policy.

    With ``writes_enabled`` false the scan runs every eligibility query and
    reports the issues it would act on under ``planned``, without changing a
    row. That is how the port is compared against the worker it replaces before
    it is allowed to write.

    VI: Quét mọi team có cấu hình chính sách lưu giữ. Khi ``writes_enabled`` là
    false, lượt quét vẫn chạy đủ mọi truy vấn eligibility và báo cáo những issue
    nó định xử lý trong ``planned``, không đổi dòng nào. Đó là cách đối chiếu
    bản port với worker mà nó thay thế, trước khi cho phép nó ghi.
    """
    moment = now or _utcnow()
    planned_closed: list[str] = []
    planned_archived: list[str] = []
    closed = archived = 0
    async with factory() as db:
        teams = (await db.execute(
            text('''SELECT id, workspace_id, auto_close_days, auto_archive_days FROM teams
                    WHERE archived_at IS NULL
                      AND (auto_close_days IS NOT NULL OR auto_archive_days IS NOT NULL)''')
        )).mappings().all()
        for team in teams:
            statuses = await _closed_project_status_names(db, team['workspace_id'])
            closed += await _apply_auto_close(db, dict(team), moment, statuses, batch_size,
                                              writes_enabled, planned_closed)
            archived += await _apply_auto_archive(db, dict(team), moment, statuses, batch_size,
                                                  writes_enabled, planned_archived)
        # Each issue committed on its own above, mirroring the worker's
        # per-issue transaction. Gathering a whole batch into one transaction
        # would roll back two hundred settled issues because the next one
        # failed, and would hold locks across the entire scan.
        # VI: Mỗi issue đã tự commit ở trên, giống transaction theo từng issue
        # VI: của worker. Gom cả lô vào một transaction sẽ cuộn ngược hai trăm
        # VI: issue đã xử lý xong chỉ vì issue kế tiếp hỏng, và giữ khoá suốt
        # VI: cả lượt quét.
        await db.rollback()
    return {'teams': len(teams), 'closed': closed, 'archived': archived,
            'planned': {'closed': planned_closed, 'archived': planned_archived}}


async def team_policy_loop(
    factory: async_sessionmaker[AsyncSession],
    stop: asyncio.Event,
    interval_seconds: float = 3600,
    writes_enabled: bool = False,
    run_policies: Callable[..., Awaitable[dict[str, Any]]] = run_team_policies,
    run_cadence: Callable[..., Awaitable[dict[str, int]]] | None = None,
) -> None:
    """One scan does both halves, as the single BullMQ job did.

    VI: Một lượt quét làm cả hai phần, giống như job BullMQ đơn lẻ trước đây.
    """
    if run_cadence is None:
        from .cycle_cadence import run_cycle_cadence  # noqa: PLC0415

        run_cadence = run_cycle_cadence
    cadence_runner = run_cadence
    while not stop.is_set():
        try:
            async def scan() -> tuple[dict[str, Any], dict[str, int]]:
                # Sequential rather than concurrent: both halves write issues
                # and cycles for the same teams, and two sessions racing over
                # those rows buys nothing on an hourly job.
                # VI: Chạy tuần tự chứ không song song: cả hai phần đều ghi vào
                # issue và cycle của cùng những team, và để hai session tranh
                # nhau các dòng đó không được lợi gì với một job chạy mỗi giờ.
                policies = await run_policies(factory, writes_enabled=writes_enabled)
                cadence = await cadence_runner(factory, writes_enabled=writes_enabled)
                return policies, cadence

            policies, cadence = await progress(factory, 'team-policies', scan())
            if writes_enabled:
                logger.info(
                    'Team policy scan: %s retention team(s), %s closed, %s archived; '
                    '%s cadence team(s), %s cycle(s) created, %s activated, %s completed.',
                    policies['teams'], policies['closed'], policies['archived'],
                    cadence['teams'], cadence['created'], cadence['activated'], cadence['completed'])
            else:
                # The identifiers are the comparison material: anything listed
                # here that the BullMQ worker did not act on in the same window
                # is a porting error, and that is the dangerous direction.
                # VI: Danh sách identifier chính là vật liệu đối chiếu: bất cứ
                # VI: issue nào ở đây mà worker BullMQ không xử lý trong cùng
                # VI: cửa sổ thời gian đều là lỗi port, và đó là chiều nguy hiểm.
                logger.info(
                    'Team policy scan (reporting only): %s retention team(s). '
                    'Would close: %s. Would archive: %s. '
                    '%s cadence team(s): would create %s, activate %s, complete %s.',
                    policies['teams'],
                    ', '.join(policies['planned']['closed']) or 'nothing',
                    ', '.join(policies['planned']['archived']) or 'nothing',
                    cadence['teams'], cadence['created'], cadence['activated'], cadence['completed'])
        except Exception:  # Keep the API alive; the next interval retries.
            logger.exception('Team policy scan failed.')
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
