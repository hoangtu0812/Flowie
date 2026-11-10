"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def restore_update_sql(table, actor_update) -> TextClause:
    return text(
        f"UPDATE {table} SET archived_at=NULL,updated_at=:now {actor_update} WHERE id=:id AND workspace_id=:workspace"
    )


RESTORE_INSERT_AUDIT_LOGS = text("""INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:user,:action,:kind,:entity,CAST(:metadata AS jsonb),:now)""")


ARCHIVE_PROJECT_UPDATE_ISSUES = text(
    "UPDATE issues SET archived_at=:now,updated_at=:now WHERE project_id=:id AND workspace_id=:workspace AND archived_at IS NULL"
)


ARCHIVE_PROJECT_UPDATE_PROJECTS = text(
    "UPDATE projects SET archived_at=:now,updated_at=:now WHERE id=:id AND workspace_id=:workspace"
)


ARCHIVE_PROJECT_INSERT_AUDIT_LOGS = text("""INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:audit,:workspace,:user,'project.archived','project',:id,'{"source":"web"}'::jsonb,:now)""")
