from __future__ import annotations
from ..operations.heartbeats import progress

import asyncio
import json
import logging
from dataclasses import asdict
from datetime import timedelta
from os import getenv

import httpx
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.identifiers import _cuid
from ...core.clock import _utcnow
from ...services.notification_events import NotificationBatch, notification_hub

logger = logging.getLogger(__name__)


async def stage_notifications(
    db: AsyncSession, *batches: NotificationBatch | None, workspace_id: str
) -> None:
    """Persist delivery intent in the same transaction as the domain mutation."""
    for batch in batches:
        if batch is not None and (batch.records or batch.discord_embed):
            await db.execute(
                text(
                    "INSERT INTO notification_outbox (id,workspace_id,payload) VALUES (:id,:workspace,CAST(:payload AS jsonb))"
                ),
                {
                    "id": _cuid(),
                    "workspace": workspace_id,
                    "payload": json.dumps(jsonable_encoder(asdict(batch))),
                },
            )


async def deliver(payload: dict) -> None:
    # Remote channels are at-least-once; a provider may accept a timed-out request.
    embed = payload.get("discord_embed")
    if embed:
        async with httpx.AsyncClient(timeout=15) as client:
            if payload.get("discord_url"):
                response = await client.post(
                    payload["discord_url"], json={"embeds": [embed]}
                )
                response.raise_for_status()
            token = getenv("DISCORD_BOT_TOKEN", "").strip()
            channel = getenv("DISCORD_BOT_CHANNEL_ID", "").strip()
            if token and channel:
                response = await client.post(
                    f"https://discord.com/api/v10/channels/{channel}/messages",
                    headers={"Authorization": f"Bot {token}"},
                    json={"embeds": [embed]},
                )
                response.raise_for_status()
    for record in payload.get("records", []):
        await notification_hub.publish(record)


async def process_one(factory, outbox_id: str | None = None) -> bool:
    token, now = _cuid(), _utcnow()
    async with factory() as db:
        result = await db.execute(
            text("""
            UPDATE notification_outbox SET lease_until=:lease, lease_token=:token, attempts=attempts+1
            WHERE id=(SELECT id FROM notification_outbox
                WHERE delivered_at IS NULL AND failed_at IS NULL AND available_at<=:now
                AND (lease_until IS NULL OR lease_until<:now) AND (CAST(:target AS text) IS NULL OR id=CAST(:target AS text))
                ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
            RETURNING id,payload,attempts
        """),
            {
                "lease": now + timedelta(minutes=2),
                "token": token,
                "now": now,
                "target": outbox_id,
            },
        )
        row = result.mappings().first()
        await db.commit()
        if not row:
            return False
    succeeded = False
    from .access import readable_records
    try:
        payload=dict(row['payload'])
        async with factory() as db:
            payload['records']=await readable_records(db,payload.get('records',[]))
        await deliver(payload)
        succeeded = True
    except Exception:
        # Provider URLs and credentials must never be included in diagnostics.
        logger.warning(
            "Notification delivery failed for outbox %s, attempt %s",
            row["id"],
            row["attempts"],
        )
    async with factory() as db:
        now = _utcnow()
        await db.execute(
            text("""
            UPDATE notification_outbox SET delivered_at=:delivered,failed_at=:failed,
                available_at=:retry,lease_until=NULL,lease_token=NULL,
                payload=CASE WHEN :clear THEN '{}'::jsonb ELSE payload END
            WHERE id=:id AND lease_token=:token
        """),
            {
                "id": row["id"],
                "token": token,
                "delivered": now if succeeded else None,
                "failed": now if not succeeded and row["attempts"] >= 8 else None,
                "retry": now + timedelta(seconds=min(3600, 5 * 2 ** row["attempts"])),
                "clear": succeeded,
            },
        )
        await db.commit()
    return True


async def outbox_loop(factory, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            if await progress(factory,'notification-outbox',process_one(factory)):
                continue
        except Exception:
            logger.warning("Notification outbox is unavailable")
        try:
            await asyncio.wait_for(stop.wait(), timeout=5)
        except TimeoutError:
            pass
