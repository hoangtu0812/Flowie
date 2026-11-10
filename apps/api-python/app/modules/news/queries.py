"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

ANALYZE_WORKSPACE_SELECT_NEWS_CATEGORIES = text(
    '''SELECT DISTINCT c.id, c.name FROM news_categories c
                   JOIN news_sources s ON s.category_id = c.id
                   JOIN news_items i ON i.source_id = s.id
                   WHERE c.workspace_id = :workspace_id AND i.analyzed_at IS NULL'''
)


ANALYZE_WORKSPACE_SELECT_NEWS_ITEMS = text(
    '''SELECT i.id, i.title, i.summary, i.published_at, i.analyzed_at, s.name AS source_name
                           FROM news_items i JOIN news_sources s ON s.id = i.source_id
                           WHERE s.category_id = :category_id
                             AND (i.analyzed_at IS NULL OR i.published_at >= :since)
                           ORDER BY (i.analyzed_at IS NULL) DESC, i.published_at DESC LIMIT :limit'''
)


TEST_CATEGORY_WEBHOOK_SELECT_NEWS_CATEGORIES = text('SELECT webhook_url FROM news_categories WHERE id = :id AND workspace_id = :workspace_id')


DUE_WORKSPACES_SELECT_NEWS_SOURCES = text(
    '''SELECT DISTINCT workspace_id FROM news_sources
               WHERE enabled AND (last_fetched_at IS NULL OR last_fetched_at < :cutoff)'''
)


HELD_WORKSPACES_SELECT_NEWS_ITEMS = text(
    '''SELECT DISTINCT i.workspace_id FROM news_items i
               JOIN workspace_agent_providers p ON p.workspace_id = i.workspace_id AND p.enabled
               WHERE i.notified_at IS NULL AND i.analyzed_at IS NULL'''
)


MEMBER_ROLE_SELECT_WORKSPACE_MEMBERS = text(
    '''SELECT role FROM workspace_members
                   WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE' '''
)


NEWS_PAGE_SELECT_NEWS_CATEGORIES = text(
    'SELECT id, name, webhook_url, digest, digest_at FROM news_categories '
    'WHERE workspace_id = :workspace_id ORDER BY name'
)


NEWS_PAGE_SELECT_NEWS_ITEMS = text(
    '''SELECT * FROM (
                     SELECT i.id, i.title, i.url, i.summary, i.published_at, s.name AS source_name, s.category_id,
                            i.risk_level, i.risk_score, i.ai_summary,
                            row_number() OVER (PARTITION BY s.category_id ORDER BY i.published_at DESC) AS position
                     FROM news_items i JOIN news_sources s ON s.id = i.source_id
                     WHERE i.workspace_id = :workspace_id) ranked
                   WHERE position <= 100 ORDER BY published_at DESC'''
)


NOTIFY_WORKSPACE_SELECT_WORKSPACE_AGENT_PROVIDERS = text('SELECT 1 FROM workspace_agent_providers WHERE workspace_id = :workspace_id AND enabled LIMIT 1')


NOTIFY_WORKSPACE_SELECT_NEWS_ITEMS = text(
    '''SELECT c.id AS category_id, c.name, c.webhook_url, c.digest, c.digest_at,
                          i.id, i.title, i.url, i.risk_level, i.ai_summary, i.analyzed_at, i.created_at
                   FROM news_items i JOIN news_sources s ON s.id = i.source_id
                   JOIN news_categories c ON c.id = s.category_id
                   WHERE i.workspace_id = :workspace_id AND i.notified_at IS NULL
                   ORDER BY i.risk_score DESC NULLS LAST, i.published_at DESC'''
)


NEWS_PAGE_SELECT_NEWS_SOURCES = text(
    '''SELECT id, category_id, name, feed_url, enabled, last_fetched_at, last_error
                       FROM news_sources WHERE workspace_id = :workspace_id ORDER BY name'''
)


def refresh_workspace_select_news_sources_sql(due_only: bool) -> TextClause:
    # Enabled sources of a workspace; with ``due_only`` only those not fetched since :cutoff.
    # VI: Các nguồn đang bật của workspace; với ``due_only`` chỉ nguồn chưa lấy từ :cutoff.
    query = 'SELECT id, feed_url FROM news_sources WHERE workspace_id = :workspace_id AND enabled'
    if due_only:
        query += ' AND (last_fetched_at IS NULL OR last_fetched_at < :cutoff)'
    return text(query)
