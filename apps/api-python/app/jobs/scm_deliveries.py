from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..core.config import Settings
from ..domains.auth import _utcnow
from ..domains.scm.service import sync_delivery_review


logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 8


async def process_scm_deliveries(
    factory: async_sessionmaker[AsyncSession],
    settings: Settings,
) -> int:
    async with factory() as db:
        result = await db.execute(
            text(
                '''SELECT id FROM scm_webhook_deliveries
                   WHERE status IN ('PENDING', 'FAILED') AND next_attempt_at <= :now
                     AND attempts < :max_attempts
                   ORDER BY received_at ASC
                   FOR UPDATE SKIP LOCKED LIMIT 20'''
            ),
            {'now': _utcnow(), 'max_attempts': MAX_ATTEMPTS},
        )
        ids = [str(value) for value in result.scalars().all()]
        if ids:
            await db.execute(
                text(
                    '''UPDATE scm_webhook_deliveries
                       SET status = 'PROCESSING', attempts = attempts + 1
                       WHERE id = ANY(:ids)'''
                ),
                {'ids': ids},
            )
        await db.commit()

    processed = 0
    for delivery_id in ids:
        async with factory() as db:
            result = await db.execute(
                text('SELECT * FROM scm_webhook_deliveries WHERE id = :id'),
                {'id': delivery_id},
            )
            delivery = result.mappings().one()
            try:
                synchronized = await sync_delivery_review(db, delivery, settings)
                now = _utcnow()
                await db.execute(
                    text(
                        '''UPDATE scm_webhook_deliveries
                           SET status = :status, processed_at = :now, last_error = NULL
                           WHERE id = :id'''
                    ),
                    {'id': delivery_id, 'status': 'PROCESSED' if synchronized else 'IGNORED', 'now': now},
                )
                await db.commit()
                processed += 1
            except Exception as error:
                await db.rollback()
                attempts = int(delivery['attempts'])
                terminal = attempts >= MAX_ATTEMPTS
                retry_at = _utcnow() + timedelta(seconds=min(30 * (2 ** max(attempts - 1, 0)), 3600))
                await db.execute(
                    text(
                        '''UPDATE scm_webhook_deliveries
                           SET status = 'FAILED', last_error = :error, next_attempt_at = :retry_at,
                               processed_at = CASE WHEN :terminal THEN :now ELSE NULL END
                           WHERE id = :id'''
                    ),
                    {
                        'id': delivery_id,
                        'error': str(error)[:1000],
                        'retry_at': retry_at,
                        'terminal': terminal,
                        'now': _utcnow(),
                    },
                )
                await db.commit()
                logger.exception('Source-control webhook delivery %s failed.', delivery_id)
    return processed


async def scm_delivery_loop(
    factory: async_sessionmaker[AsyncSession],
    settings: Settings,
    stop: asyncio.Event,
    interval_seconds: float = 10,
    run: Callable[[async_sessionmaker[AsyncSession], Settings], Awaitable[int]] = process_scm_deliveries,
) -> None:
    while not stop.is_set():
        try:
            processed = await run(factory, settings)
            if processed:
                logger.info('Processed %s source-control webhook delivery record(s).', processed)
        except Exception:
            logger.exception('Source-control webhook delivery scan failed.')
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
