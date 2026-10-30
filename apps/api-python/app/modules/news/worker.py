from __future__ import annotations

import asyncio
import logging

from ...core.clock import _utcnow
from ..operations.heartbeats import progress
from .feeds import news_cutoff_utc
from .service import due_workspaces, refresh_workspace

logger = logging.getLogger(__name__)


async def fetch_due_news(factory, settings=None) -> int:
    """Refresh every workspace with a source not fetched since the latest 06:30 Asia/Ho_Chi_Minh.
    Because "due" is read from ``last_fetched_at``, a restart neither skips nor repeats a day.
    VI: Lấy tin cho mọi workspace có nguồn chưa lấy kể từ mốc 06:30 giờ Việt Nam gần nhất. Vì
    VI: "đến hạn" đọc từ ``last_fetched_at`` nên khởi động lại không bỏ sót hay lặp lại một ngày.
    """
    cutoff = news_cutoff_utc(_utcnow())
    async with factory() as db:
        workspaces = await due_workspaces(db, cutoff)
    for workspace_id in workspaces:
        async with factory() as db:
            try:
                await refresh_workspace(db, workspace_id, due_before=cutoff, settings=settings)
            except Exception:
                logger.exception('News refresh failed for workspace %s.', workspace_id)
    return len(workspaces)


async def news_loop(factory, stop: asyncio.Event, settings=None, interval_seconds: float = 600) -> None:
    """Check for due sources every 10 minutes until stopped; a failed scan is retried next tick.
    VI: Kiểm tra nguồn đến hạn mỗi 10 phút cho tới khi dừng; lượt quét lỗi được thử lại ở lượt sau.
    """
    while not stop.is_set():
        try:
            refreshed = await progress(factory, 'news', fetch_due_news(factory, settings))
            if refreshed:
                logger.info('Refreshed news for %s workspace(s).', refreshed)
        except Exception:
            logger.exception('News scan failed.')
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
