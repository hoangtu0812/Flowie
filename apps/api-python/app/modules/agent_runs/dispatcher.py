from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import text

from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ...core.clock import _utcnow
from ..mcp.connections import load_principal, validate_current
from ..mcp.policy import AccessPolicy
from .api import management_audit

logger = logging.getLogger(__name__)


async def process_event(factory) -> bool:
    event_id = None
    try:
        async with factory() as db:
            event = (
                (
                    await db.execute(
                        text("""SELECT * FROM agent_issue_events WHERE processed_at IS NULL
                AND failed_at IS NULL AND available_at<=:now ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1"""),
                        {"now": _utcnow()},
                    )
                )
                .mappings()
                .first()
            )
            if not event:
                return False
            event_id = event["id"]
            rules = (
                await db.execute(
                    text("""SELECT rule.* FROM agent_automations rule
                JOIN issues i ON i.project_id=rule.project_id JOIN issue_statuses s ON s.id=i.status_id
                WHERE i.id=:issue AND rule.workspace_id=:workspace AND rule.enabled=true AND i.archived_at IS NULL
                AND s.category NOT IN ('COMPLETED','CANCELED')
                AND rule.created_at<=:event_time
                AND EXISTS(SELECT 1 FROM issue_labels il WHERE il.issue_id=i.id AND il.label_id=rule.label_id)
                ORDER BY rule.id FOR UPDATE OF rule"""),
                    {
                        "issue": event["issue_id"],
                        "workspace": event["workspace_id"],
                        "event_time": event["created_at"],
                    },
                )
            ).mappings()
            for rule in rules:
                try:
                    principal = await load_principal(db, rule["connection_id"])
                    principal.require("runs:write", "issues:read")
                    await validate_current(db, principal)
                    await AccessPolicy(db, principal).issue(event["issue_id"])
                except ApiError:
                    continue
                # Connection-level serialization makes the daily budget atomic across rules/workers.
                await db.execute(
                    text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
                    {"key": f"automation:{rule['connection_id']}"},
                )
                used = (
                    await db.execute(
                        text(
                            """SELECT COUNT(*) FROM agent_runs WHERE connection_id=:connection AND created_at>=:cutoff"""
                        ),
                        {
                            "connection": rule["connection_id"],
                            "cutoff": _utcnow() - timedelta(days=1),
                        },
                    )
                ).scalar_one()
                if used >= rule["daily_limit"]:
                    continue
                identifier = _cuid()
                inserted = (
                    await db.execute(
                        text("""INSERT INTO agent_runs (id,workspace_id,issue_id,connection_id)
                    VALUES (:id,:workspace,:issue,:connection) ON CONFLICT (issue_id) WHERE state IN ('PENDING','RUNNING') DO NOTHING RETURNING id"""),
                        {
                            "id": identifier,
                            "workspace": event["workspace_id"],
                            "issue": event["issue_id"],
                            "connection": rule["connection_id"],
                        },
                    )
                ).first()
                if inserted:
                    await management_audit(
                        db,
                        event["workspace_id"],
                        principal.user["id"],
                        "run.enqueued",
                        identifier,
                    )
            await db.execute(
                text("UPDATE agent_issue_events SET processed_at=:now WHERE id=:id"),
                {"id": event_id, "now": _utcnow()},
            )
            await db.commit()
            return True
    except Exception:
        logger.warning("Agent event dispatch failed event=%s", event_id)
        if event_id:
            async with factory() as db:
                await db.execute(
                    text("""UPDATE agent_issue_events SET attempts=attempts+1,
                    failed_at=CASE WHEN attempts>=7 THEN :now ELSE NULL END,
                    available_at=:now + LEAST(3600,5*POWER(2,attempts+1))*INTERVAL '1 second'
                    WHERE id=:id AND processed_at IS NULL"""),
                    {"id": event_id, "now": _utcnow()},
                )
                await db.commit()
        return False


async def dispatcher_loop(factory, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            if await process_event(factory):
                continue
        except Exception:
            logger.warning("Agent dispatcher is unavailable")
        try:
            await asyncio.wait_for(stop.wait(), timeout=5)
        except TimeoutError:
            pass
