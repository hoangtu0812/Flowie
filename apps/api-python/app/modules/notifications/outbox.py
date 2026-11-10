from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import asdict
from datetime import timedelta
from os import getenv

import httpx
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.identifiers import cuid
from ...services.microsoft_teams import teams_message
from ...services.notification_events import NotificationBatch, notification_hub
from ..operations.heartbeats import progress
from .commands import (
    PROCESS_ONE_UPDATE_NOTIFICATION_OUTBOX,
    PROCESS_ONE_UPDATE_NOTIFICATION_OUTBOX_2,
    STAGE_NOTIFICATIONS_INSERT_NOTIFICATION_OUTBOX,
)

logger = logging.getLogger(__name__)


async def stage_notifications(
    db: AsyncSession, *batches: NotificationBatch | None, workspace_id: str
) -> None:
    """Persist delivery intent in the same transaction as the domain mutation."""
    for batch in batches:
        if batch is not None and (batch.records or batch.discord_embed or batch.teams_cards):
            await db.execute(
                STAGE_NOTIFICATIONS_INSERT_NOTIFICATION_OUTBOX,
                {
                    "id": cuid(),
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
            for url in payload.get("teams_urls", []):
                response = await client.post(url, json=teams_message(embed))
                response.raise_for_status()
    # Teams cards that @mention a person are rendered when the event is staged, so the outbox only
    # posts them; a retry may repeat one, matching the other remote channels.
    # VI: Card Teams @mention người nhận được dựng lúc ghi sự kiện, nên outbox chỉ việc gửi; lần
    # VI: thử lại có thể gửi lặp, giống các kênh từ xa khác.
    if payload.get("teams_cards"):
        async with httpx.AsyncClient(timeout=15) as client:
            for card in payload["teams_cards"]:
                response = await client.post(card["url"], json=card["message"])
                response.raise_for_status()
    for record in payload.get("records", []):
        await notification_hub.publish(record)


async def process_one(factory, outbox_id: str | None = None) -> bool:
    token, now = cuid(), utcnow()
    async with factory() as db:
        result = await db.execute(
            PROCESS_ONE_UPDATE_NOTIFICATION_OUTBOX,
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
        now = utcnow()
        await db.execute(
            PROCESS_ONE_UPDATE_NOTIFICATION_OUTBOX_2,
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
