from __future__ import annotations
from ..modules.operations.heartbeats import progress

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..domains.native_asks import ticket_status
from ..modules.notifications.outbox import stage_notifications
from ..services.notification_events import create_notification_batch


logger = logging.getLogger(__name__)
SYSTEM_ACTOR = {'id': 'system', 'name': 'Flowie'}
STATUS_LABELS = {'received': 'Received', 'in_progress': 'In progress', 'done': 'Done', 'canceled': 'Canceled', 'declined': 'Declined'}


async def notify_ticket_status_changes(factory: async_sessionmaker[AsyncSession]) -> int:
    """Tells requesters when a ticket's status changed, whichever writer changed the linked issue.
    Issue statuses are written by the web app, bulk jobs, MCP, SCM and the TypeScript worker, so this
    compares outcomes instead of hooking each writer. A null baseline is set silently, which keeps
    Asks older than this job from notifying in bulk after a deploy.
    shortcut: reads every open Ask on each pass; move to issue_lifecycle_events if the table grows large.
    VI: Báo cho người yêu cầu khi trạng thái ticket đổi, bất kể nguồn nào đổi Issue liên kết.
    VI: Trạng thái Issue được ghi từ web, job hàng loạt, MCP, SCM và worker TypeScript, nên job so sánh
    VI: kết quả thay vì móc vào từng nguồn. Mốc null được đặt im lặng để Ask cũ hơn job này không tạo
    VI: thông báo hàng loạt sau khi deploy.
    VI: shortcut: mỗi lượt đọc mọi Ask còn mở; chuyển sang issue_lifecycle_events nếu bảng lớn lên.
    """
    async with factory() as db:
        result = await db.execute(
            text(
                '''SELECT ask.id, ask.workspace_id, ask.title, ask.status, ask.created_by, ask.notified_ticket_status, issue_status.category
                   FROM asks ask
                   LEFT JOIN issues issue ON issue.id = ask.converted_issue_id
                   LEFT JOIN issue_statuses issue_status ON issue_status.id = issue.status_id
                   WHERE ask.archived_at IS NULL'''
            )
        )
        notified = 0
        for row in result.mappings().all():
            current, seen = ticket_status(row['status'], row['category']), row['notified_ticket_status']
            if current == seen:
                continue
            # The conditional update is the claim: a second API process blocks here, then matches no row.
            # VI: Câu update có điều kiện là bước giành quyền: tiến trình API thứ hai chờ tại đây rồi không khớp dòng nào.
            claimed = await db.execute(
                text('UPDATE asks SET notified_ticket_status = :current WHERE id = :id AND notified_ticket_status IS NOT DISTINCT FROM CAST(:seen AS text) RETURNING id'),
                {'current': current, 'id': row['id'], 'seen': seen},
            )
            if claimed.scalar_one_or_none() is None or seen is None:
                continue
            batch = await create_notification_batch(
                db,
                workspace_id=row['workspace_id'],
                recipient_ids={row['created_by']},
                actor=SYSTEM_ACTOR,
                event_type='ticket.status_changed',
                entity_type='ticket',
                entity_id=row['id'],
                title=row['title'],
                message='Your ticket status changed',
                entity_path=f"/service-desk/{row['id']}",
                details=[('Status', f"{STATUS_LABELS[seen]} → {STATUS_LABELS[current]}")],
                discord=False,
            )
            await stage_notifications(db, batch, workspace_id=row['workspace_id'])
            notified += 1
        await db.commit()
        return notified


async def ticket_status_loop(
    factory: async_sessionmaker[AsyncSession],
    stop: asyncio.Event,
    interval_seconds: float = 60,
    run: Callable[[async_sessionmaker[AsyncSession]], Awaitable[int]] = notify_ticket_status_changes,
) -> None:
    while not stop.is_set():
        try:
            notified = await progress(factory, 'ticket-status', run(factory))
            if notified:
                logger.info('Reported %s ticket status change(s).', notified)
        except Exception:  # Keep the API alive; the comparison repeats next interval.
            logger.exception('Ticket status scan failed.')
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
