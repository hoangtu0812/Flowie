from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..core.clock import utcnow
from ..core.config import Settings
from ..modules.operations.heartbeats import progress
from ..modules.scm.service import sync_delivery_review
from .commands import (
    PROCESS_SCM_DELIVERIES_UPDATE_SCM_WEBHOOK_DELIVERIES,
    PROCESS_SCM_DELIVERIES_UPDATE_SCM_WEBHOOK_DELIVERIES_2,
    PROCESS_SCM_DELIVERIES_UPDATE_SCM_WEBHOOK_DELIVERIES_3,
)
from .queries import (
    PROCESS_SCM_DELIVERIES_SELECT_SCM_WEBHOOK_DELIVERIES,
    PROCESS_SCM_DELIVERIES_SELECT_SCM_WEBHOOK_DELIVERIES_2,
)

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 8


async def process_scm_deliveries(
    factory: async_sessionmaker[AsyncSession],
    settings: Settings,
) -> int:
    async with factory() as db:
        result = await db.execute(
            PROCESS_SCM_DELIVERIES_SELECT_SCM_WEBHOOK_DELIVERIES,
            {'now': utcnow(), 'max_attempts': MAX_ATTEMPTS},
        )
        ids = [str(value) for value in result.scalars().all()]
        if ids:
            await db.execute(
                PROCESS_SCM_DELIVERIES_UPDATE_SCM_WEBHOOK_DELIVERIES,
                {'ids': ids, 'lease_until': utcnow() + timedelta(minutes=5)},
            )
        await db.commit()

    processed = 0
    for delivery_id in ids:
        async with factory() as db:
            result = await db.execute(
                PROCESS_SCM_DELIVERIES_SELECT_SCM_WEBHOOK_DELIVERIES_2,
                {'id': delivery_id},
            )
            delivery = result.mappings().one()
            try:
                synchronized = await sync_delivery_review(db, delivery, settings)
                now = utcnow()
                await db.execute(
                    PROCESS_SCM_DELIVERIES_UPDATE_SCM_WEBHOOK_DELIVERIES_2,
                    {'id': delivery_id, 'status': 'PROCESSED' if synchronized else 'IGNORED', 'now': now},
                )
                await db.commit()
                processed += 1
            except Exception as error:
                await db.rollback()
                attempts = int(delivery['attempts']) + 1
                terminal = attempts >= MAX_ATTEMPTS
                retry_at = utcnow() + timedelta(seconds=min(30 * (2 ** max(attempts - 1, 0)), 3600))
                await db.execute(
                    PROCESS_SCM_DELIVERIES_UPDATE_SCM_WEBHOOK_DELIVERIES_3,
                    {
                        'id': delivery_id,
                        'attempts': attempts,
                        'error': str(error)[:1000],
                        'retry_at': retry_at,
                        'terminal': terminal,
                        'now': utcnow(),
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
            processed = await progress(factory,'scm-delivery',run(factory, settings))
            if processed:
                logger.info('Processed %s source-control webhook delivery record(s).', processed)
        except Exception:
            logger.exception('Source-control webhook delivery scan failed.')
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
