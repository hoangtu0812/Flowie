"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

RELEASE_SELECT_RELEASES = text(
    '''SELECT release.id, release.workspace_id, release.name, release.version, release.description,
                      release.status, release.target_date, release.released_at, release.created_by,
                      release.created_at, release.updated_at,
                      creator.id AS creator_id, creator.name AS creator_name, creator.avatar_url AS creator_avatar_url
               FROM releases release
               JOIN users creator ON creator.id = release.created_by
               WHERE release.id = :release_id AND release.workspace_id = :workspace_id
                 AND release.archived_at IS NULL'''
)


RELEASE_SELECT_RELEASE_PROJECTS = text(
    '''SELECT link.release_id, link.project_id, link.created_at,
                      project.id AS project_id_value, project.name AS project_name,
                      project.identifier AS project_identifier
               FROM release_projects link
               JOIN projects project ON project.id = link.project_id
               WHERE link.release_id = :release_id AND project.archived_at IS NULL
               ORDER BY link.created_at ASC'''
)


PROJECT_IDS_SELECT_PROJECTS = text(
    '''SELECT id FROM projects
               WHERE workspace_id = :workspace_id AND archived_at IS NULL AND id = ANY(:project_ids)'''
)


LIST_RELEASES_SELECT_RELEASES = text(
    '''SELECT id FROM releases
               WHERE workspace_id = :workspace_id AND archived_at IS NULL
               ORDER BY target_date DESC NULLS LAST, updated_at DESC'''
)
