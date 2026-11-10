"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

REMOVE_REPOSITORY_DELETE_PROJECT_REPOSITORIES = text("DELETE FROM project_repositories WHERE id=:id")


CONFIGURE_REPOSITORY_INSERT_PROJECT_REPOSITORIES = text("""INSERT INTO project_repositories (id,workspace_id,project_id,name,repository_url,base_branch,test_commands,instructions)
        VALUES (:id,:workspace,:project,:name,:url,:branch,CAST(:commands AS jsonb),:instructions)
        ON CONFLICT (project_id,repository_url) DO UPDATE SET name=EXCLUDED.name,base_branch=EXCLUDED.base_branch,
            test_commands=EXCLUDED.test_commands,instructions=EXCLUDED.instructions RETURNING id""")


UPDATE_REPOSITORY_UPDATE_PROJECT_REPOSITORIES = text("""UPDATE project_repositories SET name=:name,repository_url=:url,base_branch=:branch,
            test_commands=CAST(:commands AS jsonb),instructions=:instructions
            WHERE id=:id AND workspace_id=:workspace AND project_id=:project RETURNING id""")


MANAGEMENT_AUDIT_INSERT_AUDIT_LOGS = text("""INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:actor,:action,'agent-run-management',:entity,'{}'::jsonb,:now)""")
