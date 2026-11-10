"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

CREATE_VIEW_INSERT_SAVED_VIEWS = text(
    """INSERT INTO saved_views
               (id, workspace_id, created_by, name, description, entity_type, filters, is_shared, created_at, updated_at)
               VALUES (:id, :workspace_id, :created_by, :name, :description, :entity_type,
                       CAST(:filters AS jsonb), :is_shared, :now, :now)"""
)


UPDATE_VIEW_UPDATE_SAVED_VIEWS = text("""UPDATE saved_views SET name=:name, description=:description,
        filters=CAST(:filters AS jsonb), is_shared=:shared,
        updated_at=GREATEST(:now, updated_at + interval '1 millisecond')
        WHERE id=:id AND workspace_id=:workspace AND created_by=:user AND updated_at=:expected RETURNING id""")


DELETE_VIEW_DELETE_SAVED_VIEWS = text(
    """DELETE FROM saved_views
               WHERE id = :view_id AND workspace_id = :workspace_id AND created_by = :user_id
                 AND (CAST(:expected AS timestamp) IS NULL OR updated_at=CAST(:expected AS timestamp))
               RETURNING id"""
)
