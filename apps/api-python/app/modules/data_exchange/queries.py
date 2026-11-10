"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

DOCUMENT_OPTIONS_SELECT_DOCUMENTS = text("""SELECT d.id,d.title FROM documents d WHERE d.workspace_id=:workspace AND d.archived_at IS NULL AND d.id>:after
        AND (d.team_id IS NULL OR EXISTS(SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
        WHERE t.id=d.team_id AND t.archived_at IS NULL AND tm.user_id=:actor)) ORDER BY d.id LIMIT 101""")


HISTORY_SELECT_ISSUE_IMPORT_BATCHES = text("""SELECT b.id,b.state,b.created_at AS "createdAt",b.source_key AS "sourceKey" FROM issue_import_batches b
        JOIN team_members tm ON tm.team_id=b.team_id AND tm.user_id=:actor
        JOIN teams t ON t.id=b.team_id AND t.archived_at IS NULL
        WHERE b.workspace_id=:workspace AND b.actor_id=:actor ORDER BY b.created_at DESC,b.id DESC LIMIT 20""")


def export_issues_select_projects_sql(scope) -> TextClause:
    return text(
        """SELECT i.id,i.identifier,i.title,i.description,i.issue_type,i.priority,i.severity,
        i.status_id,s.name AS status_name,i.team_id,i.project_id,i.assignee_id,i.start_date,i.target_date,i.due_date,i.created_at,i.updated_at,
        t.name AS team_name,(SELECT p.name FROM projects p WHERE p.id=i.project_id) AS project_name,
        (SELECT u.name FROM users u WHERE u.id=i.assignee_id) AS assignee_name,i.estimated_effort,i.actual_effort,
        (SELECT string_agg(l.name,', ' ORDER BY l.name) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id) AS label_names """
        + scope
        + " ORDER BY i.created_at DESC,i.id DESC LIMIT 10001"
    )


EXPORT_DOCUMENTS_SELECT_DOCUMENTS = text(
    "SELECT id,title,content,team_id,source_type,source_url FROM documents WHERE workspace_id=:workspace AND id=ANY(CAST(:ids AS text[])) AND archived_at IS NULL ORDER BY id"
)


EXPORT_DOCUMENTS_SELECT_ATTACHMENTS = text(
    "SELECT id,entity_id,filename,object_key,size FROM attachments WHERE workspace_id=:workspace AND entity_type='document' AND entity_id=ANY(CAST(:ids AS text[])) ORDER BY id LIMIT 201"
)


DUPLICATE_KEY_SELECT_ISSUE_IMPORT_KEYS = text(
    "SELECT 1 FROM issue_import_keys WHERE workspace_id=:workspace AND source_key=:source AND external_id=:external"
)


IMPORT_RESULT_SELECT_ISSUE_IMPORT_ROWS = text(
    "SELECT state,COUNT(*) FROM issue_import_rows WHERE batch_id=:id GROUP BY state"
)


IMPORT_PREVIEW_SELECT_ISSUE_IMPORT_BATCHES = text(
    "SELECT id,fingerprint FROM issue_import_batches WHERE actor_id=:actor AND request_key=:key"
)


def owned_batch_select_issue_import_batches_sql(lock) -> TextClause:
    return text(
        "SELECT * FROM issue_import_batches WHERE id=:id AND workspace_id=:workspace AND actor_id=:actor"
        + (" FOR UPDATE" if lock else "")
    )


IMPORT_RESULT_SELECT_ISSUE_IMPORT_ROWS_2 = text(
    "SELECT row_number,external_id,payload,state,error_code,issue_id,identifier FROM issue_import_rows WHERE batch_id=:id AND row_number>:after ORDER BY row_number LIMIT 51"
)


PROCESS_IMPORT_ROW_SELECT_ISSUE_IMPORT_BATCHES = text(
    "SELECT * FROM issue_import_batches WHERE state IN ('QUEUED','RUNNING') ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1"
)


PROCESS_IMPORT_ROW_SELECT_USERS = text(
    "SELECT id,name,avatar_url AS \"avatarUrl\" FROM users WHERE id=:id AND status='ACTIVE'"
)


PROCESS_IMPORT_ROW_SELECT_ISSUE_IMPORT_ROWS = text(
    "SELECT * FROM issue_import_rows WHERE batch_id=:id AND state='PENDING' ORDER BY row_number LIMIT 1 FOR UPDATE"
)
