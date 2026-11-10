"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def audit_page_select_attributed_sql(EVENTS, predicate) -> TextClause:
    return text(EVENTS + "SELECT COUNT(*) FROM attributed ev WHERE " + predicate)


def audit_page_select_attributed_sql_2(EVENTS, predicate) -> TextClause:
    return text(
        EVENTS
        + """SELECT ev.*,u.name AS actor_name FROM attributed ev LEFT JOIN users u ON u.id=ev.actor_id
        WHERE """
        + predicate
        + " ORDER BY ev.created_at DESC,ev.id DESC LIMIT :limit"
    )
