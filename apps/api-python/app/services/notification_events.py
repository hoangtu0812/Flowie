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
    discord_embed: dict[str, Any] | None = None


# One colour per event so a channel can be read at a glance.
EVENT_COLORS: dict[str, int] = {
    'issue.created': 0x5E6AD2,
    'issue.status_changed': 0xF2C94C,
    'issue.assignment': 0x26B5CE,
    'issue.comment_created': 0x4CB782,
    'project.updated': 0x5E6AD2,
    'project.update_created': 0x4CB782,
}
ENTITY_LABELS: dict[str, str] = {'issue': 'Issue', 'project': 'Project'}
DISCORD_DESCRIPTION_LIMIT = 500


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


def _app_url() -> str:
    return (getenv('APP_URL') or getenv('NEXT_PUBLIC_APP_URL') or '').rstrip('/')


async def _workspace_slug(db: AsyncSession, workspace_id: str) -> str | None:
    result = await db.execute(
        text('SELECT slug FROM workspaces WHERE id = :workspace_id'), {'workspace_id': workspace_id}
    )
    return result.scalar_one_or_none()


def _excerpt(value: str | None, limit: int = DISCORD_DESCRIPTION_LIMIT) -> str | None:
    if not value:
        return None
    collapsed = ' '.join(value.split())
    return collapsed if len(collapsed) <= limit else f'{collapsed[: limit - 1]}…'


def _embed(
    *,
    event_type: str,
    entity_type: str,
    entity_label: str | None,
    title: str,
    message: str,
    url: str | None,
    actor_data: dict[str, str | None],
    details: list[tuple[str, str]] | None,
    body: str | None,
    now: Any,
) -> dict[str, Any]:
    """A Discord embed carrying what changed, not merely that something did."""

    author = f'{actor_data["name"]} {message}'
    embed: dict[str, Any] = {
        'title': f'{entity_label} · {title}' if entity_label else title,
        'color': EVENT_COLORS.get(event_type, 0x5E6AD2),
        'author': {'name': author},
        'footer': {'text': f'Flowie · {ENTITY_LABELS.get(entity_type, entity_type.title())}'},
        # Timestamps are stored naive in UTC; Discord rejects an embed whose
        # timestamp carries no zone, and a rejected embed fails silently.
        'timestamp': now.isoformat() if now.tzinfo else f'{now.isoformat()}Z',
    }
    if actor_data.get('avatarUrl'):
        embed['author']['icon_url'] = actor_data['avatarUrl']
    if url:
        embed['url'] = url
    if body:
        embed['description'] = body
    # A field value is capped by Discord at 1024 characters, and a renamed
    # title can carry far more than that.
    fields = [
        {'name': name, 'value': _excerpt(value, 200) or '', 'inline': len(value) <= 40}
        for name, value in (details or [])
        if value
    ]
    if fields:
        embed['fields'] = fields
    return embed


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
    entity_label: str | None = None,
    details: list[tuple[str, str]] | None = None,
    body: str | None = None,
    discord: bool = True,
) -> NotificationBatch:
    """Persist one Inbox row per recipient and prepare post-commit delivery.

    ``entity_label`` (an issue code), ``details`` (``from → to`` pairs) and
    ``body`` (a comment or an update) are what make a delivered message
    readable without opening the app. They are stored on the Inbox row too, so
    the same detail is available there without another migration.
    """

    now = _utcnow()
    actor_data = actor_payload(actor)
    body_excerpt = _excerpt(body)
    data: dict[str, Any] = {
        'title': title,
        'message': message,
        'entityPath': entity_path,
        'actor': actor_data,
    }
    if entity_label:
        data['entityLabel'] = entity_label
    if details:
        data['details'] = [{'name': name, 'value': value} for name, value in details if value]
    if body_excerpt:
        data['body'] = body_excerpt
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

    if not discord:
        return NotificationBatch(records=records)

    slug = await _workspace_slug(db, workspace_id)
    app_url = _app_url()
    return NotificationBatch(
        records=records,
        discord_url=await _discord_webhook(db, workspace_id),
        # The optional bot channel is configured globally, rather than per
        # workspace. Keep a payload even when this workspace has no webhook
        # so a bot-only installation still receives the event.
        discord_embed=_embed(
            event_type=event_type,
            entity_type=entity_type,
            entity_label=entity_label,
            title=title,
            message=message,
            url=f'{app_url}/{slug}{entity_path}' if app_url and slug else None,
            actor_data=actor_data,
            details=details,
            body=body_excerpt,
            now=now,
        ),
    )


async def _send_discord(url: str, embed: dict[str, Any]) -> None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, json={'embeds': [embed]})
    except httpx.HTTPError:
        # Delivery failures intentionally do not roll back an already durable
        # Inbox event. A future outbox worker can retry these failures.
        return


async def _send_discord_bot(embed: dict[str, Any]) -> None:
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
                json={'embeds': [embed]},
            )
    except httpx.HTTPError:
        return


async def publish_notification_batches(*batches: NotificationBatch | None) -> None:
    webhook_deliveries: list[tuple[str, dict[str, Any]]] = []
    bot_deliveries: dict[str, dict[str, Any]] = {}
    for batch in batches:
        if batch is None:
            continue
        for record in batch.records:
            await notification_hub.publish(record)
        if batch.discord_embed is None:
            continue
        # Several batches can report the same event; deliver each distinct
        # embed once.
        key = json.dumps(batch.discord_embed, sort_keys=True, default=str)
        if key in bot_deliveries:
            continue
        bot_deliveries[key] = batch.discord_embed
        if batch.discord_url:
            webhook_deliveries.append((batch.discord_url, batch.discord_embed))
    for url, embed in webhook_deliveries:
        asyncio.create_task(_send_discord(url, embed))
    for embed in bot_deliveries.values():
        asyncio.create_task(_send_discord_bot(embed))
