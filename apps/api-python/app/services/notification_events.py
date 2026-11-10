from __future__ import annotations

"""Durable notification events with an in-process WebSocket fan-out.

The notification row is always written to PostgreSQL first.  WebSocket and
Discord are delivery channels only, so a browser reconnect or a temporary
Discord outage can never make an Inbox event disappear.

The current deployment runs one public API container.  ``NotificationHub`` is
therefore intentionally process-local.  When the API is scaled horizontally,
the same interface can be backed by a shared pub/sub broker without changing
event producers or the web UI contract.

VI: Sự kiện thông báo bền vững, phát qua WebSocket trong cùng tiến trình. Dòng
thông báo luôn được ghi vào PostgreSQL trước; WebSocket và Discord chỉ là kênh
giao, nên trình duyệt kết nối lại hay Discord lỗi tạm thời không làm mất sự kiện
Inbox. Hiện chỉ có một container API public nên ``NotificationHub`` cố ý chỉ
nằm trong tiến trình; khi scale ngang, có thể thay bằng một broker pub/sub dùng
chung mà không đổi nơi phát sự kiện hay contract của giao diện web.
"""

import asyncio
import json
import logging
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from os import getenv
from typing import Any

import httpx
from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.audit_context import audit_agent
from ..core.clock import utcnow
from ..core.identifiers import cuid
from .commands import (
    CREATE_NOTIFICATION_BATCH_INSERT_NOTIFICATIONS,
)
from .microsoft_teams import teams_available, teams_mention_message, teams_message
from .queries import (
    DISCORD_WEBHOOK_SELECT_DISCORD_WEBHOOKS,
    ISSUE_RECIPIENT_IDS_SELECT_ISSUE_SUBSCRIPTIONS,
    PROJECT_RECIPIENT_IDS_SELECT_PROJECT_MEMBERS,
    PROJECT_TEAMS_BATCH_SELECT_PROJECT_TEAMS_CHANNELS,
    TEAM_RECIPIENT_IDS_SELECT_TEAM_MEMBERS,
    TEAMS_MENTION_CARD_SELECT_PROJECT_TEAMS_CHANNELS,
    TEAMS_MENTION_CARD_SELECT_USERS,
    TEAMS_WEBHOOKS_SELECT_TEAMS_WEBHOOKS,
    WORKSPACE_ROUTE_ID_SELECT_WORKSPACES,
)

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class NotificationBatch:
    records: list[dict[str, Any]] = field(default_factory=list)
    discord_url: str | None = None
    discord_embed: dict[str, Any] | None = None
    # Teams cards are rendered from ``discord_embed`` at delivery time.
    teams_urls: list[str] = field(default_factory=list)
    # Ready-made Teams messages ``{'url', 'message'}``: @mentions, and new-ticket cards.
    # VI: Message Teams dựng sẵn ``{'url', 'message'}``: @mention và card ticket mới.
    teams_cards: list[dict[str, Any]] = field(default_factory=list)


# One colour per event so a channel can be read at a glance.
EVENT_COLORS: dict[str, int] = {
    'issue.created': 0x5E6AD2,
    'issue.status_changed': 0xF2C94C,
    'issue.assignment': 0x26B5CE,
    'issue.comment_created': 0x4CB782,
    'project.updated': 0x5E6AD2,
    'project.update_created': 0x4CB782,
    'review.assigned': 0x5E6AD2,
    'review.updated': 0x26B5CE,
}
ENTITY_LABELS: dict[str, str] = {'issue': 'Issue', 'project': 'Project', 'review': 'Review'}
DISCORD_DESCRIPTION_LIMIT = 500


class NotificationHub:
    def __init__(self) -> None:
        self._connections: dict[tuple[str, str], set[WebSocket]] = defaultdict(set)

    async def connect(self, workspace_id: str, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[(workspace_id, user_id)].add(websocket)

    async def close_user(self, user_id: str) -> None:
        for (workspace, member), sockets in tuple(self._connections.items()):
            if member != user_id:
                continue
            for socket in tuple(sockets):
                self.disconnect(workspace, member, socket)
                try:
                    await socket.close(code=4401)
                except Exception:
                    pass

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
    # Session users and database rows carry `avatar_url`; an MCP principal's user
    # carries `avatarUrl`. Reading only one key left every notification an agent
    # caused without the actor's picture, so the Inbox showed initials instead.
    # VI: User phiên đăng nhập và dòng DB có `avatar_url`; user của principal MCP
    # có `avatarUrl`. Chỉ đọc một khoá khiến mọi thông báo do agent tạo mất ảnh
    # người thao tác, nên Inbox hiện chữ viết tắt thay vì ảnh.
    if hasattr(actor, 'get'):
        avatar = actor.get('avatar_url') or actor.get('avatarUrl')
    else:
        avatar = actor['avatar_url']
    return {'id': actor['id'], 'name': actor['name'], 'avatarUrl': avatar}


async def team_recipient_ids(db: AsyncSession, team_id: str | None) -> set[str]:
    result = await db.execute(TEAM_RECIPIENT_IDS_SELECT_TEAM_MEMBERS, {'team_id': team_id})
    return {row['user_id'] for row in result.mappings().all()}


async def issue_recipient_ids(db: AsyncSession, issue_id: str, assignee_id: str | None = None) -> set[str]:
    result = await db.execute(
        ISSUE_RECIPIENT_IDS_SELECT_ISSUE_SUBSCRIPTIONS, {'issue_id': issue_id}
    )
    recipients = {row['user_id'] for row in result.mappings().all()}
    if assignee_id:
        recipients.add(assignee_id)
    return recipients


async def project_recipient_ids(
    db: AsyncSession, project_id: str, lead_id: str | None = None
) -> set[str]:
    result = await db.execute(
        PROJECT_RECIPIENT_IDS_SELECT_PROJECT_MEMBERS,
        {'project_id': project_id},
    )
    recipients = {row['user_id'] for row in result.mappings().all()}
    if lead_id:
        recipients.add(lead_id)
    return recipients


async def _discord_webhook(db: AsyncSession, workspace_id: str) -> str | None:
    result = await db.execute(
        DISCORD_WEBHOOK_SELECT_DISCORD_WEBHOOKS,
        {'workspace_id': workspace_id},
    )
    return result.scalar_one_or_none()


async def _teams_webhooks(
    db: AsyncSession, workspace_id: str, entity_type: str, entity_id: str
) -> list[str]:
    """The workspace Teams channel plus the channel of the event's project."""

    if not teams_available():
        return []
    result = await db.execute(
        TEAMS_WEBHOOKS_SELECT_TEAMS_WEBHOOKS,
        {'workspace_id': workspace_id, 'entity_type': entity_type, 'entity_id': entity_id},
    )
    return list(result.scalars().all())


async def project_teams_batch(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    *,
    actor: Any,
    event_type: str,
    entity_type: str,
    title: str,
    message: str,
    entity_path: str,
    entity_label: str,
) -> NotificationBatch | None:
    """A card for the project's own Teams channel, or None when there is none to post to.

    The workspace channel is left out on purpose: it reaches people outside the project, and
    what a requester raised should stay with the project's team. The body is not sent for the
    same reason. Staging this as its own batch keeps a Teams failure from delaying Inbox delivery.
    VI: Card cho kênh Teams riêng của dự án, hoặc None khi không có kênh để gửi.

    VI: Cố ý bỏ kênh chung của workspace: kênh đó tới cả người ngoài dự án, còn điều người yêu cầu
    VI: gửi nên ở trong team của dự án. Nội dung không được gửi cũng vì lý do này. Tách thành batch
    VI: riêng để lỗi Teams không làm trễ việc gửi vào Inbox.
    """

    if not teams_available():
        return None
    result = await db.execute(
        PROJECT_TEAMS_BATCH_SELECT_PROJECT_TEAMS_CHANNELS,
        {'project_id': project_id, 'workspace_id': workspace_id},
    )
    channel = result.mappings().first()
    if channel is None:
        return None
    slug = await _workspace_route_id(db, workspace_id)
    app_url = _app_url()
    embed = _embed(
        event_type=event_type,
        entity_type=entity_type,
        entity_label=entity_label,
        title=title,
        message=message,
        url=f'{app_url}/{slug}{entity_path}' if app_url and slug else None,
        actor_data=actor_payload(actor),
        details=[('Project', channel['name'])],
        body=None,
        now=utcnow(),
    )
    return NotificationBatch(teams_cards=[{'url': channel['webhook_url'], 'message': teams_message(embed)}])


async def _teams_mention_card(
    db: AsyncSession, workspace_id: str, issue_id: str, recipients: set[str], embed: dict[str, Any]
) -> dict[str, Any] | None:
    """One card for the issue's Teams channel that @mentions every reachable recipient.

    ``recipients`` must already be filtered by issue access. The project's channel is preferred so
    the card lands where the work is discussed; without one the workspace channel is used, and
    without either nothing is sent. A recipient is mentioned only when they signed in with
    Microsoft (their Entra object id is the mention id) and have not turned Teams off.
    VI: Một card cho kênh Teams của issue, @mention mọi người nhận có thể nhận.
    VI: ``recipients`` phải đã được lọc theo quyền xem issue. Ưu tiên kênh của dự án để card nằm
    VI: nơi công việc được trao đổi; không có thì dùng kênh workspace, không có cả hai thì không
    VI: gửi. Chỉ mention người đã đăng nhập bằng Microsoft (Entra object id là id mention) và
    VI: chưa tắt Teams.
    """

    if not recipients or not teams_available():
        return None
    url = (
        await db.execute(
            TEAMS_MENTION_CARD_SELECT_PROJECT_TEAMS_CHANNELS,
            {'issue_id': issue_id, 'workspace_id': workspace_id},
        )
    ).scalar_one_or_none()
    if not url:
        return None
    people = (
        await db.execute(
            TEAMS_MENTION_CARD_SELECT_USERS,
            {'users': sorted(recipients), 'workspace_id': workspace_id},
        )
    ).mappings().all()
    mentioned = [dict(person) for person in people if person['id']]
    if not mentioned:
        return None
    return {'url': url, 'message': teams_mention_message(embed, mentioned)}


def _app_url() -> str:
    return (getenv('APP_URL') or getenv('NEXT_PUBLIC_APP_URL') or '').rstrip('/')


async def _workspace_route_id(db: AsyncSession, workspace_id: str) -> str | None:
    result = await db.execute(
        WORKSPACE_ROUTE_ID_SELECT_WORKSPACES, {'workspace_id': workspace_id}
    )
    return result.scalar_one_or_none()


def _http_url(value: str | None) -> str | None:
    """Keep only absolute links.

    Discord rejects a whole embed — with a 4xx nobody sees — when a `url` or an
    `icon_url` is not absolute. Stored avatars are object keys or app-relative
    paths, so they must never be passed through unchecked.
    """

    if not value:
        return None
    return value if value.startswith('http://') or value.startswith('https://') else None


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

    # Discord caps a title at 256 characters and an author at 256; over either
    # limit it rejects the entire embed.
    heading = f'{entity_label} · {title}' if entity_label else title
    embed: dict[str, Any] = {
        'title': _excerpt(heading, 256),
        'color': EVENT_COLORS.get(event_type, 0x5E6AD2),
        'author': {'name': _excerpt(f'{actor_data["name"]} {message}', 256)},
        'footer': {'text': f'Flowie · {ENTITY_LABELS.get(entity_type, entity_type.title())}'},
        # Timestamps are stored naive in UTC; Discord rejects an embed whose
        # timestamp carries no zone, and a rejected embed fails silently.
        'timestamp': now.isoformat() if now.tzinfo else f'{now.isoformat()}Z',
    }
    icon_url = _http_url(actor_data.get('avatarUrl'))
    if icon_url:
        embed['author']['icon_url'] = icon_url
    absolute_url = _http_url(url)
    if absolute_url:
        embed['url'] = absolute_url
    if body:
        embed['description'] = body
    # A field value is capped by Discord at 1024 characters, and a renamed
    # title can carry far more than that.
    fields = [
        {'name': name, 'value': shortened, 'inline': len(value) <= 40}
        for name, value, shortened in (
            (name, value, _excerpt(value, 200)) for name, value in (details or [])
        )
        # An empty field value is rejected as hard as an oversized one.
        if name and shortened
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
    teams_mention: bool = False,
) -> NotificationBatch:
    """Persist one Inbox row per recipient and prepare post-commit delivery.

    ``entity_label`` (an issue code), ``details`` (``from → to`` pairs) and
    ``body`` (a comment or an update) are what make a delivered message
    readable without opening the app. They are stored on the Inbox row too, so
    the same detail is available there without another migration.

    ``teams_mention`` (issues only) also prepares a Teams card that @mentions the recipients, for
    events addressed to a person such as an assignment or a comment mention.
    VI: ``teams_mention`` (chỉ cho issue) chuẩn bị thêm card Teams @mention người nhận, cho sự kiện
    VI: gửi đích danh như giao việc hoặc mention trong comment.
    """

    now = utcnow()
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
    # People are not notified of their own actions, except when an MCP agent acted with their
    # token: the agent's comments, status changes and mentions must still reach that person's
    # Inbox, labelled with the agent so it is clear who did the work.
    # VI: Không thông báo cho người về hành động của chính họ, trừ khi agent MCP thao tác bằng
    # VI: token của họ: comment, đổi trạng thái và mention của agent vẫn phải tới Inbox của
    # VI: người đó, kèm tên agent để rõ ai đã làm.
    agent = audit_agent.get()
    if agent:
        data['agent'] = agent
    records: list[dict[str, Any]] = []
    from ..modules.notifications.access import readable_recipients
    recipients=await readable_recipients(db,workspace_id,entity_type,entity_id,set(recipient_ids)-(set() if agent else {actor['id']}))
    for recipient_id in recipients:
        notification_id = cuid()
        await db.execute(
            CREATE_NOTIFICATION_BATCH_INSERT_NOTIFICATIONS,
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

    if not discord and not teams_mention:
        return NotificationBatch(records=records)

    slug = await _workspace_route_id(db, workspace_id)
    app_url = _app_url()
    embed = _embed(
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
    )
    card = (
        await _teams_mention_card(db, workspace_id, entity_id, recipients, embed)
        if teams_mention and entity_type == 'issue'
        else None
    )
    teams_cards = [card] if card else []
    if not discord:
        return NotificationBatch(records=records, teams_cards=teams_cards)
    return NotificationBatch(
        records=records,
        discord_url=await _discord_webhook(db, workspace_id),
        teams_urls=await _teams_webhooks(db, workspace_id, entity_type, entity_id),
        teams_cards=teams_cards,
        # The optional bot channel is configured globally, rather than per
        # workspace. Keep a payload even when this workspace has no webhook
        # so a bot-only installation still receives the event.
        discord_embed=embed,
    )


async def _send_discord(url: str, embed: dict[str, Any]) -> None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json={'embeds': [embed]})
        # A rejected webhook answers 4xx rather than raising, so without this
        # line a deleted webhook or a malformed embed fails in total silence.
        if not response.is_success:
            logger.warning(
                'Discord webhook rejected the notification: %s %s',
                response.status_code,
                response.text[:500],
            )
    except httpx.HTTPError as error:
        # Delivery failures intentionally do not roll back an already durable
        # Inbox event. A future outbox worker can retry these failures.
        logger.warning('Discord webhook is unreachable: %s', error)


async def _send_discord_bot(embed: dict[str, Any]) -> None:
    """Deliver to a channel as the optional Flowie Discord bot."""

    token = getenv('DISCORD_BOT_TOKEN', '').strip()
    channel_id = getenv('DISCORD_BOT_CHANNEL_ID', '').strip()
    if not token or not channel_id:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f'https://discord.com/api/v10/channels/{channel_id}/messages',
                headers={'Authorization': f'Bot {token}'},
                json={'embeds': [embed]},
            )
        if not response.is_success:
            logger.warning(
                'Discord bot rejected the notification: %s %s',
                response.status_code,
                response.text[:500],
            )
    except httpx.HTTPError as error:
        logger.warning('Discord bot is unreachable: %s', error)


async def _send_teams(url: str, message: dict[str, Any]) -> None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json=message)
        if not response.is_success:
            logger.warning(
                'Microsoft Teams rejected the notification: %s %s',
                response.status_code,
                response.text[:500],
            )
    except httpx.HTTPError as error:
        logger.warning('Microsoft Teams is unreachable: %s', error)


async def publish_notification_batches(*batches: NotificationBatch | None) -> None:
    webhook_deliveries: list[tuple[str, dict[str, Any]]] = []
    teams_deliveries: list[tuple[str, dict[str, Any]]] = []
    bot_deliveries: dict[str, dict[str, Any]] = {}
    for batch in batches:
        if batch is None:
            continue
        for record in batch.records:
            await notification_hub.publish(record)
        teams_deliveries.extend((card['url'], card['message']) for card in batch.teams_cards)
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
        teams_deliveries.extend((url, teams_message(batch.discord_embed)) for url in batch.teams_urls)
    if not webhook_deliveries and bot_deliveries:
        logger.info('Notification has no Discord webhook configured for this workspace.')
    for url, embed in webhook_deliveries:
        asyncio.create_task(_send_discord(url, embed))
    for embed in bot_deliveries.values():
        asyncio.create_task(_send_discord_bot(embed))
    for url, message in teams_deliveries:
        asyncio.create_task(_send_teams(url, message))
