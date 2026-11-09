from __future__ import annotations

import logging
from datetime import timedelta
from os import getenv
from typing import Any, cast

import httpx
from sqlalchemy import text
from sqlalchemy import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ..access.read_only import ADMIN_READ_ROLES
from ...services.microsoft_teams import masked_webhook
from .ai import analyze_workspace
from .feeds import fetch_feed, news_card, parse_feed

logger = logging.getLogger(__name__)

# How long a card may wait for AI labels: long enough to ride out a provider outage, short enough
# that the morning security news still arrives the same morning.
# VI: Thời gian card được chờ nhãn AI: đủ lâu để qua một sự cố provider, đủ ngắn để tin bảo mật buổi
# VI: sáng vẫn đến trong buổi sáng đó.
NEWS_AI_GRACE = timedelta(hours=2)


async def member_role(db: AsyncSession, workspace_id: str, user_id: str) -> str:
    role = (
        await db.execute(
            text(
                '''SELECT role FROM workspace_members
                   WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE' '''
            ),
            {'workspace_id': workspace_id, 'user_id': user_id},
        )
    ).scalar_one_or_none()
    if role is None:
        raise ApiError(403, 'Workspace access is required.', 'Forbidden')
    return role


async def require_manager(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    if await member_role(db, workspace_id, user_id) not in ADMIN_READ_ROLES:
        raise ApiError(403, 'Workspace administrator access is required.', 'Forbidden')


async def news_page(db: AsyncSession, workspace_id: str, user_id: str) -> dict[str, Any]:
    """News for any active member: categories, the 100 newest items per category and, for
    owners/admins only, the sources and masked webhooks they manage.
    VI: Tin cho mọi thành viên đang hoạt động: nhóm tin, 100 tin mới nhất mỗi nhóm và, chỉ với
    VI: owner/admin, các nguồn và webhook (đã che) mà họ quản lý.
    """
    manage = await member_role(db, workspace_id, user_id) in ('OWNER', 'ADMIN')
    params = {'workspace_id': workspace_id}
    categories = (
        await db.execute(
            text(
                'SELECT id, name, webhook_url, digest, digest_at FROM news_categories '
                'WHERE workspace_id = :workspace_id ORDER BY name'
            ),
            params,
        )
    ).mappings().all()
    items = (
        await db.execute(
            text(
                '''SELECT * FROM (
                     SELECT i.id, i.title, i.url, i.summary, i.published_at, s.name AS source_name, s.category_id,
                            i.risk_level, i.risk_score, i.ai_summary,
                            row_number() OVER (PARTITION BY s.category_id ORDER BY i.published_at DESC) AS position
                     FROM news_items i JOIN news_sources s ON s.id = i.source_id
                     WHERE i.workspace_id = :workspace_id) ranked
                   WHERE position <= 100 ORDER BY published_at DESC'''
            ),
            params,
        )
    ).mappings().all()
    page: dict[str, Any] = {
        'canManage': manage,
        'categories': [
            {
                'id': row['id'],
                'name': row['name'],
                'digest': row['digest'],
                'digestAt': row['digest_at'],
                **(
                    {'webhookUrlMasked': masked_webhook(row['webhook_url']) if row['webhook_url'] else None}
                    if manage
                    else {}
                ),
            }
            for row in categories
        ],
        'items': [
            {
                'id': row['id'],
                'title': row['title'],
                'url': row['url'],
                'summary': row['summary'],
                'publishedAt': row['published_at'],
                'sourceName': row['source_name'],
                'categoryId': row['category_id'],
                'riskLevel': row['risk_level'],
                'riskScore': row['risk_score'],
                'aiSummary': row['ai_summary'],
            }
            for row in items
        ],
    }
    if manage:
        sources = (
            await db.execute(
                text(
                    '''SELECT id, category_id, name, feed_url, enabled, last_fetched_at, last_error
                       FROM news_sources WHERE workspace_id = :workspace_id ORDER BY name'''
                ),
                params,
            )
        ).mappings().all()
        page['sources'] = [
            {
                'id': row['id'],
                'categoryId': row['category_id'],
                'name': row['name'],
                'feedUrl': row['feed_url'],
                'enabled': row['enabled'],
                'lastFetchedAt': row['last_fetched_at'],
                'lastError': row['last_error'],
            }
            for row in sources
        ]
    return page


async def due_workspaces(db: AsyncSession, cutoff: Any) -> list[str]:
    rows = await db.execute(
        text(
            '''SELECT DISTINCT workspace_id FROM news_sources
               WHERE enabled AND (last_fetched_at IS NULL OR last_fetched_at < :cutoff)'''
        ),
        {'cutoff': cutoff},
    )
    return [row[0] for row in rows.all()]


async def refresh_workspace(
    db: AsyncSession, workspace_id: str, due_before: Any = None, settings: Any = None
) -> dict[str, int]:
    """Fetch the workspace's enabled sources (only those not fetched since ``due_before`` when it
    is given), store new items once per link, then post them to Teams. Each source is committed on
    its own and the transaction is closed before every download, so a slow feed holds no lock and
    one broken feed only records ``last_error`` on its source. With ``settings`` the new items are
    labelled by the workspace's AI provider before the Teams post; a card waiting for labels is held
    for at most ``NEWS_AI_GRACE``, so AI failures only delay it.
    VI: Lấy các nguồn đang bật của workspace (chỉ nguồn chưa lấy từ ``due_before`` nếu có), lưu
    VI: tin mới một lần theo link, rồi gửi Teams. Mỗi nguồn được commit riêng và transaction được
    VI: đóng trước mỗi lần tải, nên feed chậm không giữ khoá và feed lỗi chỉ ghi ``last_error``.
    VI: Có ``settings`` thì tin mới được provider AI của workspace gán nhãn trước khi gửi Teams; thẻ
    VI: chờ nhãn được giữ tối đa ``NEWS_AI_GRACE``, nên lỗi AI chỉ làm thẻ đến muộn.
    """
    query = 'SELECT id, feed_url FROM news_sources WHERE workspace_id = :workspace_id AND enabled'
    params: dict[str, Any] = {'workspace_id': workspace_id}
    if due_before is not None:
        query += ' AND (last_fetched_at IS NULL OR last_fetched_at < :cutoff)'
        params['cutoff'] = due_before
    sources = (await db.execute(text(query), params)).mappings().all()
    await db.commit()
    inserted = 0
    async with httpx.AsyncClient(
        timeout=10, follow_redirects=False, headers={'User-Agent': 'FlowieNews/1.0'}
    ) as client:
        for source in sources:
            now, error, entries = _utcnow(), None, []
            try:
                entries = parse_feed(await fetch_feed(source['feed_url'], client), now)
            except Exception as failure:  # Any feed failure is recorded on the source, never raised.
                error = (getattr(failure, 'message', None) or str(failure) or type(failure).__name__)[:500]
            for entry in entries:
                result = await db.execute(
                    text(
                        '''INSERT INTO news_items (id, workspace_id, source_id, title, url, summary, published_at, created_at)
                           VALUES (:id, :workspace_id, :source_id, :title, :url, :summary, :published_at, :now)
                           ON CONFLICT (workspace_id, url) DO NOTHING'''
                    ),
                    {
                        'id': _cuid(), 'workspace_id': workspace_id, 'source_id': source['id'],
                        'title': entry['title'], 'url': entry['url'], 'summary': entry['summary'],
                        'published_at': entry['publishedAt'], 'now': now,
                    },
                )
                inserted += cast(CursorResult[Any], result).rowcount or 0
            await db.execute(
                text('UPDATE news_sources SET last_fetched_at = :now, last_error = :error WHERE id = :id'),
                {'now': now, 'error': error, 'id': source['id']},
            )
            await db.commit()
        analyzed = await analyze_workspace(db, workspace_id, settings) if settings is not None else 0
        notified = await notify_workspace(db, workspace_id, client, hold=settings is not None)
    return {'fetched': len(sources), 'inserted': inserted, 'analyzed': analyzed, 'notified': notified}


async def held_workspaces(db: AsyncSession) -> list[str]:
    """Workspaces with an active provider and unsent items still waiting for AI labels.
    VI: Các workspace có provider đang bật và tin chưa gửi còn chờ nhãn AI.
    """
    rows = await db.execute(
        text(
            '''SELECT DISTINCT i.workspace_id FROM news_items i
               JOIN workspace_agent_providers p ON p.workspace_id = i.workspace_id AND p.enabled
               WHERE i.notified_at IS NULL AND i.analyzed_at IS NULL'''
        )
    )
    return [row[0] for row in rows.all()]


async def retry_held_workspace(db: AsyncSession, workspace_id: str, settings: Any) -> None:
    """Label held items and post what is ready, without downloading the feeds again.
    VI: Gán nhãn tin đang giữ và gửi phần đã sẵn sàng, không tải lại feed.
    """
    await analyze_workspace(db, workspace_id, settings)
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
        await notify_workspace(db, workspace_id, client, hold=True)


async def notify_workspace(
    db: AsyncSession, workspace_id: str, client: httpx.AsyncClient, hold: bool = False
) -> int:
    """Post one card per category with unsent items. Items of a category without a webhook are
    marked as handled so a webhook added later does not replay the backlog; a failed post keeps
    them pending for the next fetch. Returns the number of cards delivered.

    With ``hold`` and an active provider, a category with items unlabelled for less than
    ``NEWS_AI_GRACE`` is skipped so its card can carry the labels. After that the card goes out as
    it is, because a security item must not be lost to an AI outage.
    VI: Gửi một card cho mỗi nhóm có tin chưa gửi. Tin của nhóm không có webhook được đánh dấu đã
    VI: xử lý để webhook thêm sau không gửi lại tồn đọng; gửi lỗi thì giữ lại cho lần lấy sau.
    VI: Trả về số card đã gửi thành công. Với ``hold`` và provider đang bật, nhóm có tin chưa nhãn
    VI: dưới ``NEWS_AI_GRACE`` bị bỏ qua để card có nhãn. Sau đó card vẫn được gửi, vì sự cố AI không
    VI: được làm mất tin bảo mật.
    """
    await_labels = hold and bool(
        (
            await db.execute(
                text('SELECT 1 FROM workspace_agent_providers WHERE workspace_id = :workspace_id AND enabled LIMIT 1'),
                {'workspace_id': workspace_id},
            )
        ).first()
    )
    rows = (
        await db.execute(
            text(
                '''SELECT c.id AS category_id, c.name, c.webhook_url, c.digest, c.digest_at,
                          i.id, i.title, i.url, i.risk_level, i.ai_summary, i.analyzed_at, i.created_at
                   FROM news_items i JOIN news_sources s ON s.id = i.source_id
                   JOIN news_categories c ON c.id = s.category_id
                   WHERE i.workspace_id = :workspace_id AND i.notified_at IS NULL
                   ORDER BY i.risk_score DESC NULLS LAST, i.published_at DESC'''
            ),
            {'workspace_id': workspace_id},
        )
    ).mappings().all()
    await db.commit()
    groups: dict[str, list[Any]] = {}
    for row in rows:
        groups.setdefault(row['category_id'], []).append(row)
    base = (getenv('APP_URL') or getenv('NEXT_PUBLIC_APP_URL') or '').rstrip('/')
    recent = _utcnow() - timedelta(hours=24)
    delivered = 0
    hold_after = _utcnow() - NEWS_AI_GRACE
    for items in groups.values():
        if await_labels and any(i['analyzed_at'] is None and i['created_at'] >= hold_after for i in items):
            continue
        handled = True
        if items[0]['webhook_url']:
            try:
                response = await client.post(
                    items[0]['webhook_url'],
                    json=news_card(
                        items[0]['name'],
                        [dict(item) for item in items],
                        f'{base}/{workspace_id}/news' if base else None,
                        items[0]['digest'] if items[0]['digest_at'] and items[0]['digest_at'] >= recent else None,
                    ),
                )
                handled = response.is_success
                if not handled:
                    logger.warning('News card rejected by Teams for %s: %s', workspace_id, response.status_code)
            except httpx.HTTPError as error:
                handled = False
                logger.warning('News card unreachable for %s: %s', workspace_id, error)
            delivered += int(handled)
        if handled:
            await db.execute(
                text('UPDATE news_items SET notified_at = :now WHERE id = ANY(:ids)'),
                {'now': _utcnow(), 'ids': [item['id'] for item in items]},
            )
            await db.commit()
    return delivered
