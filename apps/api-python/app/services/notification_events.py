from __future__ import annotations

"""Durable notification events with an in-process WebSocket fan-out.

The notification row is always written to PostgreSQL first.  WebSocket and
Discord are delivery channels only, so a browser reconnect or a temporary
Discord outage can never make an Inbox event disappear.

The current deployment runs one public API container.  ``NotificationHub`` is
therefore intentionally process-local.  When the API is scaled horizontally,
the same interface can be backed by Redis pub/sub without changing event
producers or the Circle UI contract.
"""

import asyncio
import json
from collections import defaultdict
from dataclasses import dataclass, field
from os import getenv
from typing import Any, Iterable

import httpx
from fastapi import WebSocket
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..domains.auth import _cuid, _utcnow


@dataclass(slots=True)
class NotificationBatch:
    records: list[dict[str, Any]] = field(default_factory=list)
    discord_url: str | None = None
    discord_content: str | None = None


class NotificationHub:
    def __init__(self) -> None:
        self._connections: dict[tuple[str, str], set[WebSocket]] = defaultdict(set)

    async def connect(self, workspace_id: str, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[(workspace_id, user_id)].add(websocket)

    def disconnect(self, workspace_id: str, user_id: str, websocket: WebSocket) -> None:
        key = (workspace_id, user_id)
        self._connections[key].discard(websocket)
        if not self._connections[key]:
            self._connections.pop(key, None)

    async def publish(self, record: dict[str, Any]) -> None:
        key = (record['workspaceId'], record['userId'])
        payload = {'type': 'notification.created', 'notification': record}
        stale: list[WebSocket] = []
        for socket in tuple(self._connections.get(key, ())):
            try:
                await socket.send_json(payload)
            except Exception:  # pragma: no cover - depends on a disconnected peer
                stale.append(socket)
        for socket in stale:
            self.disconnect(key[0], key[1], socket)


notification_hub = NotificationHub()


def actor_payload(actor: Any) -> dict[str, str | None]:
    return {
        'id': actor['id'],
        'name': actor['name'],
        'avatarUrl': actor.get('avatar_url') if hasattr(actor, 'get') else actor['avatar_url'],
    }


async def team_recipient_ids(db: AsyncSession, team_id: str) -> set[str]:
    result = await db.execute(text('SELECT user_id FROM team_members WHERE team_id = :team_id'), {'team_id': team_id})
    return {row['user_id'] for row in result.mappings().all()}


async def issue_recipient_ids(db: AsyncSession, issue_id: str, assignee_id: str | None = None) -> set[str]:
    result = await db.execute(
        text('SELECT user_id FROM issue_subscriptions WHERE issue_id = :issue_id'), {'issue_id': issue_id}
    )
    recipients = {row['user_id'] for row in result.mappings().all()}
    if assignee_id:
        recipients.add(assignee_id)
    return recipients


async def project_recipient_ids(
    db: AsyncSession, project_id: str, lead_id: str | None = None
) -> set[str]:
    result = await db.execute(
        text(
            '''SELECT user_id FROM project_members WHERE project_id = :project_id
               UNION SELECT user_id FROM project_subscriptions WHERE project_id = :project_id'''
        ),
        {'project_id': project_id},
    )
    recipients = {row['user_id'] for row in result.mappings().all()}
    if lead_id:
        recipients.add(lead_id)
    return recipients


async def _discord_webhook(db: AsyncSession, workspace_id: str) -> str | None:
    result = await db.execute(
        text(
            '''SELECT webhook_url FROM discord_webhooks
               WHERE workspace_id = :workspace_id AND enabled = TRUE LIMIT 1'''
        ),
        {'workspace_id': workspace_id},
    )
    return result.scalar_one_or_none()


async def create_notification_batch(
    db: AsyncSession,
    *,
    workspace_id: str,
    recipient_ids: Iterable[str],
    actor: Any,
    event_type: str,
    entity_type: str,
    entity_id: str,
    title: str,
    message: str,
    entity_path: str,
    discord: bool = True,
) -> NotificationBatch:
    """Persist one Inbox row per recipient and prepare post-commit delivery."""

    now = _utcnow()
    actor_data = actor_payload(actor)
    data = {
        'title': title,
        'message': message,
        'entityPath': entity_path,
        'actor': actor_data,
    }
    records: list[dict[str, Any]] = []
    for recipient_id in set(recipient_ids) - {actor['id']}:
        notification_id = _cuid()
        await db.execute(
            text(
                '''INSERT INTO notifications
                   (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                   VALUES (:id, :workspace_id, :user_id, :type, :entity_type, :entity_id,
                           CAST(:data AS jsonb), :created_at)'''
            ),
            {
                'id': notification_id,
                'workspace_id': workspace_id,
                'user_id': recipient_id,
                'type': event_type,
                'entity_type': entity_type,
                'entity_id': entity_id,
                'data': json.dumps(data),
                'created_at': now,
            },
        )
        records.append(
            {
                'id': notification_id,
                'workspaceId': workspace_id,
                'userId': recipient_id,
                'type': event_type,
                'entityType': entity_type,
                'entityId': entity_id,
                'data': data,
                'readAt': None,
                'createdAt': now.isoformat(),
            }
        )

    webhook = await _discord_webhook(db, workspace_id) if discord else None
    return NotificationBatch(
        records=records,
        discord_url=webhook,
        # The optional bot channel is configured globally, rather than per
        # workspace. Keep a payload even when this workspace has no webhook
        # so a bot-only installation still receives the event.
        discord_content=f'**{actor_data["name"]}** {message}: **{title}**',
    )


async def _send_discord(url: str, content: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, json={'content': content})
    except httpx.HTTPError:
        # Delivery failures intentionally do not roll back an already durable
        # Inbox event. A future outbox worker can retry these failures.
        return


async def _send_discord_bot(content: str) -> None:
    """Deliver to a channel as the optional Flowie Discord bot."""

    token = getenv('DISCORD_BOT_TOKEN', '').strip()
    channel_id = getenv('DISCORD_BOT_CHANNEL_ID', '').strip()
    if not token or not channel_id:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f'https://discord.com/api/v10/channels/{channel_id}/messages',
                headers={'Authorization': f'Bot {token}'},
                json={'content': content},
            )
    except httpx.HTTPError:
        return


async def publish_notification_batches(*batches: NotificationBatch) -> None:
    discord_deliveries: dict[str, str] = {}
    bot_deliveries: set[str] = set()
    for batch in batches:
        for record in batch.records:
            await notification_hub.publish(record)
        if batch.discord_url and batch.discord_content:
            discord_deliveries.setdefault(batch.discord_url, batch.discord_content)
        if batch.discord_content:
            bot_deliveries.add(batch.discord_content)
    for url, content in discord_deliveries.items():
        asyncio.create_task(_send_discord(url, content))
    for content in bot_deliveries:
        asyncio.create_task(_send_discord_bot(content))
