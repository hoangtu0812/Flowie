"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

GROUP_EXISTS_SELECT_LABEL_GROUPS = text('SELECT 1 FROM label_groups WHERE id = :id AND workspace_id = :workspace_id')


LABEL_RECORD_SELECT_LABELS = text(
    '''SELECT l.id, l.workspace_id, l.group_id, l.name, l.color, l.description,
                      l.created_at, l.updated_at, g.name AS group_name,
                      COUNT(il.label_id)::int AS issue_count, MAX(il.created_at) AS last_applied
               FROM labels l
               LEFT JOIN label_groups g ON g.id = l.group_id
               LEFT JOIN issue_labels il ON il.label_id = l.id
               WHERE l.id = :label_id AND l.workspace_id = :workspace_id
               GROUP BY l.id, g.name
               LIMIT 1'''
)


GROUP_RECORD_SELECT_LABEL_GROUPS = text(
    '''SELECT g.id, g.workspace_id, g.name, g.description, g.created_at, g.updated_at,
                      COUNT(l.id)::int AS label_count
               FROM label_groups g
               LEFT JOIN labels l ON l.group_id = g.id
               WHERE g.id = :group_id AND g.workspace_id = :workspace_id
               GROUP BY g.id
               LIMIT 1'''
)


LIST_LABELS_SELECT_LABELS = text(
    '''SELECT l.id FROM labels l
               WHERE l.workspace_id = :workspace_id
               ORDER BY l.name ASC'''
)


LIST_LABEL_GROUPS_SELECT_LABEL_GROUPS = text('SELECT id FROM label_groups WHERE workspace_id = :workspace_id ORDER BY name ASC')
