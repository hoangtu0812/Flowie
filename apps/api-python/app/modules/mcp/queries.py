"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def resources_select_teams_sql(policy) -> TextClause:
    return text(f"""SELECT t.id,t.name FROM teams t WHERE t.workspace_id=:workspace
        AND t.archived_at IS NULL AND {policy.team_clause("t.id")} ORDER BY t.name,t.id LIMIT 201""")


def resources_select_projects_sql(policy) -> TextClause:
    return text(f"""SELECT p.id,p.name,p.team_id AS "teamId" FROM projects p
        WHERE p.workspace_id=:workspace AND p.archived_at IS NULL AND {policy.team_clause("p.team_id", shared=True)}
        ORDER BY p.name,p.id LIMIT 201""")


RESOURCES_SELECT_LABELS = text(
    "SELECT id,name FROM labels WHERE workspace_id=:workspace ORDER BY name,id LIMIT 201"
)


def connection_audit_select_audit_logs_sql(AUDIT_CONNECTION, AUDIT_SCOPE, page) -> TextClause:
    return text(f"""SELECT a.id,a.action,a.entity_id AS "entityId",a.metadata,a.created_at AS "createdAt",
        {AUDIT_CONNECTION} AS "connectionId",c.name AS "connectionName",u.name AS "actorName"
        FROM audit_logs a LEFT JOIN mcp_connections c ON c.id={AUDIT_CONNECTION} AND c.workspace_id=a.workspace_id
        LEFT JOIN users u ON u.id=a.actor_id
        WHERE {AUDIT_SCOPE}
        AND (CAST(:connection AS text) IS NULL OR {AUDIT_CONNECTION}=:connection)
        AND (CAST(:tool AS text) IS NULL OR a.metadata->>'tool'=:tool)
        AND (CAST(:outcome AS text) IS NULL
            OR (:outcome='succeeded' AND a.action LIKE '%.succeeded')
            OR (:outcome='failed' AND (a.action LIKE '%.failed' OR a.action LIKE '%.denied')))
        {page} ORDER BY a.created_at DESC,a.id DESC LIMIT :limit""")


MUTATE_SELECT_MCP_REQUESTS = text("SELECT COUNT(*) FROM mcp_requests WHERE connection_id=:id")


READ_ONLY_SELECT_WORKSPACE_MEMBERS = text("SELECT role FROM workspace_members WHERE workspace_id = :workspace AND user_id = :user AND status = 'ACTIVE'")


READ_SELECT_WORKSPACES = text("SELECT id,name,slug FROM workspaces WHERE id=:id")


MUTATE_SELECT_MCP_REQUESTS_2 = text("""SELECT request_hash,result FROM mcp_requests
            WHERE connection_id=:connection AND tool=:tool AND key=:key""")


STATUS_BY_NAME_SELECT_ISSUE_STATUSES = text("""SELECT id,name FROM issue_statuses WHERE workspace_id=:workspace
                AND (team_id IS NULL OR team_id=:team) ORDER BY position,name""")


EXECUTE_SELECT_DOCUMENT_REVISIONS = text(
    "SELECT title,content FROM document_revisions WHERE document_id=:id AND version=:version"
)


PREPARE_SELECT_ISSUE_STATUSES = text("""SELECT category FROM issue_statuses WHERE id=:id
                AND workspace_id=:workspace AND (team_id IS NULL OR team_id=:team)""")


AUTHENTICATE_SELECT_MCP_CONNECTIONS = text("""
        SELECT c.*,u.name AS user_name,u.email,u.avatar_url,w.mcp_instructions
        FROM mcp_connections c JOIN users u ON u.id=c.user_id
        JOIN workspaces w ON w.id=c.workspace_id
        JOIN workspace_members wm ON wm.workspace_id=c.workspace_id AND wm.user_id=c.user_id
        WHERE c.token_hash=:hash AND c.revoked_at IS NULL AND c.expires_at>:now
        AND u.status='ACTIVE' AND wm.status='ACTIVE'
    """)


LIST_CONNECTIONS_SELECT_MCP_CONNECTIONS = text("""SELECT * FROM mcp_connections WHERE workspace_id=:workspace
        AND (:manager OR user_id=:user) ORDER BY created_at DESC LIMIT 200""")


VALIDATE_CURRENT_SELECT_MCP_CONNECTIONS = text("""
        SELECT c.id FROM mcp_connections c JOIN users u ON u.id=c.user_id
        JOIN workspace_members wm ON wm.user_id=c.user_id AND wm.workspace_id=c.workspace_id
        WHERE c.id=:id AND c.revoked_at IS NULL AND c.expires_at>:now
        AND u.status='ACTIVE' AND wm.status='ACTIVE' FOR SHARE OF c,u,wm
    """)


LOAD_PRINCIPAL_SELECT_MCP_CONNECTIONS = text("""SELECT c.*,u.name AS user_name,u.email,u.avatar_url
        FROM mcp_connections c JOIN users u ON u.id=c.user_id
        JOIN workspace_members wm ON wm.user_id=c.user_id AND wm.workspace_id=c.workspace_id
        WHERE c.id=:id AND c.revoked_at IS NULL AND c.expires_at>:now AND u.status='ACTIVE' AND wm.status='ACTIVE' """)


UPDATE_SELECT_MCP_CONNECTIONS = text("""SELECT * FROM mcp_connections WHERE id=:id AND workspace_id=:workspace
        AND user_id=:user AND revoked_at IS NULL AND expires_at>:now FOR UPDATE""")


CHILD_FOLDER_SELECT_DOCUMENT_FOLDERS = text(
    "SELECT id FROM document_folders WHERE parent_id=:parent AND lower(name)=lower(:name)"
)


UPSERT_FEATURE_DOC_SELECT_DOCUMENT_FOLDERS = text(
    """SELECT id FROM document_folders WHERE project_id=:project AND parent_id IS NULL
                AND kind='project' ORDER BY created_at LIMIT 1"""
)


UPSERT_FEATURE_DOC_SELECT_DOCUMENTS = text(
    """SELECT id FROM documents WHERE folder_id=:folder AND doc_type=:type
                AND archived_at IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE"""
)


UPSERT_FEATURE_DOC_SELECT_DOCUMENTS_2 = text("SELECT content FROM documents WHERE id=:id")


def read_feature_docs_select_documents_sql(policy) -> TextClause:
    return text(
        f"""SELECT d.* FROM documents d WHERE {policy.document_clause()}
                AND d.doc_type IN ('FDS','TDS')
                AND EXISTS(SELECT 1 FROM document_links l WHERE l.document_id=d.id AND l.issue_id=:issue)
                ORDER BY d.doc_type, d.title"""
    )


READ_FEATURE_DOCS_SELECT_DOCUMENT_FOLDERS = text(
    """SELECT f.id, f.name, m.name AS module FROM document_folders f
                    JOIN document_folders m ON m.id = f.parent_id
                    WHERE f.workspace_id=:workspace AND f.project_id=:project AND f.kind='feature'
                    ORDER BY m.name, f.name"""
)


def read_feature_docs_select_documents_sql_2(policy) -> TextClause:
    return text(
        f"""SELECT d.* FROM documents d WHERE {policy.document_clause()}
                    AND d.doc_type IN ('FDS','TDS') AND d.folder_id = ANY(CAST(:folders AS text[]))
                    ORDER BY d.doc_type, d.title"""
    )


READ_SELECT_WORKSPACES_2 = text("SELECT mcp_instructions FROM workspaces WHERE id=:id")


def team_select_teams_sql(self) -> TextClause:
    return text(f"""SELECT t.id FROM teams t WHERE t.id=:id
            AND t.workspace_id=:workspace AND t.archived_at IS NULL
            AND {self.team_clause("t.id")}
            AND (:all_projects OR EXISTS (SELECT 1 FROM projects p WHERE p.workspace_id=:workspace
                AND p.archived_at IS NULL AND (p.team_id=t.id OR p.team_id IS NULL)
                AND {self.project_clause("p.id")}))""")


def project_select_projects_sql(self) -> TextClause:
    return text(f"""SELECT p.* FROM projects p
            WHERE p.id=:id AND {self.project_read_clause()}""")


def issue_select_issues_sql(self, lock) -> TextClause:
    return text(f"""SELECT i.* FROM issues i
            WHERE (i.id=:id OR i.identifier=:id) AND {self.issue_clause()}
            {"FOR UPDATE OF i" if lock else ""}""")


def document_select_documents_sql(self, lock) -> TextClause:
    return text(f"""SELECT d.* FROM documents d
            WHERE d.id=:id AND {self.document_clause()} {"FOR UPDATE OF d" if lock else ""}""")


def comment_select_comments_sql(self, lock) -> TextClause:
    return text(f"""SELECT c.* FROM comments c JOIN issues i ON i.id=c.issue_id
            WHERE c.id=:id AND c.deleted_at IS NULL AND {self.issue_clause()}
            {"FOR UPDATE OF c" if lock else ""}""")


PROJECT_REPOSITORIES_SELECT_PROJECT_REPOSITORIES = text("""SELECT id,name,repository_url AS "repositoryUrl",base_branch AS "baseBranch",
            test_commands AS "testCommands",instructions FROM project_repositories
            WHERE workspace_id=:workspace AND project_id=:project ORDER BY name,id LIMIT 100""")


OPTIONS_SELECT_ISSUE_STATUSES = text("""SELECT id,name,category FROM issue_statuses
            WHERE workspace_id=:workspace AND (team_id IS NULL OR team_id=:team) ORDER BY position,id LIMIT 100""")


OPTIONS_SELECT_LABELS = text("""SELECT id,name FROM labels WHERE workspace_id=:workspace
            ORDER BY name,id LIMIT 100""")


OPTIONS_SELECT_USERS = text("""SELECT u.id,u.name FROM users u JOIN team_members tm ON tm.user_id=u.id
            JOIN workspace_members wm ON wm.user_id=u.id AND wm.workspace_id=:workspace
            WHERE tm.team_id=:team AND u.status='ACTIVE' AND wm.status='ACTIVE' ORDER BY u.name,u.id LIMIT 100""")


def context_select_issue_relations_sql(self) -> TextClause:
    return text(f"""SELECT other.id,other.identifier,other.title,r.type
            FROM issue_relations r JOIN issues other ON other.id=CASE WHEN r.issue_id=:id THEN r.related_issue_id ELSE r.issue_id END
            WHERE r.workspace_id=:workspace AND (r.issue_id=:id OR r.related_issue_id=:id)
            AND {self.policy.issue_clause("other")} ORDER BY other.id LIMIT 26""")


def page_select_sql(sql, cursor_clause, time_field) -> TextClause:
    return text(f'''SELECT * FROM ({sql}) result WHERE TRUE {cursor_clause}
            ORDER BY result."{time_field}" DESC,result.id DESC LIMIT :limit''')


CONTEXT_SELECT_ATTACHMENTS = text("""SELECT id,filename,mime_type AS "mimeType",size FROM attachments
            WHERE workspace_id=:workspace AND entity_type='issue' AND entity_id=:issue ORDER BY created_at,id LIMIT :limit""")


def context_select_issues_sql(self) -> TextClause:
    return text(f"""SELECT child.id,child.identifier,child.title FROM issues child
            WHERE child.parent_issue_id=:issue AND {self.policy.issue_clause("child")} ORDER BY child.id LIMIT :limit""")


AUTHORIZED_ATTACHMENT_SELECT_ATTACHMENTS = text(
    "SELECT * FROM attachments WHERE id=:id AND workspace_id=:workspace"
)


LIMITS_SELECT_AI_WORKSPACE_LIMITS = text(
    "SELECT total_per_minute,per_tool FROM ai_workspace_limits WHERE workspace_id=:workspace"
)


UPLOAD_ATTACHMENT_SELECT_MCP_REQUESTS = text("""SELECT result FROM mcp_requests
                WHERE connection_id=:connection AND tool=:tool AND key=:key""")


def connection_audit_summary_totals_sql(counts, p95, scope) -> TextClause:
    return text(
        f"SELECT {counts},{p95} {scope}"
    )


def connection_audit_summary_tools_sql(counts, p95, scope) -> TextClause:
    return text(
        f"""SELECT a.metadata->>'tool' AS tool,{counts},{p95},
        round(avg((a.metadata->>'resultBytes')::int))::int AS "avgResultBytes" {scope}
        GROUP BY a.metadata->>'tool' ORDER BY count(*) DESC,1 LIMIT 100"""
    )


def connection_audit_summary_connections_sql(counts, scope) -> TextClause:
    return text(
        f"""SELECT s.*,c.name AS "connectionName",u.name AS "ownerName" FROM (
        SELECT a.metadata->>'connectionId' AS "connectionId",max(a.actor_id) AS actor,{counts},
        max(a.created_at) AS "lastCallAt" {scope} GROUP BY a.metadata->>'connectionId') s
        LEFT JOIN mcp_connections c ON c.id=s."connectionId" AND c.workspace_id=:workspace
        LEFT JOIN users u ON u.id=COALESCE(c.user_id,s.actor)
        ORDER BY s.calls DESC,s."connectionId" LIMIT 100"""
    )
