"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

AUDIT_INSERT_AUDIT_LOGS = text(
    '''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :workspace_id, :actor_id, :action, 'release', :entity_id,
                       CAST(:metadata AS jsonb), :created_at)'''
)


ARCHIVE_RELEASE_UPDATE_RELEASES = text('UPDATE releases SET archived_at = :now, updated_at = :now WHERE id = :release_id')


CREATE_RELEASE_INSERT_RELEASES = text(
    '''INSERT INTO releases
                   (id, workspace_id, name, version, description, status, target_date, released_at,
                    created_by, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :version, :description, :status, :target_date,
                           :released_at, :created_by, :now, :now)'''
)


CREATE_RELEASE_INSERT_RELEASE_PROJECTS = text('INSERT INTO release_projects (release_id, project_id, created_at) VALUES (:release_id, :project_id, :now)')


def update_release_update_releases_sql(sets) -> TextClause:
    return text(f"UPDATE releases SET {', '.join(sets)}, updated_at = :now WHERE id = :release_id")


UPDATE_RELEASE_DELETE_RELEASE_PROJECTS = text('DELETE FROM release_projects WHERE release_id = :release_id')


UPDATE_RELEASE_INSERT_RELEASE_PROJECTS = text('INSERT INTO release_projects (release_id, project_id, created_at) VALUES (:release_id, :project_id, :now)')
