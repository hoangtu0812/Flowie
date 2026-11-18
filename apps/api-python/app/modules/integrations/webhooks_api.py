"""Settings → Integrations → Webhooks: workspace administrators manage outgoing webhooks (DTD-904).

The secret is generated here and returned only by create and rotate; every other response
leaves it out, so it cannot be read back once the dialog that showed it is closed.
VI: Settings → Integrations → Webhooks: quản trị viên workspace quản lý webhook gửi ra ngoài
VI: (DTD-904). Secret được sinh tại đây và chỉ trả về khi tạo hoặc đổi; mọi phản hồi khác đều bỏ
VI: secret, nên không đọc lại được sau khi đóng hộp thoại đã hiển thị nó.
"""

from __future__ import annotations

import json
from secrets import token_urlsafe
from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..identity.auth import current_user
from .api import integration_manager
from .commands import (
    CREATE_OUTGOING_WEBHOOK,
    DELETE_OUTGOING_WEBHOOK,
    DROP_PENDING_OUTGOING_WEBHOOK_DELIVERIES,
    ROTATE_OUTGOING_WEBHOOK_SECRET,
    STAGE_OUTGOING_WEBHOOK_DELIVERY,
    UPDATE_OUTGOING_WEBHOOK,
)
from .outgoing_webhooks import WEBHOOK_EVENTS, checked_url, deliver_one, event_payload
from .queries import (
    LIST_OUTGOING_WEBHOOKS,
    OUTGOING_WEBHOOK,
    OUTGOING_WEBHOOK_DELIVERIES,
)

router = APIRouter(prefix='/api/v1/integrations/webhooks', tags=['integrations'])
MAX_WEBHOOKS = 20


class WebhookInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=1, max_length=2_000)
    events: list[str] = Field(min_length=1, max_length=len(WEBHOOK_EVENTS))
    enabled: bool = True


def _events(values: list[str]) -> list[str]:
    unknown = sorted(set(values) - set(WEBHOOK_EVENTS))
    if unknown:
        raise ApiError(400, f'Unknown webhook events: {", ".join(unknown)}.', 'Bad Request')
    return [event for event in WEBHOOK_EVENTS if event in values]


def _new_secret() -> str:
    return f'whsec_{token_urlsafe(32)}'


def _webhook(row: Any) -> dict[str, Any]:
    last = None
    if row['last_created_at']:
        last = {
            'event': row['last_event'],
            'status': row['last_status'],
            'deliveredAt': row['last_delivered_at'],
            'failedAt': row['last_failed_at'],
            'error': row['last_error'],
            'createdAt': row['last_created_at'],
        }
    return {
        'id': row['id'],
        'name': row['name'],
        'url': row['url'],
        'events': list(row['events']),
        'enabled': row['enabled'],
        'consecutiveFailures': row['consecutive_failures'],
        'disabledAt': row['disabled_at'],
        'disabledReason': row['disabled_reason'],
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
        'lastDelivery': last,
    }


async def _one(db: AsyncSession, workspace_id: str, webhook_id: str) -> dict[str, Any]:
    rows = (await db.execute(LIST_OUTGOING_WEBHOOKS, {'workspace_id': workspace_id})).mappings().all()
    for row in rows:
        if row['id'] == webhook_id:
            return _webhook(row)
    raise ApiError(404, 'Webhook not found.', 'Not Found')


@router.get('')
async def list_webhooks(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await integration_manager(db, workspaceId, user['id'])
    rows = (await db.execute(LIST_OUTGOING_WEBHOOKS, {'workspace_id': workspaceId})).mappings().all()
    return {'data': [_webhook(row) for row in rows], 'meta': {'events': list(WEBHOOK_EVENTS)}}


@router.post('', status_code=201)
async def create_webhook(
    payload: WebhookInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await integration_manager(db, workspaceId, user['id'])
    count = len((await db.execute(LIST_OUTGOING_WEBHOOKS, {'workspace_id': workspaceId})).all())
    if count >= MAX_WEBHOOKS:
        raise ApiError(409, f'A workspace can have at most {MAX_WEBHOOKS} webhooks.', 'Conflict')
    webhook_id, secret = cuid(), _new_secret()
    await db.execute(
        CREATE_OUTGOING_WEBHOOK,
        {
            'id': webhook_id,
            'workspace_id': workspaceId,
            'name': payload.name.strip(),
            'url': await checked_url(payload.url),
            'secret': secret,
            'events': _events(payload.events),
            'user_id': user['id'],
            'now': utcnow(),
        },
    )
    await db.commit()
    return {'data': {**await _one(db, workspaceId, webhook_id), 'secret': secret}}


@router.put('/{webhook_id}')
async def update_webhook(
    webhook_id: str,
    payload: WebhookInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await integration_manager(db, workspaceId, user['id'])
    current = (await db.execute(OUTGOING_WEBHOOK, {'id': webhook_id, 'workspace_id': workspaceId})).mappings().first()
    if not current:
        raise ApiError(404, 'Webhook not found.', 'Not Found')
    now = utcnow()
    await db.execute(
        UPDATE_OUTGOING_WEBHOOK,
        {
            'id': webhook_id,
            'workspace_id': workspaceId,
            'name': payload.name.strip(),
            # An unchanged URL is not re-resolved, so saving the name of an allowlisted or
            # temporarily unresolvable webhook still works; delivery checks it again anyway.
            # VI: URL không đổi thì không phân giải lại, để vẫn lưu được tên của webhook đã vào
            # VI: allowlist hoặc tạm thời không phân giải được; lúc gửi vẫn kiểm tra lại.
            'url': current['url'] if payload.url.strip() == current['url'] else await checked_url(payload.url),
            'events': _events(payload.events),
            'enabled': payload.enabled,
            'now': now,
        },
    )
    if current['enabled'] and not payload.enabled:
        await db.execute(DROP_PENDING_OUTGOING_WEBHOOK_DELIVERIES, {'id': webhook_id, 'now': now})
    await db.commit()
    return {'data': await _one(db, workspaceId, webhook_id)}


@router.post('/{webhook_id}/rotate-secret')
async def rotate_secret(
    webhook_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await integration_manager(db, workspaceId, user['id'])
    secret = _new_secret()
    rotated = (
        await db.execute(
            ROTATE_OUTGOING_WEBHOOK_SECRET,
            {'id': webhook_id, 'workspace_id': workspaceId, 'secret': secret, 'now': utcnow()},
        )
    ).scalar_one_or_none()
    if not rotated:
        raise ApiError(404, 'Webhook not found.', 'Not Found')
    await db.commit()
    return {'data': {'id': webhook_id, 'secret': secret}}


@router.delete('/{webhook_id}')
async def delete_webhook(
    webhook_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await integration_manager(db, workspaceId, user['id'])
    deleted = (await db.execute(DELETE_OUTGOING_WEBHOOK, {'id': webhook_id, 'workspace_id': workspaceId})).scalar_one_or_none()
    if not deleted:
        raise ApiError(404, 'Webhook not found.', 'Not Found')
    await db.commit()
    return {'data': {'id': webhook_id}}


@router.post('/{webhook_id}/test')
async def ping_webhook(
    webhook_id: str,
    request: Request,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Send a `ping` right away and return its delivery, so the dialog shows the result.

    VI: Gửi `ping` ngay và trả về delivery của nó, để hộp thoại hiển thị kết quả.
    """
    await integration_manager(db, workspaceId, user['id'])
    current = (await db.execute(OUTGOING_WEBHOOK, {'id': webhook_id, 'workspace_id': workspaceId})).mappings().first()
    if not current:
        raise ApiError(404, 'Webhook not found.', 'Not Found')
    delivery_id = cuid()
    payload = event_payload(workspaceId, 'ping', {'webhookId': webhook_id, 'name': current['name']})
    await db.execute(
        STAGE_OUTGOING_WEBHOOK_DELIVERY,
        {'id': delivery_id, 'webhook_id': webhook_id, 'event': 'ping', 'payload': json.dumps(payload), 'now': utcnow()},
    )
    await db.commit()
    await deliver_one(request.app.state.session_factory, delivery_id)
    deliveries = (await db.execute(OUTGOING_WEBHOOK_DELIVERIES, {'id': webhook_id})).mappings().all()
    delivery = next((dict(row) for row in deliveries if row['id'] == delivery_id), None)
    return {'data': _delivery(delivery) if delivery else None}


def _delivery(row: dict[str, Any]) -> dict[str, Any]:
    return {
        'id': row['id'],
        'event': row['event'],
        'attempts': row['attempts'],
        'status': row['response_status'],
        'durationMs': row['duration_ms'],
        'error': row['last_error'],
        'deliveredAt': row['delivered_at'],
        'failedAt': row['failed_at'],
        'nextAttemptAt': None if row['delivered_at'] or row['failed_at'] else row['available_at'],
        'createdAt': row['created_at'],
    }


@router.get('/{webhook_id}/deliveries')
async def list_deliveries(
    webhook_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await integration_manager(db, workspaceId, user['id'])
    if not (await db.execute(OUTGOING_WEBHOOK, {'id': webhook_id, 'workspace_id': workspaceId})).first():
        raise ApiError(404, 'Webhook not found.', 'Not Found')
    rows = (await db.execute(OUTGOING_WEBHOOK_DELIVERIES, {'id': webhook_id})).mappings().all()
    return {'data': [_delivery(dict(row)) for row in rows]}
