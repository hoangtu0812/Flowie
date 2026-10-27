from __future__ import annotations
from ..modules.operations.heartbeats import progress

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..core.config import Settings
from ..domains.auth import _utcnow
from ..domains.scm.service import connection_sync_lock, sync_connection


logger = logging.getLogger(__name__)
# ERROR connections stay eligible so a transient provider or network failure recovers without a
# manual Sync; last_synced_at only moves on success, which still limits them to one attempt per
# interval. A sync by any process (manual or periodic) resets the clock for every process.
# VI: Connection ERROR vẫn được đồng bộ để lỗi tạm thời của provider hoặc mạng tự phục hồi mà
# không cần bấm Sync; last_synced_at chỉ đổi khi thành công nên vẫn chỉ thử một lần mỗi chu kỳ.
# Một lần đồng bộ ở bất kỳ process nào (thủ công hay định kỳ) đều đặt lại mốc cho mọi process.
DUE = '''status IN ('ACTIVE', 'ERROR') AND (last_synced_at IS NULL OR last_synced_at <= :due)'''


async def sync_due_connections(
    factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    interval_seconds: float,
    sync: Callable[[AsyncSession, str, Settings], Awaitable[dict[str, int]]] = sync_connection,
    lock: Callable = connection_sync_lock,
) -> int:
    # Synchronizes due connections one at a time, which bounds GitHub/Azure traffic to a single
    # 100-PR window fetch in flight per API process. A connection already locked by manual Sync or
    # another process is skipped, and due-ness is re-checked under the lock so a sync that finished
    # between the scan and the lock is not repeated. Returns the number of successful syncs.
    # VI: Đồng bộ lần lượt từng connection đến hạn, giới hạn lưu lượng GitHub/Azure ở một lượt
    # lấy cửa sổ 100 PR mỗi process API. Connection đang bị khoá bởi Sync thủ công hoặc process
    # khác thì bỏ qua, và điều kiện đến hạn được kiểm tra lại khi đã giữ lock để không lặp lại lần
    # đồng bộ vừa xong giữa lúc quét và lúc lấy lock. Trả về số lần đồng bộ thành công.
    due = _utcnow() - timedelta(seconds=interval_seconds)
    async with factory() as db:
        result = await db.execute(
            text(f'SELECT id FROM scm_connections WHERE {DUE} ORDER BY last_synced_at ASC NULLS FIRST'),
            {'due': due},
        )
        ids = [str(value) for value in result.scalars().all()]

    synced = 0
    for connection_id in ids:
        async with lock(factory, connection_id) as acquired:
            if not acquired:
                continue
            async with factory() as db:
                still_due = await db.execute(
                    text(f'SELECT id FROM scm_connections WHERE id = :id AND {DUE}'),
                    {'id': connection_id, 'due': due},
                )
                if still_due.scalar() is None:
                    continue
                try:
                    await sync(db, connection_id, settings)
                    synced += 1
                except Exception:
                    # sync_connection already stored provider failures as last_error/ERROR.
                    # VI: sync_connection đã lưu lỗi provider vào last_error/ERROR.
                    logger.exception('Periodic source-control sync of connection %s failed.', connection_id)
    return synced


async def scm_sync_loop(
    factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    stop: asyncio.Event,
    run: Callable[[async_sessionmaker[AsyncSession], Settings, float], Awaitable[int]] = sync_due_connections,
) -> None:
    interval_seconds = settings.scm_sync_interval_seconds
    while not stop.is_set():
        try:
            synced = await progress(factory, 'scm-sync', run(factory, settings, interval_seconds))
            if synced:
                logger.info('Periodically synchronized %s source-control connection(s).', synced)
        except Exception:
            logger.exception('Periodic source-control sync scan failed.')
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
