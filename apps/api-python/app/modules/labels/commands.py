"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

DELETE_LABEL_DELETE_LABELS = text('DELETE FROM labels WHERE id = :id')


DELETE_LABEL_GROUP_DELETE_LABEL_GROUPS = text('DELETE FROM label_groups WHERE id = :id')


CREATE_LABEL_INSERT_LABELS = text(
    '''INSERT INTO labels
                   (id, workspace_id, group_id, name, color, description, created_at, updated_at)
                   VALUES (:id, :workspace_id, :group_id, :name, :color, :description, :now, :now)'''
)


def update_label_update_labels_sql(assignments) -> TextClause:
    return text(f"UPDATE labels SET {', '.join(assignments)}, updated_at = :now WHERE id = :id")


CREATE_LABEL_GROUP_INSERT_LABEL_GROUPS = text(
    '''INSERT INTO label_groups
                   (id, workspace_id, name, description, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :description, :now, :now)'''
)


def update_label_group_update_label_groups_sql(assignments) -> TextClause:
    return text(f'UPDATE label_groups SET {assignments}, updated_at = :now WHERE id = :id')
