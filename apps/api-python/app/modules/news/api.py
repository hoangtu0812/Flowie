from __future__ import annotations

from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from ...services.microsoft_teams import valid_teams_webhook
from ..identity.password_reset import limit_request
from .feeds import feed_url
from .service import news_page, refresh_workspace, require_manager

router = UtcAPIRouter(prefix='/api/v1/news', tags=['news'])


class CategoryInput(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    webhookUrl: str | None = Field(default=None, max_length=2000)


class CategoryUpdate(BaseModel):
    webhookUrl: str = Field(max_length=2000)


class SourceInput(BaseModel):
    categoryId: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    feedUrl: str = Field(min_length=1, max_length=2000)


class SourceUpdate(BaseModel):
    enabled: bool


def _webhook(value: str | None) -> str | None:
    # An empty value clears the webhook; anything else must be a Teams Workflows URL (SSRF guard).
    # VI: Giá trị rỗng xoá webhook; còn lại phải là URL Teams Workflows (chống SSRF).
    if not (value or '').strip():
        return None
    webhook = valid_teams_webhook(value or '')
    if not webhook:
        raise ApiError(400, 'A valid HTTPS Microsoft Teams Workflows webhook URL is required.', 'Bad Request')
    return webhook


def _name(value: str) -> str:
    name = ' '.join(value.split())
    if not name:
        raise ApiError(400, 'A name is required.', 'Bad Request')
    return name


def _found(row: Any, what: str) -> dict[str, Any]:
    if row is None:
        raise ApiError(404, f'{what} was not found.', 'Not Found')
    return {'id': row[0]}


@router.get('')
async def list_news(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    return {'data': await news_page(db, workspaceId, user['id'])}


@router.post('/categories')
async def create_category(
    payload: CategoryInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await require_manager(db, workspaceId, user['id'])
    row = (
        await db.execute(
            text(
                '''INSERT INTO news_categories (id, workspace_id, name, webhook_url, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :webhook_url, :now, :now)
                   ON CONFLICT (workspace_id, name) DO NOTHING RETURNING id'''
            ),
            {
                'id': _cuid(), 'workspace_id': workspaceId, 'name': _name(payload.name),
                'webhook_url': _webhook(payload.webhookUrl), 'now': _utcnow(),
            },
        )
    ).first()
    if row is None:
        raise ApiError(409, 'A news group with this name already exists.', 'Conflict')
    await db.commit()
    return {'data': {'id': row[0]}}


@router.patch('/categories/{category_id}')
async def update_category(
    category_id: str,
    payload: CategoryUpdate,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await require_manager(db, workspaceId, user['id'])
    row = (
        await db.execute(
            text(
                '''UPDATE news_categories SET webhook_url = :webhook_url, updated_at = :now
                   WHERE id = :id AND workspace_id = :workspace_id RETURNING id'''
            ),
            {'webhook_url': _webhook(payload.webhookUrl), 'now': _utcnow(), 'id': category_id, 'workspace_id': workspaceId},
        )
    ).first()
    result = _found(row, 'News group')
    await db.commit()
    return {'data': result}


@router.delete('/categories/{category_id}')
async def delete_category(
    category_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await require_manager(db, workspaceId, user['id'])
    row = (
        await db.execute(
            text('DELETE FROM news_categories WHERE id = :id AND workspace_id = :workspace_id RETURNING id'),
            {'id': category_id, 'workspace_id': workspaceId},
        )
    ).first()
    result = _found(row, 'News group')
    await db.commit()
    return {'data': result}


@router.post('/sources')
async def create_source(
    payload: SourceInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await require_manager(db, workspaceId, user['id'])
    row = (
        await db.execute(
            text(
                '''INSERT INTO news_sources (id, workspace_id, category_id, name, feed_url, enabled, created_at)
                   SELECT :id, workspace_id, id, :name, :feed_url, TRUE, :now FROM news_categories
                   WHERE id = :category_id AND workspace_id = :workspace_id RETURNING id'''
            ),
            {
                'id': _cuid(), 'name': _name(payload.name), 'feed_url': feed_url(payload.feedUrl),
                'now': _utcnow(), 'category_id': payload.categoryId, 'workspace_id': workspaceId,
            },
        )
    ).first()
    result = _found(row, 'News group')
    await db.commit()
    return {'data': result}


@router.patch('/sources/{source_id}')
async def update_source(
    source_id: str,
    payload: SourceUpdate,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await require_manager(db, workspaceId, user['id'])
    row = (
        await db.execute(
            text('UPDATE news_sources SET enabled = :enabled WHERE id = :id AND workspace_id = :workspace_id RETURNING id'),
            {'enabled': payload.enabled, 'id': source_id, 'workspace_id': workspaceId},
        )
    ).first()
    result = _found(row, 'News source')
    await db.commit()
    return {'data': result}


@router.delete('/sources/{source_id}')
async def delete_source(
    source_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    await require_manager(db, workspaceId, user['id'])
    row = (
        await db.execute(
            text('DELETE FROM news_sources WHERE id = :id AND workspace_id = :workspace_id RETURNING id'),
            {'id': source_id, 'workspace_id': workspaceId},
        )
    ).first()
    result = _found(row, 'News source')
    await db.commit()
    return {'data': result}


@router.post('/refresh')
async def refresh(
    request: Request,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    # Fetching calls external sites, so a manager may trigger it at most 10 times an hour.
    # VI: Lấy tin gọi ra trang ngoài, nên mỗi quản trị viên chỉ được chạy tối đa 10 lần mỗi giờ.
    await require_manager(db, workspaceId, user['id'])
    await limit_request(db, request.app.state.settings.auth_jwt_secret, 'news-refresh', user['id'], 10)
    return {'data': await refresh_workspace(db, workspaceId)}
