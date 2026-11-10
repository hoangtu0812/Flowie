from __future__ import annotations

from typing import Any

from fastapi import Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...services.microsoft_teams import valid_teams_webhook
from ..identity.auth import current_user
from ..identity.password_reset import limit_request
from ..integrations.api import send_teams_test
from .commands import (
    CREATE_CATEGORY_INSERT_NEWS_CATEGORIES,
    CREATE_SOURCE_INSERT_NEWS_SOURCES,
    DELETE_CATEGORY_DELETE_NEWS_CATEGORIES,
    DELETE_SOURCE_DELETE_NEWS_SOURCES,
    UPDATE_CATEGORY_UPDATE_NEWS_CATEGORIES,
    UPDATE_SOURCE_UPDATE_NEWS_SOURCES,
)
from .feeds import feed_url
from .queries import (
    TEST_CATEGORY_WEBHOOK_SELECT_NEWS_CATEGORIES,
)
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
            CREATE_CATEGORY_INSERT_NEWS_CATEGORIES,
            {
                'id': cuid(), 'workspace_id': workspaceId, 'name': _name(payload.name),
                'webhook_url': _webhook(payload.webhookUrl), 'now': utcnow(),
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
            UPDATE_CATEGORY_UPDATE_NEWS_CATEGORIES,
            {'webhook_url': _webhook(payload.webhookUrl), 'now': utcnow(), 'id': category_id, 'workspace_id': workspaceId},
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
            DELETE_CATEGORY_DELETE_NEWS_CATEGORIES,
            {'id': category_id, 'workspace_id': workspaceId},
        )
    ).first()
    result = _found(row, 'News group')
    await db.commit()
    return {'data': result}


@router.post('/categories/{category_id}/test')
async def test_category_webhook(
    category_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    # Posts the Integrations test card to the group's stored webhook only; the client cannot pass
    # a URL, so the endpoint can never be pointed at another host (SSRF).
    # VI: Gửi thẻ thử của trang Integrations tới webhook đã lưu của nhóm; client không truyền được
    # VI: URL nên endpoint không thể bị trỏ tới host khác (SSRF).
    await require_manager(db, workspaceId, user['id'])
    row = (
        await db.execute(
            TEST_CATEGORY_WEBHOOK_SELECT_NEWS_CATEGORIES,
            {'id': category_id, 'workspace_id': workspaceId},
        )
    ).first()
    _found(row, 'News group')
    # _found has already raised for a missing row; this tells the type checker.
    # VI: _found đã báo lỗi nếu thiếu dòng; dòng này chỉ để báo cho bộ kiểm kiểu.
    assert row is not None
    if not row[0]:
        raise ApiError(400, 'This news group has no Microsoft Teams webhook.', 'Bad Request')
    return {'data': await send_teams_test(row[0])}


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
            CREATE_SOURCE_INSERT_NEWS_SOURCES,
            {
                'id': cuid(), 'name': _name(payload.name), 'feed_url': feed_url(payload.feedUrl),
                'now': utcnow(), 'category_id': payload.categoryId, 'workspace_id': workspaceId,
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
            UPDATE_SOURCE_UPDATE_NEWS_SOURCES,
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
            DELETE_SOURCE_DELETE_NEWS_SOURCES,
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
    return {'data': await refresh_workspace(db, workspaceId, settings=request.app.state.settings)}
