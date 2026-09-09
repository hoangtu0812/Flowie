from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..domains.team_dispatcher import (
    dispatch_cutoff_utc,
    hcm_today,
    run_team_dispatcher,
    seconds_until_next_dispatch,
)

logger = logging.getLogger(__name__)


async def run_due_dispatchers(
    factory: async_sessionmaker[AsyncSession],
) -> dict[str, int]:
    """Run the dispatcher once for every opted-in team. One team's failure never blocks the rest."""
    async with factory() as db:
        teams = await db.execute(
            text("""SELECT s.team_id, t.workspace_id FROM team_dispatcher_settings s
                   JOIN teams t ON t.id = s.team_id
                   WHERE s.enabled = TRUE AND t.archived_at IS NULL""")
        )
        targets = [dict(row) for row in teams.mappings().all()]
    today = hcm_today()
    cutoff = dispatch_cutoff_utc()
    summary = {"teams": 0, "applied": 0, "nudged": 0}
    for target in targets:
        async with factory() as db:
            try:
                result = await run_team_dispatcher(
                    db, target["team_id"], target["workspace_id"], today, cutoff
                )
                summary["teams"] += 1
                summary["applied"] += len(result.get("applied", []))
                summary["nudged"] += len(result.get("nudged", []))
            except Exception:
                logger.exception("Dispatcher failed for team %s.", target["team_id"])
    return summary


async def dispatcher_loop(
    factory: async_sessionmaker[AsyncSession],
    stop: asyncio.Event,
    run: Callable[
        [async_sessionmaker[AsyncSession]], Awaitable[dict[str, int]]
    ] = run_due_dispatchers,
) -> None:
    while not stop.is_set():
        try:
            summary = await run(factory)
            if summary["teams"]:
                logger.info(
                    "Dispatcher run completed: %s team(s), %s assigned, %s nudged.",
                    summary["teams"],
                    summary["applied"],
                    summary["nudged"],
                )
        except Exception:
            logger.exception("Dispatcher scan failed.")
        try:
            await asyncio.wait_for(stop.wait(), timeout=seconds_until_next_dispatch())
        except TimeoutError:
            pass
