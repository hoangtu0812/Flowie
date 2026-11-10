"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

VIEW_SELECT_SAVED_VIEWS = text(
    """SELECT view.id, view.workspace_id, view.created_by, view.name, view.description,
                      view.entity_type, view.filters, view.is_shared, view.created_at, view.updated_at,
                      creator.id AS creator_id, creator.name AS creator_name,
                      creator.avatar_url AS creator_avatar_url
               FROM saved_views view
               JOIN users creator ON creator.id = view.created_by
               WHERE view.id = :view_id AND view.workspace_id = :workspace_id
                 AND (view.is_shared = TRUE OR view.created_by = :user_id)
               LIMIT 1"""
)


LIST_VIEWS_SELECT_SAVED_VIEWS = text(
    """SELECT id FROM saved_views
               WHERE workspace_id = :workspace_id
                 AND (is_shared = TRUE OR created_by = :user_id)
               ORDER BY is_shared DESC, updated_at DESC"""
)


def config_references_select_sql(table, active) -> TextClause:
    return text(
        f"SELECT COUNT(*) FROM {table} WHERE workspace_id=:workspace AND id=ANY(CAST(:ids AS text[])){active}"
    )


CONFIG_REFERENCES_SELECT_WORKSPACE_MEMBERS = text(
    "SELECT COUNT(*) FROM workspace_members WHERE workspace_id=:workspace AND status='ACTIVE' AND user_id=ANY(CAST(:ids AS text[]))"
)
