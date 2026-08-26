from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user


router = APIRouter(prefix='/api/v1/integrations', tags=['integrations'])


class DiscordWebhookInput(BaseModel):
    webhookUrl: str | None = Field(default=None, max_length=2_000)
    enabled: bool = True


async def _manager_access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        text(
            '''SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id
                 AND status = 'ACTIVE' AND role IN ('OWNER', 'ADMIN')'''
        ),
        {'workspace_id': workspace_id, 'user_id': user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, 'Workspace administrator access is required.', 'Forbidden')


def _validate_webhook(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme != 'https' or parsed.netloc not in {'discord.com', 'discordapp.com'} or not parsed.path.startswith('/api/webhooks/'):
        raise ApiError(400, 'A valid HTTPS Discord webhook URL is required.', 'Bad Request')
    return value.strip()


def _masked_webhook(value: str) -> str:
    return f'{value[:32]}••••{value[-6:]}'


def _status(row: Any) -> dict[str, Any]:
    return {
        'enabled': row['enabled'],
        'webhookUrlMasked': _masked_webhook(row['webhook_url']),
        'updatedAt': row['updated_at'],
    }


@router.get('/discord')
async def discord_status(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any] | None]:
    await _manager_access(db, workspaceId, user['id'])
    result = await db.execute(
        text('SELECT enabled, webhook_url, updated_at FROM discord_webhooks WHERE workspace_id = :workspace_id'),
        {'workspace_id': workspaceId},
    )
    row = result.mappings().first()
    return {'data': _status(row) if row else None}


@router.post('/discord')
async def save_discord(
    payload: DiscordWebhookInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager_access(db, workspaceId, user['id'])
    existing = await db.execute(
        text('SELECT id, webhook_url FROM discord_webhooks WHERE workspace_id = :workspace_id'),
        {'workspace_id': workspaceId},
    )
    row = existing.mappings().first()
    if not row and not payload.webhookUrl:
        raise ApiError(400, 'A Discord webhook URL is required.', 'Bad Request')
    webhook_url = _validate_webhook(payload.webhookUrl) if payload.webhookUrl else row['webhook_url']
    now = _utcnow()
    if row:
        result = await db.execute(
            text(
                '''UPDATE discord_webhooks SET webhook_url = :webhook_url, enabled = :enabled,
                   updated_at = :now WHERE id = :id
                   RETURNING enabled, webhook_url, updated_at'''
            ),
            {'id': row['id'], 'webhook_url': webhook_url, 'enabled': payload.enabled, 'now': now},
        )
    else:
        result = await db.execute(
            text(
                '''INSERT INTO discord_webhooks (id, workspace_id, webhook_url, enabled, created_at, updated_at)
                   VALUES (:id, :workspace_id, :webhook_url, :enabled, :now, :now)
                   RETURNING enabled, webhook_url, updated_at'''
            ),
            {
                'id': _cuid(), 'workspace_id': workspaceId, 'webhook_url': webhook_url,
                'enabled': payload.enabled, 'now': now,
            },
        )
    await db.commit()
    return {'data': _status(result.mappings().one())}


@router.post('/discord/test')
async def test_discord(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager_access(db, workspaceId, user['id'])
    result = await db.execute(
        text('SELECT webhook_url, enabled FROM discord_webhooks WHERE workspace_id = :workspace_id'),
        {'workspace_id': workspaceId},
    )
    webhook = result.mappings().first()
    if not webhook:
        return {'data': {'delivered': False, 'reason': 'No Discord webhook is configured.'}}
    if not webhook['enabled']:
        return {'data': {'delivered': False, 'reason': 'Discord notifications are turned off.'}}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(webhook['webhook_url'], json={'content': '✅ Flowie đã kết nối Discord thành công.'})
        if response.is_success:
            return {'data': {'delivered': True}}
        # Discord answers 4xx instead of raising, so report what it said
        # rather than a bare failure the caller cannot act on.
        return {
            'data': {
                'delivered': False,
                'reason': f'Discord answered {response.status_code}: {response.text[:200]}',
            }
        }
    except httpx.HTTPError as error:
        return {'data': {'delivered': False, 'reason': f'Discord is unreachable: {error}'}}
