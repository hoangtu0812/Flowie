"""Inbox notifications when an agent in a sandbox finishes or waits (docs/sandbox.md).

Every 15 seconds the API reads the sessions of each running sandbox, as termi
does for its push notifications, and compares each session's state with the
one it saw before: `working` turning to `idle` means the agent finished, any
state turning to `waiting` means it needs the person (to approve a command or
pick an option). Each such change becomes a Flowie notification for the
sandbox's owner whose Open link goes to that session. The first look at a
session only records it, so a restart of the API sends nothing.
VI: Thông báo inbox khi agent trong sandbox làm xong hoặc đang chờ (docs/sandbox.md).
VI: Cứ 15 giây API đọc các phiên của từng sandbox đang chạy, như termi làm cho thông báo
VI: đẩy, và so trạng thái mỗi phiên với lần trước: `working` thành `idle` nghĩa là agent đã
VI: xong, bất kỳ trạng thái nào thành `waiting` nghĩa là nó cần người dùng (duyệt lệnh hay
VI: chọn phương án). Mỗi lần đổi như vậy thành một thông báo Flowie cho chủ sandbox, nút Mở
VI: dẫn tới đúng phiên. Lần đầu thấy một phiên chỉ ghi nhận, nên API khởi động lại không gửi gì.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ...core.clock import utcnow
from ...core.config import Settings
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...services.notification_events import notification_hub
from .api import _agent, _manager
from .commands import NOTIFY_INSERT_NOTIFICATIONS
from .queries import (
    NOTIFY_FIRST_WORKSPACE_SELECT_WORKSPACE_MEMBERS,
    NOTIFY_ISSUE_WORKSPACE_SELECT_ISSUES,
)

logger = logging.getLogger(__name__)

CHECK_SECONDS = 15
AGENT_NAMES = {'claude': 'Claude Code', 'codex': 'Codex'}
ISSUE_PREFIX = re.compile(r'^([A-Z][A-Z0-9]*-\d+)')


def changes(before: dict[str, str], sessions: list[dict[str, Any]]) -> list[tuple[str, dict[str, Any]]]:
    """(`finished` or `waiting`, session) for each agent session whose state changed that way.
    VI: (`finished` hoặc `waiting`, phiên) cho mỗi phiên agent đổi trạng thái theo cách đó."""
    found = []
    for session in sessions:
        previous, state = before.get(session['name']), session.get('state')
        if not session.get('agent') or previous is None or previous == state:
            continue
        if state == 'waiting':
            found.append(('waiting', session))
        elif previous == 'working' and state == 'idle':
            found.append(('finished', session))
    return found


async def _workspace(db: AsyncSession, user_id: str, session: str) -> str | None:
    match = ISSUE_PREFIX.match(session)
    if match:
        workspace = await db.scalar(NOTIFY_ISSUE_WORKSPACE_SELECT_ISSUES, {'user': user_id, 'identifier': match.group(1)})
        if workspace:
            return workspace
    return await db.scalar(NOTIFY_FIRST_WORKSPACE_SELECT_WORKSPACE_MEMBERS, {'user': user_id})


async def notify(factory: async_sessionmaker[AsyncSession], user_id: str, kind: str, session: dict[str, Any]) -> bool:
    agent = AGENT_NAMES.get(session['agent'], 'The agent')
    title = f'{agent} finished in {session["name"]}' if kind == 'finished' else f'{agent} is waiting for you in {session["name"]}'
    data = {
        'title': title,
        'message': (session.get('preview') or '').strip()[-300:] or title,
        'entityPath': f'/sandbox?session={session["name"]}',
        'session': session['name'],
        'agent': {'name': agent},
    }
    async with factory() as db:
        workspace = await _workspace(db, user_id, session['name'])
        if not workspace:
            return False
        notification_id, now = cuid(), utcnow()
        await db.execute(NOTIFY_INSERT_NOTIFICATIONS, {
            'id': notification_id, 'workspace_id': workspace, 'user_id': user_id, 'type': f'sandbox.agent_{kind}',
            'entity_id': session['name'], 'data': json.dumps(data), 'now': now,
        })
        await db.commit()
    await notification_hub.publish({
        'id': notification_id, 'workspaceId': workspace, 'userId': user_id, 'type': f'sandbox.agent_{kind}',
        'entityType': 'sandbox', 'entityId': session['name'], 'data': data, 'readAt': None,
        'createdAt': now.isoformat(),
    })
    return True


async def check_sandboxes(
    settings: Settings, factory: async_sessionmaker[AsyncSession], seen: dict[str, dict[str, str]]
) -> int:
    """One pass over the running sandboxes; `seen` keeps each session's last state between passes.
    VI: Một lượt qua các sandbox đang chạy; `seen` giữ trạng thái cuối của từng phiên giữa các lượt."""
    _, running = await _manager(settings, 'GET', '/sandboxes')
    sent = 0
    alive = set()
    for sandbox in running or []:
        user_id = sandbox['userId']
        alive.add(user_id)
        try:
            _, sessions = await _agent(settings, user_id, 'GET', 'sessions')
        except ApiError:
            continue
        sessions = sessions if isinstance(sessions, list) else []
        for kind, session in changes(seen.get(user_id, {}), sessions):
            sent += await notify(factory, user_id, kind, session)
        seen[user_id] = {session['name']: session.get('state') for session in sessions}
    for user_id in set(seen) - alive:
        del seen[user_id]  # a stopped sandbox starts fresh next time
    return sent


async def sandbox_notify_loop(
    settings: Settings, factory: async_sessionmaker[AsyncSession], stop: asyncio.Event,
    interval_seconds: float = CHECK_SECONDS,
) -> None:
    seen: dict[str, dict[str, str]] = {}
    while not stop.is_set():
        try:
            await check_sandboxes(settings, factory, seen)
        except Exception:  # Keep the API alive; the check repeats next interval.
            logger.exception('Sandbox notification check failed.')
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
