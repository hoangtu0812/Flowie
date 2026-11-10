from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..core.clock import utcnow
from ..core.identifiers import cuid
from ..core.utc_responses import utc_response_value
from ..modules.operations.heartbeats import progress
from .commands import (
    DELIVER_DUE_REMINDERS_INSERT_NOTIFICATIONS,
    DELIVER_DUE_REMINDERS_UPDATE_ISSUE_REMINDERS,
)
from .queries import (
    DELIVER_DUE_REMINDERS_SELECT_ISSUE_REMINDERS,
)

logger = logging.getLogger(__name__)


async def deliver_due_reminders(factory: async_sessionmaker[AsyncSession]) -> int:
    """Atomically claim due reminders and create their in-app notifications."""
    async with factory() as db:
        now = utcnow()
        due = await db.execute(
            DELIVER_DUE_REMINDERS_SELECT_ISSUE_REMINDERS,
            {'now': now},
        )
        reminders = due.mappings().all()
        for reminder in reminders:
            # remind_at is stored UTC-naive, and this payload lands in a jsonb
            # column that no response serialiser touches again, so the offset
            # has to be attached here. Without it the string reads back as a
            # local time and a reader one zone away sees the wrong instant.
            # VI: remind_at lưu dạng naive-UTC, và payload này rơi vào cột jsonb
            # mà không bộ tuần tự hoá phản hồi nào chạm tới nữa, nên offset phải
            # được gắn ngay ở đây. Thiếu nó thì chuỗi đọc lại thành giờ địa
            # phương và người ở múi giờ khác thấy sai thời điểm.
            await db.execute(
                DELIVER_DUE_REMINDERS_INSERT_NOTIFICATIONS,
                {
                    'id': cuid(), 'workspace_id': reminder['workspace_id'],
                    'user_id': reminder['user_id'], 'issue_id': reminder['issue_id'],
                    'data': json.dumps({'identifier': reminder['identifier'], 'title': reminder['title'], 'remindAt': utc_response_value(reminder['remind_at']).isoformat()}),
                    'now': now,
                },
            )
            await db.execute(
                DELIVER_DUE_REMINDERS_UPDATE_ISSUE_REMINDERS,
                {'id': reminder['id'], 'now': now},
            )
        await db.commit()
        return len(reminders)


async def reminder_loop(
    factory: async_sessionmaker[AsyncSession],
    stop: asyncio.Event,
    interval_seconds: float = 30,
    run: Callable[[async_sessionmaker[AsyncSession]], Awaitable[int]] = deliver_due_reminders,
) -> None:
    while not stop.is_set():
        try:
            delivered = await progress(factory,'reminders',run(factory))
            if delivered:
                logger.info('Delivered %s due issue reminder(s).', delivered)
        except Exception:  # Keep the API alive; the durable record is retried next interval.
            logger.exception('Issue reminder scan failed.')
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
