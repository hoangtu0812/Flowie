from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import Depends, Query, Request
from ..core.utc_responses import UtcAPIRouter as APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from ..modules.access.project_scope import project_read_scope
from ..services.microsoft_teams import masked_webhook, teams_available, teams_message, valid_teams_webhook
from .auth import _cuid, _utcnow, current_user


router = APIRouter(prefix='/api/v1/integrations', tags=['integrations'])


class DiscordWebhookInput(BaseModel):
    webhookUrl: str | None = Field(default=None, max_length=2_000)
    enabled: bool = True
    dailyDigestEnabled: bool = False


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
        'dailyDigestEnabled': row['daily_digest_enabled'],
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
        text('SELECT enabled, daily_digest_enabled, webhook_url, updated_at FROM discord_webhooks WHERE workspace_id = :workspace_id'),
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
                   daily_digest_enabled = :daily_digest_enabled,
                   updated_at = :now WHERE id = :id
                   RETURNING enabled, daily_digest_enabled, webhook_url, updated_at'''
            ),
            {'id': row['id'], 'webhook_url': webhook_url, 'enabled': payload.enabled, 'daily_digest_enabled': payload.dailyDigestEnabled, 'now': now},
        )
    else:
        result = await db.execute(
            text(
                '''INSERT INTO discord_webhooks (id, workspace_id, webhook_url, enabled, daily_digest_enabled, created_at, updated_at)
                   VALUES (:id, :workspace_id, :webhook_url, :enabled, :daily_digest_enabled, :now, :now)
                   RETURNING enabled, daily_digest_enabled, webhook_url, updated_at'''
            ),
            {
                'id': _cuid(), 'workspace_id': workspaceId, 'webhook_url': webhook_url,
                'enabled': payload.enabled, 'daily_digest_enabled': payload.dailyDigestEnabled, 'now': now,
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


class TeamsWebhookInput(BaseModel):
    webhookUrl: str | None = Field(default=None, max_length=2_000)
    enabled: bool = True


class ProjectTeamsChannelInput(TeamsWebhookInput):
    channelName: str | None = Field(default=None, max_length=120)


def _teams_gate(request: Request) -> None:
    if not teams_available(request.app.state.settings):
        raise ApiError(403, 'Microsoft Teams requires Microsoft Entra sign-in to be configured.', 'Forbidden')


def _teams_url(value: str) -> str:
    webhook = valid_teams_webhook(value)
    if not webhook:
        raise ApiError(400, 'A valid HTTPS Microsoft Teams Workflows webhook URL is required.', 'Bad Request')
    return webhook


def _teams_status(row: Any) -> dict[str, Any]:
    status = {
        'enabled': row['enabled'],
        'webhookUrlMasked': masked_webhook(row['webhook_url']),
        'updatedAt': row['updated_at'],
    }
    if 'channel_name' in row:
        status['channelName'] = row['channel_name']
    return status


async def _send_teams_test(webhook_url: str) -> dict[str, Any]:
    message = teams_message({'title': 'Flowie', 'description': '✅ Flowie đã kết nối Microsoft Teams thành công.'})
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(webhook_url, json=message)
        if response.is_success:
            return {'delivered': True}
        return {'delivered': False, 'reason': f'Microsoft Teams answered {response.status_code}: {response.text[:200]}'}
    except httpx.HTTPError as error:
        return {'delivered': False, 'reason': f'Microsoft Teams is unreachable: {error}'}


@router.get('/teams')
async def teams_status(
    request: Request,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any] | None]:
    _teams_gate(request)
    await _manager_access(db, workspaceId, user['id'])
    result = await db.execute(
        text('SELECT enabled, webhook_url, updated_at FROM teams_webhooks WHERE workspace_id = :workspace_id'),
        {'workspace_id': workspaceId},
    )
    row = result.mappings().first()
    return {'data': _teams_status(row) if row else None}


@router.post('/teams')
async def save_teams(
    request: Request,
    payload: TeamsWebhookInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    _teams_gate(request)
    await _manager_access(db, workspaceId, user['id'])
    existing = await db.execute(
        text('SELECT webhook_url FROM teams_webhooks WHERE workspace_id = :workspace_id'),
        {'workspace_id': workspaceId},
    )
    current = existing.scalar_one_or_none()
    if not current and not payload.webhookUrl:
        raise ApiError(400, 'A Microsoft Teams webhook URL is required.', 'Bad Request')
    now = _utcnow()
    result = await db.execute(
        text(
            '''INSERT INTO teams_webhooks (id, workspace_id, webhook_url, enabled, created_at, updated_at)
               VALUES (:id, :workspace_id, :webhook_url, :enabled, :now, :now)
               ON CONFLICT (workspace_id) DO UPDATE SET webhook_url = EXCLUDED.webhook_url,
                   enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
               RETURNING enabled, webhook_url, updated_at'''
        ),
        {
            'id': _cuid(), 'workspace_id': workspaceId,
            'webhook_url': _teams_url(payload.webhookUrl) if payload.webhookUrl else current,
            'enabled': payload.enabled, 'now': now,
        },
    )
    await db.commit()
    return {'data': _teams_status(result.mappings().one())}


@router.post('/teams/test')
async def test_teams(
    request: Request,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    _teams_gate(request)
    await _manager_access(db, workspaceId, user['id'])
    result = await db.execute(
        text('SELECT webhook_url, enabled FROM teams_webhooks WHERE workspace_id = :workspace_id'),
        {'workspace_id': workspaceId},
    )
    webhook = result.mappings().first()
    if not webhook:
        return {'data': {'delivered': False, 'reason': 'No Microsoft Teams webhook is configured.'}}
    if not webhook['enabled']:
        return {'data': {'delivered': False, 'reason': 'Microsoft Teams notifications are turned off.'}}
    return {'data': await _send_teams_test(webhook['webhook_url'])}


async def _project_teams_access(db: AsyncSession, workspace_id: str, project_id: str, user_id: str) -> bool:
    """Return whether the reader may change the channel; readers may only view it."""

    result = await db.execute(
        text(
            f'''SELECT p.lead_id = :user OR EXISTS(
                     SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = :workspace
                       AND wm.user_id = :user AND wm.status = 'ACTIVE' AND wm.role IN ('OWNER', 'ADMIN'))
               FROM projects p WHERE p.id = :project_id AND {project_read_scope()}'''
        ),
        {'project_id': project_id, 'workspace': workspace_id, 'user': user_id},
    )
    row = result.first()
    if row is None:
        raise ApiError(404, 'Project not found.', 'Not Found')
    return bool(row[0])


async def _project_manager(db: AsyncSession, workspace_id: str, project_id: str, user_id: str) -> None:
    if not await _project_teams_access(db, workspace_id, project_id, user_id):
        raise ApiError(403, 'Only the project lead or a workspace administrator can change the Teams channel.', 'Forbidden')


@router.get('/teams/projects/{projectId}')
async def project_teams_status(
    request: Request,
    projectId: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    _teams_gate(request)
    can_manage = await _project_teams_access(db, workspaceId, projectId, user['id'])
    result = await db.execute(
        text('SELECT channel_name, enabled, webhook_url, updated_at FROM project_teams_channels WHERE project_id = :project_id'),
        {'project_id': projectId},
    )
    row = result.mappings().first()
    return {'data': _teams_status(row) if row else None, 'canManage': can_manage}


@router.put('/teams/projects/{projectId}')
async def save_project_teams(
    request: Request,
    projectId: str,
    payload: ProjectTeamsChannelInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    _teams_gate(request)
    await _project_manager(db, workspaceId, projectId, user['id'])
    existing = await db.execute(
        text('SELECT webhook_url FROM project_teams_channels WHERE project_id = :project_id'),
        {'project_id': projectId},
    )
    current = existing.scalar_one_or_none()
    if not current and not payload.webhookUrl:
        raise ApiError(400, 'A Microsoft Teams webhook URL is required.', 'Bad Request')
    now = _utcnow()
    result = await db.execute(
        text(
            '''INSERT INTO project_teams_channels (id, project_id, channel_name, webhook_url, enabled, created_at, updated_at)
               VALUES (:id, :project_id, :channel_name, :webhook_url, :enabled, :now, :now)
               ON CONFLICT (project_id) DO UPDATE SET channel_name = EXCLUDED.channel_name,
                   webhook_url = EXCLUDED.webhook_url, enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
               RETURNING channel_name, enabled, webhook_url, updated_at'''
        ),
        {
            'id': _cuid(), 'project_id': projectId,
            'channel_name': (payload.channelName or '').strip() or None,
            'webhook_url': _teams_url(payload.webhookUrl) if payload.webhookUrl else current,
            'enabled': payload.enabled, 'now': now,
        },
    )
    await db.commit()
    return {'data': _teams_status(result.mappings().one())}


@router.delete('/teams/projects/{projectId}')
async def delete_project_teams(
    request: Request,
    projectId: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, None]:
    _teams_gate(request)
    await _project_manager(db, workspaceId, projectId, user['id'])
    await db.execute(text('DELETE FROM project_teams_channels WHERE project_id = :project_id'), {'project_id': projectId})
    await db.commit()
    return {'data': None}


@router.post('/teams/projects/{projectId}/test')
async def test_project_teams(
    request: Request,
    projectId: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    _teams_gate(request)
    await _project_manager(db, workspaceId, projectId, user['id'])
    result = await db.execute(
        text('SELECT webhook_url, enabled FROM project_teams_channels WHERE project_id = :project_id'),
        {'project_id': projectId},
    )
    channel = result.mappings().first()
    if not channel:
        return {'data': {'delivered': False, 'reason': 'No Microsoft Teams channel is connected to this project.'}}
    if not channel['enabled']:
        return {'data': {'delivered': False, 'reason': 'Microsoft Teams notifications are turned off for this project.'}}
    return {'data': await _send_teams_test(channel['webhook_url'])}
