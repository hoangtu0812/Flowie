"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def search_select_sql(SOURCES, after) -> TextClause:
    return text(f"""SELECT r.kind,r.id,r.title,r.subtitle,r.path,r.created_at FROM ({SOURCES}) r
        WHERE translate(lower(r.search_text),:accents,:normalized) ILIKE :pattern ESCAPE '\\'
        AND (CAST(:kind AS text) IS NULL OR r.kind=CAST(:kind AS text)) {after}
        ORDER BY r.created_at DESC,r.kind||':'||r.id DESC LIMIT :limit""")
