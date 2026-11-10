"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

AUDIT_INSERT_AUDIT_LOGS = text(
    """INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :workspace_id, :actor_id, :action, 'initiative', :entity_id, CAST(:metadata AS jsonb), :now)"""
)


CREATE_INITIATIVE_INSERT_INITIATIVES = text('''INSERT INTO initiatives (id, workspace_id, name, description, status, priority, health, icon, owner_id, target_date, created_at, updated_at)
                VALUES (:id, :workspace_id, :name, :description, :status, :priority, :health, :icon, :owner_id, :target_date, :now, :now)''')


ARCHIVE_INITIATIVE_UPDATE_INITIATIVES = text('UPDATE initiatives SET archived_at = :now, updated_at = :now WHERE id = :initiative_id')


LINK_PROJECT_INSERT_INITIATIVE_PROJECTS = text('INSERT INTO initiative_projects (initiative_id, project_id) VALUES (:initiative_id, :project_id) ON CONFLICT DO NOTHING')


UNLINK_PROJECT_DELETE_INITIATIVE_PROJECTS = text('DELETE FROM initiative_projects WHERE initiative_id = :initiative_id AND project_id = :project_id')


LINK_LABEL_INSERT_INITIATIVE_LABEL_LINKS = text('INSERT INTO initiative_label_links (initiative_id, label_id) VALUES (:initiative_id, :label_id) ON CONFLICT DO NOTHING')


UNLINK_LABEL_DELETE_INITIATIVE_LABEL_LINKS = text('DELETE FROM initiative_label_links WHERE initiative_id = :initiative_id AND label_id = :label_id')


CREATE_UPDATE_INSERT_INITIATIVE_UPDATES = text('''INSERT INTO initiative_updates (id, workspace_id, initiative_id, author_id, body, health, created_at, updated_at)
        VALUES (:id, :workspace_id, :initiative_id, :author_id, :body, :health, :now, :now)''')


ADD_RESOURCE_INSERT_INITIATIVE_RESOURCES = text('''INSERT INTO initiative_resources (id, workspace_id, initiative_id, created_by, label, url, created_at, updated_at)
        VALUES (:id, :workspace_id, :initiative_id, :created_by, :label, :url, :now, :now)''')


def update_initiative_update_initiatives_sql(sets) -> TextClause:
    return text(f"UPDATE initiatives SET {', '.join(sets)}, updated_at = :now WHERE id = :initiative_id")


CREATE_UPDATE_UPDATE_INITIATIVES = text('UPDATE initiatives SET health = :health, updated_at = :now WHERE id = :initiative_id')


DELETE_CUSTOM_FIELD_DELETE_PROJECT_CUSTOM_FIELDS = text('DELETE FROM project_custom_fields WHERE id = :id')


DELETE_PROJECT_LABEL_DELETE_PROJECT_LABELS = text('DELETE FROM project_labels WHERE id = :id')


DELETE_PROJECT_STATUS_DELETE_PROJECT_STATUSES = text('DELETE FROM project_statuses WHERE id = :id')


DELETE_PROJECT_TEMPLATE_DELETE_PROJECT_TEMPLATES = text('DELETE FROM project_templates WHERE id = :id')


UPDATE_PROJECT_INSERT_ACTIVITIES = text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.updated', CAST('{}' AS jsonb), :now)")


UPDATE_PROJECT_CUSTOM_FIELD_INSERT_PROJECT_CUSTOM_FIELD_VALUES = text('''INSERT INTO project_custom_field_values (project_id, field_id, value, created_at, updated_at)
                VALUES (:project_id, :field_id, CAST(:value AS jsonb), :now, :now)
                ON CONFLICT (project_id, field_id) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at''')


UPDATE_PROJECT_CUSTOM_FIELD_INSERT_ACTIVITIES = text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.custom-field.updated', CAST(:data AS jsonb), :now)")


UPDATE_MEMBERS_DELETE_PROJECT_MEMBERS = text('DELETE FROM project_members WHERE project_id = :project_id')


UPDATE_MEMBERS_INSERT_ACTIVITIES = text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.members.updated', CAST(:data AS jsonb), :now)")


SUBSCRIBE_INSERT_PROJECT_SUBSCRIPTIONS = text('INSERT INTO project_subscriptions (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now) ON CONFLICT (project_id, user_id) DO NOTHING')


UNSUBSCRIBE_DELETE_PROJECT_SUBSCRIPTIONS = text('DELETE FROM project_subscriptions WHERE project_id = :project_id AND user_id = :user_id')


FAVORITE_INSERT_PROJECT_FAVORITES = text('INSERT INTO project_favorites (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now) ON CONFLICT (project_id, user_id) DO NOTHING')


UNFAVORITE_DELETE_PROJECT_FAVORITES = text('DELETE FROM project_favorites WHERE project_id = :project_id AND user_id = :user_id')


CREATE_MILESTONE_INSERT_PROJECT_MILESTONES = text('''INSERT INTO project_milestones (id, workspace_id, project_id, title, description, target_date, position, created_at, updated_at) VALUES (:id, :workspace_id, :project_id, :title, :description, :target_date, :position, :now, :now)''')


REMOVE_MILESTONE_DELETE_PROJECT_MILESTONES = text('DELETE FROM project_milestones WHERE id = :id AND project_id = :project_id AND workspace_id = :workspace_id RETURNING id')


CREATE_UPDATE_INSERT_PROJECT_UPDATES = text('''INSERT INTO project_updates (id, workspace_id, project_id, author_id, body, kind, health, created_at, updated_at) VALUES (:id, :workspace_id, :project_id, :author_id, :body, :kind, :health, :now, :now)''')


CREATE_UPDATE_INSERT_PROJECT_SUBSCRIPTIONS = text('INSERT INTO project_subscriptions (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now) ON CONFLICT (project_id, user_id) DO NOTHING')


CREATE_UPDATE_INSERT_ACTIVITIES = text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.update.created', CAST(:data AS jsonb), :now)")


CREATE_RESOURCE_INSERT_PROJECT_RESOURCES = text('''INSERT INTO project_resources (id, workspace_id, project_id, created_by, label, url, created_at, updated_at) VALUES (:id, :workspace_id, :project_id, :created_by, :label, :url, :now, :now)''')


CREATE_RESOURCE_INSERT_ACTIVITIES = text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.resource.created', CAST(:data AS jsonb), :now)")


CREATE_CUSTOM_FIELD_INSERT_PROJECT_CUSTOM_FIELDS = text('''INSERT INTO project_custom_fields
                    (id, workspace_id, name, type, description, options, required, position, created_at, updated_at)
                    VALUES (:id, :workspace_id, :name, CAST(:type AS "ProjectCustomFieldType"), :description, CAST(:options AS jsonb), :required, :position, :now, :now)''')


def update_custom_field_update_project_custom_fields_sql(assignments) -> TextClause:
    return text(f"UPDATE project_custom_fields SET {', '.join(assignments)} WHERE id = :id")


CREATE_PROJECT_LABEL_INSERT_PROJECT_LABELS = text('''INSERT INTO project_labels (id, workspace_id, name, color, description, created_at, updated_at)
                    VALUES (:id, :workspace_id, :name, :color, :description, :now, :now)''')


CREATE_PROJECT_STATUS_INSERT_PROJECT_STATUSES = text('''INSERT INTO project_statuses (id, workspace_id, name, category, color, position, created_at, updated_at)
                    VALUES (:id, :workspace_id, :name, :category, :color, :position, :now, :now)''')


def update_project_status_update_project_statuses_sql(sets) -> TextClause:
    return text(f"UPDATE project_statuses SET {', '.join(sets)} WHERE id = :id")


CREATE_PROJECT_TEMPLATE_INSERT_PROJECT_TEMPLATES = text('''INSERT INTO project_templates (id, workspace_id, name, description, type, config, created_at, updated_at)
                    VALUES (:id, :workspace_id, :name, :description, CAST(:type AS "ProjectType"), CAST(:config AS jsonb), :now, :now)''')


ENSURE_DEFAULT_PROJECT_STATUSES_INSERT_PROJECT_STATUSES = text(
    '''INSERT INTO project_statuses
                   (id, workspace_id, name, category, color, position, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :category, :color, :position, :now, :now)
                   ON CONFLICT (workspace_id, name) DO NOTHING'''
)


CREATE_PROJECT_INSERT_PROJECTS = text('''INSERT INTO projects (id, workspace_id, team_id, name, identifier, slug, description, type, status, priority, health, created_at, updated_at) VALUES (:id, :workspace_id, :team_id, :name, :identifier, :slug, :description, :type, :status, :priority, :health, :now, :now)''')


CREATE_PROJECT_INSERT_ACTIVITIES = text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.created', CAST(:data AS jsonb), :now)")


UPDATE_PROJECT_DELETE_PROJECT_LABEL_LINKS = text('DELETE FROM project_label_links WHERE project_id = :project_id')


UPDATE_MEMBERS_INSERT_PROJECT_MEMBERS = text('INSERT INTO project_members (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now)')


def update_milestone_update_project_milestones_sql(sets) -> TextClause:
    return text(f"UPDATE project_milestones SET {', '.join(sets)}, updated_at = :now WHERE id = :id")


CREATE_UPDATE_UPDATE_PROJECTS = text('UPDATE projects SET health = :health, updated_at = :now WHERE id = :id')


UPDATE_CUSTOM_FIELD_DELETE_PROJECT_CUSTOM_FIELD_VALUES = text('DELETE FROM project_custom_field_values WHERE field_id = :id')


def update_project_label_update_project_labels_sql(sets) -> TextClause:
    return text(f"UPDATE project_labels SET {', '.join(sets)} WHERE id = :id")


UPDATE_PROJECT_STATUS_UPDATE_PROJECTS = text('UPDATE projects SET status = :name, updated_at = :now WHERE workspace_id = :workspace_id AND status = :previous')


def update_project_template_update_project_templates_sql(sets) -> TextClause:
    return text(f"UPDATE project_templates SET {', '.join(sets)} WHERE id = :id")


def update_project_update_projects_sql(sets) -> TextClause:
    return text(f"UPDATE projects SET {', '.join(sets)}, updated_at = :now WHERE id = :id")


UPDATE_PROJECT_INSERT_PROJECT_LABEL_LINKS = text('INSERT INTO project_label_links (project_id, label_id) VALUES (:project_id, :label_id)')
