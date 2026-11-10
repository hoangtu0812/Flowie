"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def rows_select_documents_sql(COLUMNS, JOINS, SCOPE, where) -> TextClause:
    return text(f"""SELECT {COLUMNS} FROM documents d {JOINS}
        WHERE {SCOPE} AND {where} ORDER BY d.updated_at DESC,d.id LIMIT :limit""")


REVIEWERS_SELECT_DOCUMENT_REVIEWERS = text("""SELECT r.document_id,r.reviewer_id AS id,r.decision,r.note,u.name
        FROM document_reviewers r JOIN users u ON u.id=r.reviewer_id
        WHERE r.document_id=ANY(CAST(:ids AS text[])) ORDER BY r.assigned_at,r.reviewer_id""")


def done_select_audit_logs_sql(COLUMNS, JOINS, SCOPE) -> TextClause:
    return text(f"""WITH handled AS (
            SELECT entity_id AS document_id,max(created_at) AS handled_at FROM audit_logs
            WHERE workspace_id=:workspace AND actor_id=:user AND entity_type='document'
              AND action='document.review_decided'
            GROUP BY entity_id
            UNION ALL
            SELECT document_id,max(approved_at) FROM document_releases
            WHERE approved_by=:user GROUP BY document_id
        ), latest AS (
            SELECT document_id,max(handled_at) AS handled_at FROM handled GROUP BY document_id
        )
        SELECT {COLUMNS},latest.handled_at,mine.decision,
            (SELECT max(r.release) FROM document_releases r
             WHERE r.document_id=d.id AND r.approved_by=:user) AS own_release
        FROM latest JOIN documents d ON d.id=latest.document_id {JOINS}
        LEFT JOIN document_reviewers mine ON mine.document_id=d.id AND mine.reviewer_id=:user
        WHERE {SCOPE} ORDER BY latest.handled_at DESC,d.id LIMIT :limit""")


REPORT_SELECT_ISSUES = text("""SELECT COALESCE(i.severity::text,'UNSPECIFIED') AS severity,
        s.category, count(*) AS count FROM issues i JOIN issue_statuses s ON s.id=i.status_id
        LEFT JOIN teams t ON t.id=i.team_id WHERE i.workspace_id=:workspace AND i.issue_type='BUG'
        AND i.archived_at IS NULL AND t.archived_at IS NULL
        AND (i.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=i.team_id AND tm.user_id=:user))
        AND (CAST(:team AS text) IS NULL OR i.team_id=:team) AND (CAST(:project AS text) IS NULL OR i.project_id=:project)
        GROUP BY i.severity,s.category ORDER BY severity,s.category""")


RECENT_SELECT_BULK_OPERATIONS = text("""SELECT id,state,created_at AS "createdAt",expires_at AS "expiresAt"
        FROM bulk_operations WHERE workspace_id=:workspace AND actor_id=:user ORDER BY created_at DESC,id DESC LIMIT 20""")


BULK_PREVIEW_SELECT_BULK_OPERATIONS = text(
    "SELECT id,fingerprint FROM bulk_operations WHERE actor_id=:user AND request_key=:key"
)


def bulk_preview_select_sql(sql) -> TextClause:
    return text(
        "SELECT i.id,i.identifier,i.version "
        + sql
        + " ORDER BY i.id LIMIT 1001"
    )


def bulk_result_select_bulk_operations_sql(lock) -> TextClause:
    return text(
        "SELECT * FROM bulk_operations WHERE id=:id AND workspace_id=:workspace AND actor_id=:user"
        + (" FOR UPDATE" if lock else "")
    )


BULK_RESULT_SELECT_BULK_OPERATION_ITEMS = text(
    "SELECT state,COUNT(*) AS count FROM bulk_operation_items WHERE operation_id=:id GROUP BY state"
)


def bulk_result_select_sql(scope) -> TextClause:
    return text(
        """SELECT item.issue_id,item.identifier,item.expected_version,item.state,item.error_code,
        (item.state='PENDING' AND i.version<>item.expected_version) AS stale """
        + scope
        + """
        AND item.operation_id=:operation ORDER BY item.issue_id LIMIT 1000"""
    )


PROCESS_BULK_ITEM_SELECT_BULK_OPERATIONS = text("""SELECT * FROM bulk_operations
            WHERE state IN ('QUEUED','RUNNING') ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1""")


PROCESS_BULK_ITEM_SELECT_USERS = text("""SELECT u.id,u.name,u.avatar_url AS "avatarUrl" FROM users u
            JOIN workspace_members wm ON wm.user_id=u.id WHERE u.id=:user AND wm.workspace_id=:workspace
            AND wm.status='ACTIVE' AND u.status='ACTIVE' """)


PROCESS_BULK_ITEM_SELECT_BULK_OPERATION_ITEMS = text(
    "SELECT * FROM bulk_operation_items WHERE operation_id=:id AND state='PENDING' ORDER BY issue_id LIMIT 1 FOR UPDATE"
)


def process_bulk_item_select_sql(scope) -> TextClause:
    return text(
        "SELECT i.id,i.version,i.team_id "
        + scope
        + " AND i.id=:issue FOR UPDATE OF i"
    )


PROCESS_BULK_ITEM_SELECT_CYCLES = text(
    "SELECT 1 FROM cycles WHERE id=:cycle AND workspace_id=:workspace AND team_id=:team"
)


COMMENT_ROWS_SELECT_COMMENT_REACTIONS = text("""SELECT comment_id,emoji,count(*)::int AS count,bool_or(user_id=:user) AS reacted
        FROM comment_reactions WHERE comment_id=ANY(CAST(:ids AS text[])) GROUP BY comment_id,emoji ORDER BY MIN(created_at)""")


COMMENT_ROWS_SELECT_ATTACHMENTS = text("""SELECT id,filename,mime_type AS "mimeType",size,created_at AS "createdAt",entity_id AS "entityId"
        FROM attachments WHERE workspace_id=:workspace AND entity_type='comment' AND entity_id=ANY(CAST(:ids AS text[])) ORDER BY created_at,id""")


COMMENT_PAGE_SELECT_COMMENTS = text(
    "SELECT 1 FROM comments WHERE id=:id AND issue_id=:issue AND deleted_at IS NULL"
)


COMMENT_ROWS_SELECT_COMMENTS = text("""SELECT c.*,u.name AS author_name,u.avatar_url AS author_avatar_url,
        (SELECT count(*)::int FROM comments child WHERE child.parent_comment_id=c.id AND child.deleted_at IS NULL) AS reply_count,
        (SELECT COALESCE(a.data->'agent','{}'::jsonb) FROM activities a WHERE a.issue_id=c.issue_id AND a.type='comment.created' AND a.data->>'commentId'=c.id AND a.data->>'source'='AI' LIMIT 1) AS agent
        FROM comments c JOIN users u ON u.id=c.author_id JOIN issues i ON i.id=c.issue_id
        WHERE c.id=ANY(CAST(:ids AS text[])) AND i.workspace_id=:workspace AND c.deleted_at IS NULL""")


def comment_page_select_comments_sql(where) -> TextClause:
    return text(
        f"SELECT c.id,c.created_at FROM comments c WHERE {' AND '.join(where)} ORDER BY c.created_at DESC,c.id DESC LIMIT :limit"
    )


def activity_page_select_activities_sql(clause, after) -> TextClause:
    return text(f"""SELECT a.id,a.type,a.data,a.created_at,u.id AS actor_id,u.name AS actor_name,u.avatar_url AS actor_avatar_url
        FROM activities a LEFT JOIN users u ON u.id=a.actor_id WHERE a.workspace_id=:workspace AND {clause} {after}
        ORDER BY a.created_at DESC,a.id DESC LIMIT :limit""")


COMMENT_PAGE_SELECT_COMMENTS_2 = text("""SELECT id FROM (
            SELECT id,row_number() OVER (PARTITION BY parent_comment_id ORDER BY created_at DESC,id DESC) AS position
            FROM comments WHERE parent_comment_id=ANY(CAST(:parents AS text[])) AND deleted_at IS NULL
        ) bounded WHERE position<=5""")


ACTIVITY_PAGE_SELECT_PROJECTS = text(
    "SELECT team_id FROM projects WHERE id=:id AND workspace_id=:workspace AND archived_at IS NULL"
)


MENTION_OPTIONS_SELECT_TEAM_MEMBERS = text("""SELECT u.id,u.name,u.avatar_url AS "avatarUrl"
        FROM team_members tm JOIN users u ON u.id=tm.user_id JOIN workspace_members wm
        ON wm.user_id=tm.user_id AND wm.workspace_id=:workspace WHERE tm.team_id=:team
        AND wm.status='ACTIVE' AND u.status='ACTIVE' ORDER BY u.name,u.id""")


COMMENT_SELECT_ACTIVITIES = text(
    """SELECT c.*, u.id AS author_id_value, u.name AS author_name, u.avatar_url AS author_avatar_url,
                      (SELECT COALESCE(a.data->'agent','{}'::jsonb) FROM activities a WHERE a.issue_id=c.issue_id AND a.type='comment.created' AND a.data->>'commentId'=c.id AND a.data->>'source'='AI' LIMIT 1) AS agent
               FROM comments c
               JOIN issues i ON i.id = c.issue_id
               JOIN users u ON u.id = c.author_id
               WHERE c.id = :comment_id AND i.workspace_id = :workspace_id
                 AND i.archived_at IS NULL AND c.deleted_at IS NULL LIMIT 1"""
)


COMMENT_SELECT_ATTACHMENTS = text(
    """SELECT id, filename, mime_type, size, created_at, entity_id FROM attachments
               WHERE workspace_id = :workspace_id AND entity_type = 'comment' AND entity_id = :comment_id
               ORDER BY created_at"""
)


REACTION_SUMMARY_SELECT_COMMENT_REACTIONS = text(
    """SELECT emoji, COUNT(*)::int AS count, BOOL_OR(user_id = :user_id) AS reacted
               FROM comment_reactions WHERE comment_id = :comment_id GROUP BY emoji ORDER BY MIN(created_at)"""
)


UPDATE_COMMENT_SELECT_COMMENTS = text('SELECT id FROM comments WHERE id=:id FOR UPDATE')


CREATE_COMMENT_SELECT_COMMENTS = text('SELECT * FROM comments WHERE author_id=:author AND client_request_key=:key')


COMMENT_REVISIONS_SELECT_COMMENT_REVISIONS = text('''SELECT version,content,mention_ids AS "mentionIds",created_at AS "createdAt"
        FROM comment_revisions WHERE comment_id=:id ORDER BY version DESC LIMIT 100''')


LIST_REVISIONS_SELECT_DOCUMENT_REVISIONS = text("""SELECT version,title,actor_id AS "actorId",
        created_at AS "createdAt" FROM document_revisions WHERE document_id=:id
        ORDER BY version DESC LIMIT 100""")


def list_releases_select_document_releases_sql(RELEASE_COLUMNS) -> TextClause:
    return text(f"""SELECT {RELEASE_COLUMNS} FROM document_releases r
            LEFT JOIN users u ON u.id = r.approved_by
            WHERE r.document_id=:id ORDER BY r.release DESC LIMIT 100""")


REVISION_ROW_SELECT_DOCUMENT_REVISIONS = text("""SELECT version,title,content,actor_id FROM
        document_revisions WHERE document_id=:id AND version=:version""")


def release_row_select_document_releases_sql(RELEASE_COLUMNS) -> TextClause:
    return text(f"""SELECT {RELEASE_COLUMNS}, r.content FROM document_releases r
                LEFT JOIN users u ON u.id = r.approved_by
                WHERE r.document_id=:id AND r.release=:release""")


DOCUMENT_TEAM_ACCESS_SELECT_TEAMS = text("""SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id
                WHERE t.id = :team_id AND t.workspace_id = :workspace_id
                  AND t.archived_at IS NULL AND tm.user_id = :user_id""")


def documents_select_document_releases_sql(filters) -> TextClause:
    return text(f"""SELECT d.*, creator.id AS created_by_id, creator.name AS created_by_name,
                        creator.avatar_url AS created_by_avatar_url, updater.id AS updated_by_id,
                        updater.name AS updated_by_name, updater.avatar_url AS updated_by_avatar_url,
                        source_attachment.id AS source_attachment_id,
                        source_attachment.filename AS source_attachment_filename,
                        source_attachment.mime_type AS source_attachment_mime_type,
                        source_attachment.size AS source_attachment_size,
                        (SELECT MAX(r.release) FROM document_releases r WHERE r.document_id = d.id) AS latest_release
                 FROM documents d
                 JOIN users creator ON creator.id = d.created_by
                 JOIN users updater ON updater.id = d.updated_by
                 LEFT JOIN LATERAL (
                    SELECT id, filename, mime_type, size FROM attachments
                    WHERE workspace_id = d.workspace_id AND entity_type = 'document' AND entity_id = d.id
                    ORDER BY created_at ASC LIMIT 1
                 ) source_attachment ON TRUE
                 WHERE {" AND ".join(filters)}
                 ORDER BY d.position ASC, d.created_at ASC, d.id ASC""")


FOLDER_SELECT_DOCUMENT_FOLDERS = text(
    "SELECT * FROM document_folders WHERE id = :id AND workspace_id = :workspace_id"
)


REVIEWERS_SELECT_DOCUMENT_REVIEWERS_2 = text("""SELECT r.reviewer_id,r.decision,r.note,r.decided_at,r.assigned_at,u.name,u.avatar_url
            FROM document_reviewers r JOIN users u ON u.id=r.reviewer_id
            WHERE r.document_id=:id ORDER BY r.assigned_at,r.reviewer_id""")


LOCKED_SELECT_DOCUMENTS = text("""SELECT * FROM documents WHERE id=:id AND workspace_id=:workspace
            AND archived_at IS NULL FOR UPDATE""")


REVIEW_STATE_SELECT_DOCUMENTS = text("SELECT * FROM documents WHERE id=:id AND workspace_id=:workspace AND archived_at IS NULL")


REVIEW_STATE_SELECT_USERS = text("SELECT id,name,avatar_url FROM users WHERE id=ANY(CAST(:ids AS text[]))")


def approver_ids_select_workspace_members_sql(lead_filter, team_filter) -> TextClause:
    return text(f"""SELECT wm.user_id FROM workspace_members wm JOIN users u ON u.id=wm.user_id
                WHERE wm.workspace_id=:workspace AND wm.status='ACTIVE' AND u.status='ACTIVE'
                AND (wm.role IN ('OWNER','ADMIN') {lead_filter}) {team_filter}
                ORDER BY wm.created_at,wm.user_id""")


def review_state_select_users_sql(row, ACTIVE_MEMBER) -> TextClause:
    return text(f"""SELECT u.id,u.name,u.avatar_url FROM users u
                WHERE {"EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=:team AND tm.user_id=u.id) AND" if row["team_id"] else ""}
                {ACTIVE_MEMBER.format(user='u.id')} ORDER BY u.name,u.id LIMIT 500""")


def set_reviewers_select_team_members_sql(ACTIVE_MEMBER) -> TextClause:
    return text(f"""SELECT tm.user_id FROM team_members tm WHERE tm.team_id=:team
                    AND tm.user_id=ANY(CAST(:ids AS text[])) AND {ACTIVE_MEMBER.format(user='tm.user_id')}""")


def set_reviewers_select_users_sql(ACTIVE_MEMBER) -> TextClause:
    return text(f"""SELECT u.id FROM users u WHERE u.id=ANY(CAST(:ids AS text[]))
                    AND {ACTIVE_MEMBER.format(user='u.id')}""")


DEFAULT_FOLDER_SELECT_DOCUMENT_FOLDERS = text(
    """SELECT * FROM document_folders WHERE workspace_id = :workspace AND team_id = :team
           AND project_id IS NULL
           ORDER BY (parent_id IS NOT NULL), position ASC, created_at ASC, id ASC LIMIT 1"""
)


ENSURE_UNIQUE_NAME_SELECT_DOCUMENT_FOLDERS = text(
    """SELECT 1 FROM document_folders WHERE team_id = :team
                   AND parent_id IS NOT DISTINCT FROM :parent AND lower(name) = lower(:name)
                   AND id <> COALESCE(:exclude, '') LIMIT 1"""
)


ENSURE_UNIQUE_NUMBER_SELECT_DOCUMENT_FOLDERS = text(
    """SELECT 1 FROM document_folders WHERE parent_id = :parent AND number = :number
                   AND id <> COALESCE(:exclude, '') LIMIT 1"""
)


NEXT_NUMBER_SELECT_DOCUMENT_FOLDERS = text(
    """SELECT COALESCE(MAX(number) FILTER (WHERE number < :last), 0) + 1
                   FROM document_folders WHERE parent_id = :parent"""
)


CREATE_FOLDER_SELECT_DOCUMENT_FOLDERS = text(
    """SELECT COALESCE(MAX(position), -1) + 1 FROM document_folders
                   WHERE team_id = :team AND parent_id IS NOT DISTINCT FROM :parent"""
)


DELETE_FOLDER_SELECT_DOCUMENT_FOLDERS = text(
    """SELECT EXISTS(SELECT 1 FROM document_folders WHERE parent_id = :id)
           OR EXISTS(SELECT 1 FROM documents WHERE folder_id = :id AND archived_at IS NULL)
           OR EXISTS(SELECT 1 FROM attachments WHERE workspace_id = :workspace
                     AND entity_type = 'document-folder' AND entity_id = :id)"""
)


SCAFFOLD_PROJECT_TREE_SELECT_PROJECTS = text("SELECT name FROM projects WHERE id = :id")


SUBTREE_HEIGHT_SELECT_DOCUMENT_FOLDERS = text(
    """WITH RECURSIVE below(id, depth) AS (
                       SELECT id, 1 FROM document_folders WHERE id = :id
                       UNION ALL
                       SELECT f.id, below.depth + 1 FROM document_folders f
                       JOIN below ON f.parent_id = below.id WHERE below.depth <= :limit)
                   SELECT MAX(depth) FROM below"""
)


PROJECT_DOCUMENT_TEAM_SELECT_PROJECTS = text(
    "SELECT team_id FROM projects WHERE id = :id AND workspace_id = :workspace AND archived_at IS NULL"
)


FOLDER_ROW_SELECT_DOCUMENT_FOLDERS = text("SELECT * FROM document_folders WHERE id = :id AND workspace_id = :workspace")


ANCESTORS_SELECT_DOCUMENT_FOLDERS = text(
    """WITH RECURSIVE chain(id, parent_id, depth) AS (
                       SELECT id, parent_id, 1 FROM document_folders WHERE id = :id
                       UNION ALL
                       SELECT f.id, f.parent_id, chain.depth + 1 FROM document_folders f
                       JOIN chain ON f.id = chain.parent_id WHERE chain.depth <= :limit)
                   SELECT id FROM chain ORDER BY depth"""
)


MUTATE_FOLDER_FILE_SELECT_ATTACHMENTS = text(
    """SELECT * FROM attachments WHERE id = :id AND workspace_id = :workspace
           AND entity_type = 'document-folder' FOR UPDATE"""
)


SCAFFOLD_PROJECT_TREE_SELECT_DOCUMENT_FOLDERS = text(
    """SELECT * FROM document_folders WHERE project_id = :project AND parent_id IS NULL
                   AND kind = 'project' ORDER BY created_at LIMIT 1"""
)


PUBLICATIONS_BY_DOCUMENT_SELECT_DOCUMENT_PUBLICATIONS = text(
    """SELECT document_id, version, release, web_url, path, published_at, last_error FROM document_publications
                   WHERE document_id = ANY(CAST(:ids AS text[]))"""
)


PROJECT_TREE_SELECT_DOCUMENT_FOLDERS = text(
    """SELECT * FROM document_folders WHERE workspace_id = :workspace AND project_id = :project
                   ORDER BY position, name, id"""
)


PROJECT_TREE_SELECT_ATTACHMENTS = text(
    """SELECT id, entity_id, filename, mime_type, size, created_at FROM attachments
                   WHERE workspace_id = :workspace AND entity_type = 'document-folder'
                     AND entity_id = ANY(CAST(:folders AS text[]))
                   ORDER BY filename, id"""
)


PROJECT_TREE_SELECT_WORKSPACE_MEMBERS = text(
    "SELECT role FROM workspace_members WHERE workspace_id = :workspace AND user_id = :user AND status = 'ACTIVE'"
)


DOCUMENT_ISSUES_SELECT_DOCUMENT_LINKS = text(
    """SELECT issue_id FROM document_links
                   WHERE workspace_id = :workspace AND document_id = :document AND issue_id IS NOT NULL
                   ORDER BY created_at, id"""
)


SCAFFOLD_PROJECT_TREE_SELECT_DOCUMENT_FOLDERS_2 = text(
    """SELECT bool_or(lower(name) = lower(:name)) AS named, bool_or(number = :number) AS numbered
                       FROM document_folders WHERE parent_id = :parent"""
)


PROJECT_TREE_SELECT_DOCUMENT_LINKS = text(
    """SELECT dl.document_id FROM document_links dl LEFT JOIN issues i ON i.id = dl.issue_id
                       WHERE dl.workspace_id = :workspace AND COALESCE(dl.project_id, i.project_id) = :project"""
)


ISSUE_DOCUMENTS_SELECT_DOCUMENT_LINKS = text("SELECT document_id FROM document_links WHERE workspace_id = :workspace AND issue_id = :issue")


CREATE_DOCUMENT_SELECT_DOCUMENTS = text(
    "SELECT COALESCE(MAX(position), -1) + 1 FROM documents WHERE folder_id = :folder_id"
)


UPDATE_DOCUMENT_SELECT_DOCUMENTS = text(
    "SELECT * FROM documents WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL FOR UPDATE"
)


ARCHIVE_DOCUMENT_SELECT_DOCUMENTS = text(
    "SELECT team_id, version FROM documents WHERE id=:id AND workspace_id=:workspace AND archived_at IS NULL FOR UPDATE"
)


UPDATE_DOCUMENT_SELECT_DOCUMENTS_2 = text(
    "SELECT team_id FROM documents WHERE id = :id AND workspace_id = :workspace AND archived_at IS NULL"
)


ROW_SELECT_DOCUMENTS = text("SELECT * FROM documents WHERE id = :id")


LIST_FOLDERS_SELECT_DOCUMENT_FOLDERS = text('''SELECT * FROM document_folders WHERE workspace_id = :workspace_id AND team_id = :team_id
                AND project_id IS NULL
                ORDER BY position ASC, name ASC, id ASC''')


VALIDATE_PARENT_SELECT_ISSUES = text("""WITH RECURSIVE ancestors(id, parent_issue_id) AS (
                    SELECT id, parent_issue_id FROM issues WHERE id = :parent
                    UNION
                    SELECT i.id, i.parent_issue_id FROM issues i JOIN ancestors a ON i.id = a.parent_issue_id
                ) SELECT 1 FROM ancestors WHERE id = :issue""")


ISSUE_ANCESTORS_SELECT_ISSUES = text("""WITH RECURSIVE chain(id, identifier, title, parent_issue_id, depth) AS (
                    SELECT p.id, p.identifier, p.title, p.parent_issue_id, 1
                    FROM issues c JOIN issues p ON p.id = c.parent_issue_id
                    WHERE c.id = :issue AND p.workspace_id = :workspace AND p.archived_at IS NULL
                    UNION ALL
                    SELECT p.id, p.identifier, p.title, p.parent_issue_id, chain.depth + 1
                    FROM chain JOIN issues p ON p.id = chain.parent_issue_id
                    WHERE p.workspace_id = :workspace AND p.archived_at IS NULL AND chain.depth < 50
                ) SELECT id, identifier, title FROM chain ORDER BY depth DESC""")


VALIDATE_PARENT_SELECT_ISSUES_2 = text("""SELECT id, identifier FROM issues WHERE id = :id AND workspace_id = :workspace
                    AND team_id IS NOT DISTINCT FROM :team AND archived_at IS NULL""")


def issue_insights_select_sql(expressions, sql) -> TextClause:
    return text('SELECT '+','.join(expressions)+',COUNT(*) AS count '+sql+' GROUP BY 1,2,3,4,5,6,7,8 ORDER BY 1,5 LIMIT 1001')


ISSUE_ROWS_SELECT_ISSUE_SUBSCRIPTIONS = text("""SELECT i.*, t.id AS team_id_value, t.name AS team_name,
                      t.identifier AS team_identifier, s.id AS status_id_value,
                      s.name AS status_name, s.category AS status_category, s.color AS status_color,
                      p.id AS project_id_value, p.name AS project_name, p.identifier AS project_identifier,
                      c.id AS creator_id_value, c.name AS creator_name, c.avatar_url AS creator_avatar_url,
                      r.id AS reporter_id_value, r.name AS reporter_name, r.avatar_url AS reporter_avatar_url,
                      parent.identifier AS parent_identifier, parent.title AS parent_title,
                      sub.total AS sub_issue_count, sub.completed AS completed_sub_issue_count,
                      a.id AS assignee_id_value, a.name AS assignee_name, a.avatar_url AS assignee_avatar_url, a.last_seen_at AS assignee_last_seen_at,
                      EXISTS(SELECT 1 FROM issue_subscriptions sub WHERE sub.issue_id = i.id AND sub.user_id = :user_id) AS is_subscribed,
                      EXISTS(SELECT 1 FROM issue_favorites favorite WHERE favorite.issue_id = i.id AND favorite.user_id = :user_id) AS is_favorite,
                      (SELECT remind_at FROM issue_reminders reminder
                       WHERE reminder.issue_id = i.id AND reminder.user_id = :user_id AND reminder.delivered_at IS NULL
                       ORDER BY reminder.updated_at DESC LIMIT 1) AS reminder_at
               FROM issues i
               LEFT JOIN teams t ON t.id = i.team_id
               JOIN issue_statuses s ON s.id = i.status_id
               LEFT JOIN projects p ON p.id = i.project_id
               JOIN users c ON c.id = i.creator_id
               JOIN users r ON r.id = COALESCE(i.reporter_id, i.creator_id)
               LEFT JOIN users a ON a.id = i.assignee_id
               LEFT JOIN issues parent ON parent.id = i.parent_issue_id AND parent.archived_at IS NULL
               LEFT JOIN LATERAL (
                   SELECT count(*) AS total, count(*) FILTER (WHERE cs.category::text = 'COMPLETED') AS completed
                   FROM issues child JOIN issue_statuses cs ON cs.id = child.status_id
                   WHERE child.parent_issue_id = i.id AND child.archived_at IS NULL
                     AND child.team_id IS NOT DISTINCT FROM i.team_id
               ) sub ON true
               WHERE i.id = ANY(CAST(:issue_ids AS text[])) AND i.workspace_id = :workspace_id AND i.archived_at IS NULL
               AND t.archived_at IS NULL
               AND (i.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=i.team_id AND tm.user_id=:user_id))
               AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=i.workspace_id AND wm.user_id=:user_id AND wm.status='ACTIVE')
""")


TEMPLATE_ROW_SELECT_ISSUE_TEMPLATES = text(
    """SELECT template.*, creator.id AS creator_id, creator.name AS creator_name,
                      creator.avatar_url AS creator_avatar_url
               FROM issue_templates template
               JOIN users creator ON creator.id = template.created_by
               WHERE template.id = :template_id AND template.workspace_id = :workspace_id
               LIMIT 1"""
)


STATUS_NAME_SELECT_ISSUE_STATUSES = text("SELECT name FROM issue_statuses WHERE id = :id")


PERSON_NAME_SELECT_USERS = text("SELECT name FROM users WHERE id = :id")


PROJECT_NAME_SELECT_PROJECTS = text("SELECT name FROM projects WHERE id = :id")


ISSUE_ROWS_SELECT_ISSUE_LABELS = text(
    """SELECT il.issue_id,l.id,l.name,l.color FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=ANY(CAST(:ids AS text[])) ORDER BY l.name"""
)


ISSUE_ROWS_SELECT_ISSUE_CYCLES = text(
    "SELECT issue_id,cycle_id,created_at FROM issue_cycles WHERE issue_id=ANY(CAST(:ids AS text[])) ORDER BY created_at,cycle_id"
)


ISSUE_ROWS_SELECT_ISSUE_RELEASES = text(
    "SELECT issue_id,release_id,created_at FROM issue_releases WHERE issue_id=ANY(CAST(:ids AS text[])) ORDER BY created_at,release_id"
)


ADD_ISSUE_RELATION_SELECT_ISSUE_RELATIONS = text(
    """SELECT issue_id, related_issue_id, type FROM issue_relations
               WHERE workspace_id = :workspace_id
                 AND ((issue_id = :issue_id AND related_issue_id = :related_issue_id)
                   OR (issue_id = :related_issue_id AND related_issue_id = :issue_id))
               LIMIT 1"""
)


VALIDATE_RELEASE_IDS_SELECT_RELEASES = text(
    """SELECT id FROM releases WHERE workspace_id = :workspace_id
               AND archived_at IS NULL AND id = ANY(:release_ids)"""
)


ENSURE_DEFAULT_ISSUE_STATUSES_SELECT_ISSUE_STATUSES = text(
    """SELECT id FROM issue_statuses
                   WHERE workspace_id = :workspace_id AND team_id IS NULL
                     AND lower(name) = lower(:name)
                   ORDER BY created_at ASC LIMIT 1"""
)


VALIDATE_REFERENCES_SELECT_ISSUE_STATUSES = text(
    """SELECT id, category FROM issue_statuses
                   WHERE id = :status_id AND workspace_id = :workspace_id
                     AND (team_id IS NULL OR team_id = :team_id) LIMIT 1"""
)


VALIDATE_REFERENCES_SELECT_PROJECTS = text(
    """SELECT 1 FROM projects WHERE id = :project_id AND workspace_id = :workspace_id
                   AND archived_at IS NULL AND (team_id IS NULL OR team_id = :team_id) FOR SHARE"""
)


VALIDATE_REFERENCES_SELECT_WORKSPACE_MEMBERS = text(
    """SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id
                   AND user_id = :user_id AND status = 'ACTIVE' LIMIT 1"""
)


VALIDATE_REFERENCES_SELECT_WORKSPACE_MEMBERS_2 = text(
    """SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id
                   AND user_id = :user_id AND status = 'ACTIVE' LIMIT 1"""
)


VALIDATE_TEMPLATE_REFERENCES_SELECT_ISSUE_STATUSES = text(
    "SELECT 1 FROM issue_statuses WHERE id = :id AND workspace_id = :workspace_id"
)


VALIDATE_TEMPLATE_REFERENCES_SELECT_PROJECTS = text(
    "SELECT 1 FROM projects WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL"
)


VALIDATE_TEMPLATE_REFERENCES_SELECT_WORKSPACE_MEMBERS = text(
    "SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :id AND status = 'ACTIVE'"
)


ENSURE_DEFAULT_ISSUE_STATUSES_SELECT_ISSUE_STATUSES_2 = text(
    'SELECT 1 FROM issue_statuses WHERE workspace_id=:workspace AND team_id IS NULL LIMIT 1'
)


VALIDATE_REFERENCES_SELECT_ISSUE_STATUSES_2 = text(
    """SELECT id, category FROM issue_statuses
                   WHERE workspace_id = :workspace_id AND category = :default_category
                     AND (team_id IS NULL OR team_id = :team_id)
                   ORDER BY position ASC LIMIT 1"""
)


VALIDATE_REFERENCES_SELECT_LABELS = text(
    "SELECT id FROM labels WHERE workspace_id = :workspace_id AND id = ANY(:label_ids)"
)


VALIDATE_TEMPLATE_REFERENCES_SELECT_LABELS = text(
    "SELECT id FROM labels WHERE workspace_id = :workspace_id AND id = ANY(:ids)"
)


ENFORCE_START_GATE_SELECT_ISSUE_STATUSES = text(
    '''SELECT id, name, category, required_before_start FROM issue_statuses
           WHERE workspace_id=:workspace AND (team_id IS NULL OR team_id=:team)
             AND (required_before_start OR id=:previous)
           ORDER BY position, name'''
)


def search_page_select_sql(sql) -> TextClause:
    return text("SELECT COUNT(*) " + sql)


def search_page_select_sql_2(sql) -> TextClause:
    return text(
        "SELECT COUNT(*) "
        + sql
        + " AND i.id=:cursor_id AND i.manual_order=:cursor_rank"
    )


def search_page_select_sql_3(sql, cursor_clause, manual) -> TextClause:
    return text(
        "SELECT i.id,i.created_at,i.manual_order "
        + sql
        + cursor_clause
        + (
            " ORDER BY i.manual_order,i.id LIMIT :limit"
            if manual
            else " ORDER BY i.created_at DESC,i.id DESC LIMIT :limit"
        )
    )


def sorted_page_select_sql(ranked) -> TextClause:
    return text("SELECT ordinal FROM (" + ranked + ") ranked WHERE id=:anchor_id")


def sorted_page_select_sql_2(ranked) -> TextClause:
    return text(
        "SELECT * FROM ("
        + ranked
        + ") ranked WHERE ordinal>:after ORDER BY ordinal LIMIT :limit"
    )


UPDATE_ISSUE_SELECT_ISSUES = text(
    "SELECT id FROM issues WHERE id=:id AND workspace_id=:workspace FOR UPDATE"
)


CREATE_ISSUE_SELECT_ISSUES = text("""SELECT 1 FROM issues WHERE id = :issue_id AND workspace_id = :workspace_id
                    AND team_id IS NOT DISTINCT FROM :team_id AND archived_at IS NULL""")


UPDATE_ISSUE_SELECT_ISSUES_2 = text("SELECT identifier FROM issues WHERE id = :id")


ISSUE_OPTIONS_SELECT_RELEASES = text(
    '''SELECT id, name, version, status, target_date FROM releases
               WHERE workspace_id = :workspace_id AND archived_at IS NULL
               ORDER BY target_date DESC NULLS LAST, created_at DESC'''
)


LIST_ISSUE_TEMPLATES_SELECT_ISSUE_TEMPLATES = text(
    '''SELECT template.*, creator.id AS creator_id, creator.name AS creator_name,
                      creator.avatar_url AS creator_avatar_url
               FROM issue_templates template
               JOIN users creator ON creator.id = template.created_by
               WHERE template.workspace_id = :workspace_id
               ORDER BY template.name'''
)


DESCENDANT_IDS_SELECT_ISSUES = text(
    '''WITH RECURSIVE tree AS (
                   SELECT child.id, 1 AS depth FROM issues child
                   WHERE child.workspace_id = :workspace_id AND child.team_id IS NOT DISTINCT FROM :team_id
                     AND child.parent_issue_id = :issue_id AND child.archived_at IS NULL
                   UNION ALL
                   SELECT child.id, tree.depth + 1 FROM issues child JOIN tree ON child.parent_issue_id = tree.id
                   WHERE child.workspace_id = :workspace_id AND child.team_id IS NOT DISTINCT FROM :team_id
                     AND child.archived_at IS NULL AND tree.depth < :max_depth
               )
               SELECT id FROM tree GROUP BY id ORDER BY min(depth)'''
)


LIST_SUB_ISSUES_SELECT_ISSUES = text(
    '''SELECT child.id, child.identifier, child.title, child.parent_issue_id, child.due_date, child.manual_order,
                      child.start_date, child.target_date, child.created_at, child.version,
                      child.priority::text AS priority,
                      status.id AS status_id, status.name AS status_name,
                      status.color AS status_color, status.category AS status_category,
                      assignee.id AS assignee_id, assignee.name AS assignee_name,
                      assignee.avatar_url AS assignee_avatar_url
               FROM issues child
               JOIN issue_statuses status ON status.id = child.status_id
               LEFT JOIN users assignee ON assignee.id = child.assignee_id
               WHERE child.id = ANY(CAST(:ids AS text[]))
               ORDER BY child.manual_order, child.id'''
)


LIST_ISSUE_RELATIONS_SELECT_ISSUE_RELATIONS = text(
    '''SELECT relation.issue_id, relation.related_issue_id, relation.type
               FROM issue_relations relation
               JOIN issues other ON other.id = CASE
                   WHEN relation.issue_id = :issue_id THEN relation.related_issue_id
                   ELSE relation.issue_id
               END
               WHERE relation.workspace_id = :workspace_id
                 AND (relation.issue_id = :issue_id OR relation.related_issue_id = :issue_id)
                 AND other.archived_at IS NULL
               ORDER BY relation.created_at DESC'''
)


MOVE_ISSUE_SELECT_ISSUE_STATUSES = text(
    '''SELECT id FROM issue_statuses
               WHERE workspace_id = :workspace_id AND category = :category
                 AND (team_id = :team_id OR team_id IS NULL)
               ORDER BY CASE WHEN team_id = :team_id THEN 0 ELSE 1 END, position ASC
               LIMIT 1'''
)


CLASSIFY_ISSUE_SELECT_ISSUE_STATUSES = text(
    '''SELECT id FROM issue_statuses
               WHERE workspace_id = :workspace_id AND category = 'CANCELED'
                 AND (team_id = :team_id OR team_id IS NULL)
               ORDER BY CASE WHEN team_id = :team_id THEN 0 ELSE 1 END, position ASC
               LIMIT 1'''
)


CONVERT_ISSUE_TO_COMMENT_SELECT_ISSUES = text('''SELECT id FROM issues WHERE workspace_id = :workspace_id AND identifier = :identifier
                AND archived_at IS NULL LIMIT 1''')


CONVERT_ISSUE_TO_COMMENT_SELECT_USERS = text('SELECT id, name, avatar_url FROM users WHERE id = :user_id')


ISSUE_REACTIONS_SELECT_ISSUE_REACTIONS = text('''SELECT emoji, COUNT(*)::int AS count, BOOL_OR(user_id = :user_id) AS reacted
                FROM issue_reactions WHERE issue_id = :issue_id GROUP BY emoji ORDER BY MIN(created_at)''')


def issue_options_select_issue_statuses_sql(team_filter) -> TextClause:
    return text(f'''SELECT id, name, category, color, position FROM issue_statuses WHERE workspace_id = :workspace_id {team_filter}
            AND (team_id IS NULL OR EXISTS (SELECT 1 FROM teams scope_t JOIN team_members scope_tm ON scope_tm.team_id=scope_t.id
            WHERE scope_t.id=issue_statuses.team_id AND scope_t.workspace_id=:workspace_id AND scope_t.archived_at IS NULL AND scope_tm.user_id=:user_id)) ORDER BY position, name''')


def issue_options_select_projects_sql(project_read_scope, noTeam, teamId) -> TextClause:
    return text(f'''SELECT p.id,p.name,p.identifier,p.status,p.priority,p.health,p.start_date,p.target_date,p.lead_id,p.team_id
            FROM projects p WHERE {project_read_scope(workspace='workspace_id', user='user_id')} {"AND p.team_id IS NULL" if noTeam else ("AND (p.team_id IS NULL OR p.team_id=:team_id)" if teamId else "")} ORDER BY p.name''')


ISSUE_OPTIONS_SELECT_WORKSPACE_MEMBERS = text('''SELECT u.id, u.name, u.email, u.avatar_url, u.last_seen_at FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = :workspace_id AND wm.status = 'ACTIVE' ORDER BY u.name''')


ISSUE_OPTIONS_SELECT_LABELS = text('SELECT id, name, color FROM labels WHERE workspace_id = :workspace_id ORDER BY name')


def issue_options_select_cycles_sql(teamId) -> TextClause:
    return text('''SELECT id, team_id, name, status, start_date, end_date FROM cycles WHERE workspace_id = :workspace_id
            AND EXISTS (SELECT 1 FROM teams scope_t JOIN team_members scope_tm ON scope_tm.team_id=scope_t.id
            WHERE scope_t.id=cycles.team_id AND scope_t.workspace_id=:workspace_id AND scope_t.archived_at IS NULL AND scope_tm.user_id=:user_id) ''' + ('AND team_id = :team_id ' if teamId else '') + 'ORDER BY start_date DESC NULLS LAST, created_at DESC')


MOVE_ISSUE_SELECT_PROJECTS = text('SELECT team_id FROM projects WHERE id = :project_id')


CLASSIFY_ISSUE_SELECT_ISSUES = text(
    '''SELECT id FROM issues WHERE workspace_id = :workspace_id
                   AND identifier = :identifier AND archived_at IS NULL LIMIT 1'''
)


LOOKUP_ISSUE_SELECT_ISSUES = text('SELECT id FROM issues WHERE workspace_id=:workspace AND (id=:reference OR identifier=:reference) AND archived_at IS NULL LIMIT 1')


LIST_SUB_ISSUES_SELECT_ISSUES_2 = text(
    '''SELECT id FROM issues
                   WHERE workspace_id = :workspace_id AND team_id IS NOT DISTINCT FROM :team_id
                     AND parent_issue_id = :parent_issue_id AND archived_at IS NULL'''
)


MANAGED_DUE_SELECT = text("SELECT current_setting('flowie.sla_managed_due',true)")


def reorder_select_sql(table, parent) -> TextClause:
    return text(
        f"SELECT id FROM {table} WHERE workspace_id=:workspace AND archived_at IS NULL{parent} ORDER BY manual_order,id"
    )


PULSE_SELECT_ACTIVITIES = text('''SELECT a.*,u.name actor_name,u.avatar_url actor_avatar,i.id issue_id,i.identifier issue_identifier,i.title issue_title,p.id project_id,p.name project_name
    FROM activities a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN issues i ON i.id=a.issue_id LEFT JOIN projects p ON p.id=a.project_id
    WHERE a.workspace_id=:workspace_id AND (i.id IS NULL OR (i.archived_at IS NULL AND (i.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=i.team_id AND tm.user_id=:user_id))))
    AND (p.id IS NULL OR (p.archived_at IS NULL AND (p.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=p.team_id AND tm.user_id=:user_id)))) ORDER BY a.created_at DESC LIMIT :limit''')


PULSE_SELECT_PROJECT_UPDATES = text('''SELECT pu.*,u.name actor_name,u.avatar_url actor_avatar,p.id project_id,p.name project_name FROM project_updates pu JOIN users u ON u.id=pu.author_id JOIN projects p ON p.id=pu.project_id
    WHERE pu.workspace_id=:workspace_id AND p.archived_at IS NULL AND (p.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=p.team_id AND tm.user_id=:user_id)) ORDER BY pu.created_at DESC LIMIT :limit''')


MUTATE_STATUS_SELECT_ISSUES = text('''SELECT
            EXISTS(SELECT 1 FROM issues WHERE status_id=:id) OR
            EXISTS(SELECT 1 FROM issue_templates WHERE status_id=:id)''')


MUTATE_STATUS_SELECT_ISSUE_STATUSES = text('''SELECT id FROM issue_statuses WHERE workspace_id=:workspace
            AND team_id IS NOT DISTINCT FROM :team AND lower(name)=lower(:name) AND id<>:id''')


STATUSES_SELECT_ISSUES = text('''SELECT s.*,
        (SELECT COUNT(*) FROM issues i WHERE i.status_id=s.id) AS issue_count
        FROM issue_statuses s WHERE s.workspace_id=:workspace AND
        (s.team_id IS NULL OR EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id
        WHERE t.id=s.team_id AND t.archived_at IS NULL AND tm.user_id=:user))
        ORDER BY s.position,s.name,s.id''')


MUTATE_STATUS_SELECT_ISSUE_STATUSES_2 = text('SELECT COUNT(*) FROM issue_statuses WHERE workspace_id=:workspace AND team_id IS NULL AND category=:category')


MUTATE_STATUS_SELECT_ISSUE_STATUSES_3 = text('SELECT * FROM issue_statuses WHERE id=:id AND workspace_id=:workspace FOR UPDATE')


def reorder_select_issues_sql(scope) -> TextClause:
    return text(
        "SELECT i.id,i.manual_order,i.parent_issue_id "
        + scope
        + " AND i.id=ANY(CAST(:ids AS text[])) FOR UPDATE OF i"
    )


def reorder_select_projects_sql(project_clause) -> TextClause:
    return text(
        "SELECT p.id,p.manual_order,NULL::text AS parent_issue_id FROM projects p WHERE "
        + project_clause
        + " AND p.id=ANY(CAST(:ids AS text[])) FOR UPDATE OF p"
    )
