"""Generic outgoing webhooks: signed JSON events for systems outside Flowie (DTD-904).

An event is staged as one delivery row per subscribed webhook inside the transaction of the
change that caused it, so a restart cannot lose it. A worker then posts each row with an
HMAC-SHA256 signature, retries 5xx, 429, timeouts and network errors with backoff, records the
HTTP status and duration, and turns a webhook off after too many failures in a row.

VI: Webhook gửi ra ngoài dạng chung: sự kiện JSON có chữ ký cho hệ thống ngoài Flowie (DTD-904).
VI: Mỗi sự kiện được ghi thành một dòng delivery cho từng webhook đăng ký, trong cùng transaction
VI: với thay đổi gây ra nó, nên khởi động lại không làm mất sự kiện. Worker gửi từng dòng kèm chữ
VI: ký HMAC-SHA256, thử lại lỗi 5xx, 429, timeout và lỗi mạng với thời gian chờ tăng dần, ghi mã
VI: HTTP và thời gian phản hồi, và tắt webhook khi lỗi liên tiếp quá nhiều lần.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import timedelta
from hashlib import sha256
from hmac import new as new_hmac
from os import getenv
from typing import Any
from urllib.parse import urlsplit

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..link_metadata.service import public_url
from ..operations.heartbeats import progress
from .commands import (
    COUNT_OUTGOING_WEBHOOK_FAILURE,
    DROP_PENDING_OUTGOING_WEBHOOK_DELIVERIES,
    FINISH_OUTGOING_WEBHOOK_DELIVERY,
    LEASE_OUTGOING_WEBHOOK_DELIVERY,
    PRUNE_OUTGOING_WEBHOOK_DELIVERIES,
    RESET_OUTGOING_WEBHOOK_FAILURES,
    STAGE_OUTGOING_WEBHOOK_DELIVERY,
)
from .queries import OUTGOING_WEBHOOK_TARGET, SUBSCRIBED_OUTGOING_WEBHOOKS

logger = logging.getLogger(__name__)

# The events already broadcast to the workspace Discord/Teams channels. Service Desk ticket
# events stay out for the same reason they stay out of those channels: a requester's
# conversation is not shared beyond the project team.
# VI: Các sự kiện đang phát ra kênh Discord/Teams chung của workspace. Sự kiện ticket Service
# VI: Desk bị loại vì cùng lý do bị loại khỏi các kênh đó: trao đổi của người yêu cầu không được
# VI: chia sẻ ra ngoài team dự án.
WEBHOOK_EVENTS = (
    'issue.created',
    'issue.status_changed',
    'issue.assignment',
    'issue.comment_created',
    'project.updated',
    'project.update_created',
)
MAX_ATTEMPTS = 8
DISABLE_AFTER_FAILURES = 15
RETENTION = timedelta(days=30)
TIMEOUT_SECONDS = 10


def allowed_hosts() -> set[str]:
    """Hosts exempt from the public-address check, from `OUTGOING_WEBHOOK_ALLOWED_HOSTS`.

    A comma-separated list of exact host names that may resolve to private addresses, for
    internal receivers such as the TAM platform. Everything else must resolve to public IPs.
    VI: Host được miễn kiểm tra địa chỉ công khai, lấy từ `OUTGOING_WEBHOOK_ALLOWED_HOSTS`: danh
    VI: sách tên host chính xác, phân tách bằng dấu phẩy, được phép phân giải ra IP nội bộ, dành
    VI: cho bên nhận nội bộ như nền tảng TAM. Mọi host khác phải phân giải ra IP công khai.
    """
    return {host.strip().lower() for host in getenv('OUTGOING_WEBHOOK_ALLOWED_HOSTS', '').split(',') if host.strip()}


async def checked_url(url: str) -> str:
    """Return the URL when Flowie may post to it, else raise a 400.

    Only https without user info is accepted, and the host must resolve to public addresses
    unless it is allowlisted. It runs on save and again before every send, because DNS can
    change after a webhook is saved; redirects are never followed, so a receiver cannot bounce
    the request to an internal host either.
    VI: Trả về URL nếu Flowie được phép gửi tới, ngược lại báo lỗi 400. Chỉ nhận https không kèm
    VI: thông tin đăng nhập, và host phải phân giải ra địa chỉ công khai trừ khi nằm trong
    VI: allowlist. Kiểm tra khi lưu và lặp lại trước mỗi lần gửi, vì DNS có thể đổi sau khi lưu;
    VI: redirect không bao giờ được theo, nên bên nhận cũng không đẩy được request về host nội bộ.
    """
    value = url.strip()
    parts = urlsplit(value)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password:
        raise ApiError(400, 'The webhook URL must start with https:// and carry no credentials.', 'Bad Request')
    if parts.hostname.lower() in allowed_hosts():
        return value
    try:
        await public_url(value)
    except ApiError as error:
        raise ApiError(
            400,
            'The webhook host must resolve to a public address. Ask the administrator to add an internal host to OUTGOING_WEBHOOK_ALLOWED_HOSTS.',
            'Bad Request',
        ) from error
    return value


def signature(secret: str, body: bytes) -> str:
    """`sha256=<hex>` of HMAC-SHA256 over the exact request body, as GitHub signs webhooks.

    VI: `sha256=<hex>` của HMAC-SHA256 trên đúng body của request, giống cách GitHub ký webhook.
    """
    return 'sha256=' + new_hmac(secret.encode('utf-8'), body, sha256).hexdigest()


def event_payload(workspace_id: str, event: str, data: dict[str, Any]) -> dict[str, Any]:
    """The stable envelope every receiver gets; `id` is shared by all webhooks of one event.

    VI: Lớp vỏ ổn định mọi bên nhận đều nhận; `id` dùng chung cho mọi webhook của một sự kiện.
    """
    return {
        'id': cuid(),
        'event': event,
        'occurredAt': f'{utcnow().isoformat()}Z',
        'workspaceId': workspace_id,
        'data': data,
    }


async def stage_outgoing_event(db: AsyncSession, workspace_id: str, event: str, data: dict[str, Any]) -> None:
    """Queue the event for every enabled webhook of the workspace that subscribed to it.

    Runs inside the caller's transaction and commits nothing itself.
    VI: Xếp sự kiện cho mọi webhook đang bật của workspace có đăng ký sự kiện đó. Chạy trong
    VI: transaction của nơi gọi và không tự commit.
    """
    if event not in WEBHOOK_EVENTS:
        return
    webhook_ids = (
        await db.execute(SUBSCRIBED_OUTGOING_WEBHOOKS, {'workspace_id': workspace_id, 'event': event})
    ).scalars().all()
    if not webhook_ids:
        return
    payload = json.dumps(event_payload(workspace_id, event, data))
    now = utcnow()
    await db.execute(
        STAGE_OUTGOING_WEBHOOK_DELIVERY,
        [
            {'id': cuid(), 'webhook_id': webhook_id, 'event': event, 'payload': payload, 'now': now}
            for webhook_id in webhook_ids
        ],
    )


async def _post(url: str, secret: str, delivery_id: str, event: str, payload: dict[str, Any]) -> tuple[int | None, str | None, bool]:
    """Send one delivery; return (HTTP status, error, whether a retry may succeed).

    VI: Gửi một delivery; trả về (mã HTTP, lỗi, có nên thử lại hay không).
    """
    body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    headers = {
        'content-type': 'application/json',
        'user-agent': 'Flowie-Webhooks/1',
        'x-flowie-event': event,
        'x-flowie-delivery': delivery_id,
        'x-flowie-signature': signature(secret, body),
    }
    try:
        await checked_url(url)
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=False) as client:
            response = await client.post(url, content=body, headers=headers)
    except ApiError as error:
        return None, error.message, True
    except httpx.TimeoutException:
        return None, 'Timed out', True
    except httpx.HTTPError as error:
        # The exception class names the failure without echoing the URL or its query string.
        # VI: Tên lớp lỗi cho biết lỗi gì mà không lặp lại URL hay query string của nó.
        return None, type(error).__name__, True
    if response.is_success:
        return response.status_code, None, False
    return response.status_code, f'HTTP {response.status_code}', response.status_code >= 500 or response.status_code == 429


async def deliver_one(factory: Any, delivery_id: str | None = None) -> bool:
    """Lease and send one due delivery, or `delivery_id` when given; False when none was due.

    A `ping` (the Send test button) is tried once, is sent even while the webhook is off, and
    never changes the failure count, so a test cannot turn a webhook off or back on.
    VI: Lease và gửi một delivery đến hạn, hoặc đúng `delivery_id` nếu có; trả False khi không có
    VI: delivery nào đến hạn. `ping` (nút Gửi thử) chỉ thử một lần, vẫn gửi khi webhook đang tắt
    VI: và không đổi bộ đếm lỗi, nên một lần thử không thể làm tắt hay bật lại webhook.
    """
    token, now = cuid(), utcnow()
    async with factory() as db:
        row = (
            await db.execute(
                LEASE_OUTGOING_WEBHOOK_DELIVERY,
                {'lease': now + timedelta(minutes=2), 'token': token, 'now': now, 'target': delivery_id},
            )
        ).mappings().first()
        target = (
            (await db.execute(OUTGOING_WEBHOOK_TARGET, {'id': row['webhook_id']})).mappings().first()
            if row else None
        )
        await db.commit()
    if not row or not target:
        return False
    started = time.monotonic()
    status, error, retryable = await _post(target['url'], target['secret'], row['id'], row['event'], dict(row['payload']))
    duration = int((time.monotonic() - started) * 1000)
    ping = row['event'] == 'ping'
    succeeded = error is None
    now = utcnow()
    final_failure = not succeeded and (ping or not retryable or row['attempts'] >= MAX_ATTEMPTS)
    async with factory() as db:
        await db.execute(
            FINISH_OUTGOING_WEBHOOK_DELIVERY,
            {
                'id': row['id'],
                'token': token,
                'status': status,
                'duration': duration,
                'error': error,
                'delivered': now if succeeded else None,
                'failed': now if final_failure else None,
                'retry': now + timedelta(seconds=min(3600, 5 * 2 ** row['attempts'])),
            },
        )
        if not ping and succeeded:
            await db.execute(RESET_OUTGOING_WEBHOOK_FAILURES, {'id': row['webhook_id']})
        elif not ping:
            enabled = (
                await db.execute(
                    COUNT_OUTGOING_WEBHOOK_FAILURE,
                    {
                        'id': row['webhook_id'],
                        'limit': DISABLE_AFTER_FAILURES,
                        'now': now,
                        'reason': f'Turned off after {DISABLE_AFTER_FAILURES} failed attempts in a row; last error: {error}',
                    },
                )
            ).scalar_one_or_none()
            if enabled is False:
                await db.execute(DROP_PENDING_OUTGOING_WEBHOOK_DELIVERIES, {'id': row['webhook_id'], 'now': now})
        await db.commit()
    if not succeeded:
        logger.warning('Outgoing webhook delivery %s failed on attempt %s: %s', row['id'], row['attempts'], error)
    return True


async def prune_deliveries(factory: Any) -> None:
    async with factory() as db:
        await db.execute(PRUNE_OUTGOING_WEBHOOK_DELIVERIES, {'cutoff': utcnow() - RETENTION})
        await db.commit()


async def outgoing_webhook_loop(factory: Any, stop: asyncio.Event) -> None:
    # shortcut: deliveries go out one at a time, so a receiver that hangs for the full timeout
    # delays the others by up to 10 s each; send per webhook in parallel if volume grows.
    # VI: shortcut: gửi lần lượt từng delivery, nên bên nhận treo hết timeout sẽ làm các delivery
    # VI: khác trễ tới 10 giây mỗi lần; gửi song song theo webhook nếu lưu lượng tăng.
    last_prune = 0.0
    while not stop.is_set():
        try:
            if await progress(factory, 'outgoing-webhooks', deliver_one(factory)):
                continue
            if time.monotonic() - last_prune >= 3600:
                await prune_deliveries(factory)
                last_prune = time.monotonic()
        except Exception:
            logger.warning('Outgoing webhook worker is unavailable')
        try:
            await asyncio.wait_for(stop.wait(), timeout=5)
        except TimeoutError:
            pass
