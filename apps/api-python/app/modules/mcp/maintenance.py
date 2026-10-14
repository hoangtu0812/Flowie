from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import text

from ...core.clock import _utcnow

logger = logging.getLogger(__name__)


async def cleanup(factory) -> None:
    """Retain replay data through credential expiry plus a seven-day audit grace period."""
    cutoff = _utcnow() - timedelta(days=7)
    async with factory() as db:
        await db.execute(
            text("""DELETE FROM mcp_requests WHERE ctid IN (
            SELECT r.ctid FROM mcp_requests r JOIN mcp_connections c ON c.id=r.connection_id
            WHERE c.expires_at<:cutoff OR c.revoked_at<:cutoff LIMIT 1000)"""),
            {"cutoff": cutoff},
        )
        await db.execute(
            text("""DELETE FROM notification_outbox WHERE id IN (
            SELECT id FROM notification_outbox WHERE delivered_at<:cutoff ORDER BY delivered_at LIMIT 1000)"""),
            {"cutoff": cutoff},
        )
        await db.execute(
            text("""DELETE FROM agent_issue_events WHERE id IN (
            SELECT id FROM agent_issue_events WHERE processed_at<:cutoff ORDER BY processed_at LIMIT 1000)"""),
            {"cutoff": cutoff},
        )
        await db.execute(
            text(
                "DELETE FROM ai_tool_windows WHERE ctid IN (SELECT ctid FROM ai_tool_windows WHERE window_start<:cutoff LIMIT 1000)"
            ),
            {"cutoff": cutoff},
        )
        await db.commit()


async def maintenance_loop(factory, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await cleanup(factory)
        except Exception:
            logger.warning("MCP maintenance is unavailable")
        try:
            await asyncio.wait_for(stop.wait(), timeout=3600)
        except TimeoutError:
            pass
