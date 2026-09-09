from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..domains.team_insights import (
    digest_cutoff_utc,
    hcm_today,
    seconds_until_next_digest,
    send_digest_for_workspace,
)

logger = logging.getLogger(__name__)


async def deliver_due_digests(factory: async_sessionmaker[AsyncSession]) -> int:
    """Send today's digest to opted-in workspaces that were not served yet today."""
    from sqlalchemy import text

    async with factory() as db:
        workspaces = await db.execute(
            text(
                """SELECT w.id FROM workspaces w
                   JOIN discord_webhooks dw ON dw.workspace_id = w.id
                   WHERE dw.enabled = TRUE AND dw.daily_digest_enabled = TRUE
                     AND (dw.daily_digest_sent_at IS NULL OR dw.daily_digest_sent_at < :cutoff)"""
            ),
            {"cutoff": digest_cutoff_utc()},
        )
        ids = [row["id"] for row in workspaces.mappings().all()]
    today = hcm_today()
    delivered = 0
    for workspace_id in ids:
        async with factory() as db:
            try:
                if await send_digest_for_workspace(db, workspace_id, today):
                    delivered += 1
            except Exception:
                logger.exception("Daily digest failed for workspace %s.", workspace_id)
    return delivered


async def digest_loop(
    factory: async_sessionmaker[AsyncSession],
    stop: asyncio.Event,
    run: Callable[
        [async_sessionmaker[AsyncSession]], Awaitable[int]
    ] = deliver_due_digests,
) -> None:
    # Run once on startup so a restart after 08:00 still serves today's digest;
    # send_digest_for_workspace skips workspaces that already received one.
    while not stop.is_set():
        try:
            delivered = await run(factory)
            if delivered:
                logger.info("Delivered %s daily digest(s).", delivered)
        except Exception:
            logger.exception("Daily digest scan failed.")
        try:
            await asyncio.wait_for(stop.wait(), timeout=seconds_until_next_digest())
        except TimeoutError:
            pass
