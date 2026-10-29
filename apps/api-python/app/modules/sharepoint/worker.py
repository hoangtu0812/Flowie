from __future__ import annotations

import asyncio
import logging

from ..operations.heartbeats import progress
from .service import publish_due

logger = logging.getLogger(__name__)


async def sharepoint_loop(factory, settings, stop: asyncio.Event, interval_seconds: float = 60) -> None:
    """Publish due documents every minute until stopped; a failed scan is retried next tick.
    VI: Phát hành tài liệu đến hạn mỗi phút cho tới khi dừng; lượt quét lỗi được thử lại ở
    VI: lượt sau."""
    while not stop.is_set():
        try:
            published = await progress(factory, "sharepoint-publish", publish_due(factory, settings))
            if published:
                logger.info("Published %s document(s) to SharePoint.", published)
        except Exception:  # Keep the API alive; failures are retried next interval.
            logger.exception("SharePoint publishing scan failed.")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
