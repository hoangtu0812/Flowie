from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from ...core.clock import utcnow
from ..operations.heartbeats import progress
from .commands import (
    CLEANUP_DELETE_ACCOUNT_MFA,
    CLEANUP_DELETE_ACCOUNT_SECURITY_EVENTS,
    CLEANUP_DELETE_AI_TOOL_WINDOWS,
    CLEANUP_DELETE_BULK_OPERATIONS,
    CLEANUP_DELETE_MCP_REQUESTS,
    CLEANUP_DELETE_MFA_CHALLENGES,
    CLEANUP_DELETE_NOTIFICATION_OUTBOX,
    CLEANUP_DELETE_SESSIONS,
    CLEANUP_UPDATE_BULK_OPERATIONS,
    cleanup_delete_sql,
)

logger = logging.getLogger(__name__)


async def cleanup(factory) -> None:
    """Retain replay data through credential expiry plus a seven-day audit grace period."""
    cutoff = utcnow() - timedelta(days=7)
    async with factory() as db:
        await db.execute(
            CLEANUP_DELETE_MCP_REQUESTS,
            {"cutoff": cutoff},
        )
        await db.execute(
            CLEANUP_DELETE_NOTIFICATION_OUTBOX,
            {"cutoff": cutoff},
        )
        await db.execute(
            CLEANUP_DELETE_AI_TOOL_WINDOWS,
            {"cutoff": cutoff},
        )
        await db.commit()
        await db.execute(CLEANUP_UPDATE_BULK_OPERATIONS,{'now':utcnow()})
        await db.execute(CLEANUP_DELETE_BULK_OPERATIONS,{'cutoff':utcnow()-timedelta(days=30)})
        await db.commit()
        for table,clock,days in [('client_error_events','created_at',30),('operation_heartbeats','last_seen_at',7),('ai_provider_calls','created_at',90)]:
            await db.execute(cleanup_delete_sql(table, clock),{'cutoff':utcnow()-timedelta(days=days)})
        await db.commit()
        await db.execute(CLEANUP_DELETE_ACCOUNT_SECURITY_EVENTS,{'cutoff':utcnow()-timedelta(days=30)})
        await db.execute(CLEANUP_DELETE_SESSIONS,{'cutoff':utcnow()-timedelta(days=30)})
        await db.execute(CLEANUP_DELETE_MFA_CHALLENGES,{'cutoff':utcnow()-timedelta(days=1)})
        await db.execute(CLEANUP_DELETE_ACCOUNT_MFA,{'cutoff':utcnow()-timedelta(days=1)})
        await db.commit()


async def maintenance_loop(factory, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await progress(factory,'maintenance',cleanup(factory))
        except Exception:
            logger.warning("MCP maintenance is unavailable")
        try:
            await asyncio.wait_for(stop.wait(), timeout=3600)
        except TimeoutError:
            pass
