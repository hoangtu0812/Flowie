"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

ANALYZE_WORKSPACE_UPDATE_NEWS_CATEGORIES = text('UPDATE news_categories SET digest = :digest, digest_at = :now WHERE id = :id')


ANALYZE_WORKSPACE_UPDATE_NEWS_ITEMS = text(
    '''UPDATE news_items SET risk_level = :risk, risk_score = :score, ai_summary = :summary,
                                      analyzed_at = :now WHERE id = :id'''
)


CREATE_CATEGORY_INSERT_NEWS_CATEGORIES = text(
    '''INSERT INTO news_categories (id, workspace_id, name, webhook_url, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :webhook_url, :now, :now)
                   ON CONFLICT (workspace_id, name) DO NOTHING RETURNING id'''
)


UPDATE_CATEGORY_UPDATE_NEWS_CATEGORIES = text(
    '''UPDATE news_categories SET webhook_url = :webhook_url, updated_at = :now
                   WHERE id = :id AND workspace_id = :workspace_id RETURNING id'''
)


DELETE_CATEGORY_DELETE_NEWS_CATEGORIES = text('DELETE FROM news_categories WHERE id = :id AND workspace_id = :workspace_id RETURNING id')


CREATE_SOURCE_INSERT_NEWS_SOURCES = text(
    '''INSERT INTO news_sources (id, workspace_id, category_id, name, feed_url, enabled, created_at)
                   SELECT :id, workspace_id, id, :name, :feed_url, TRUE, :now FROM news_categories
                   WHERE id = :category_id AND workspace_id = :workspace_id RETURNING id'''
)


UPDATE_SOURCE_UPDATE_NEWS_SOURCES = text('UPDATE news_sources SET enabled = :enabled WHERE id = :id AND workspace_id = :workspace_id RETURNING id')


DELETE_SOURCE_DELETE_NEWS_SOURCES = text('DELETE FROM news_sources WHERE id = :id AND workspace_id = :workspace_id RETURNING id')


REFRESH_WORKSPACE_UPDATE_NEWS_SOURCES = text('UPDATE news_sources SET last_fetched_at = :now, last_error = :error WHERE id = :id')


NOTIFY_WORKSPACE_UPDATE_NEWS_ITEMS = text('UPDATE news_items SET notified_at = :now WHERE id = ANY(:ids)')


REFRESH_WORKSPACE_INSERT_NEWS_ITEMS = text(
    '''INSERT INTO news_items (id, workspace_id, source_id, title, url, summary, published_at, created_at)
                           VALUES (:id, :workspace_id, :source_id, :title, :url, :summary, :published_at, :now)
                           ON CONFLICT (workspace_id, url) DO NOTHING'''
)
