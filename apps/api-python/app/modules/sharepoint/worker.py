from __future__ import annotations

import asyncio
import logging

from ..operations.heartbeats import progress
from .attachments import publish_attachments_due
from .service import publish_due

logger = logging.getLogger(__name__)


async def sharepoint_loop(factory, settings, stop: asyncio.Event, interval_seconds: float = 60) -> None:
    """Publish due documents, then copy due attachments, every minute until stopped; a failed
    scan is retried next tick.
    VI: Phát hành tài liệu đến hạn rồi sao chép attachment đến hạn, mỗi phút cho tới khi dừng;
    VI: lượt quét lỗi được thử lại ở lượt sau."""
    while not stop.is_set():
        try:
            published = await progress(factory, "sharepoint-publish", publish_due(factory, settings))
            if published:
                logger.info("Published %s document(s) to SharePoint.", published)
            copied = await publish_attachments_due(factory, settings)
            if copied:
                logger.info("Copied %s attachment(s) to SharePoint.", copied)
        except Exception:  # Keep the API alive; failures are retried next interval.
            logger.exception("SharePoint publishing scan failed.")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
