"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

BULK_PREVIEW_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


BULK_PREVIEW_INSERT_BULK_OPERATIONS = text("""INSERT INTO bulk_operations(id,workspace_id,actor_id,request_key,fingerprint,changes,created_at,expires_at)
        VALUES (:id,:workspace,:user,:key,:fingerprint,CAST(:changes AS jsonb),:now,:expires)""")


BULK_PREVIEW_INSERT_BULK_OPERATION_ITEMS = text("""INSERT INTO bulk_operation_items(operation_id,issue_id,expected_version,identifier)
        VALUES (:operation,:id,:version,:identifier)""")


BULK_COMMAND_UPDATE_BULK_OPERATIONS = text("UPDATE bulk_operations SET state=:state WHERE id=:id")


PROCESS_BULK_ITEM_UPDATE_BULK_OPERATION_ITEMS = text(
    "UPDATE bulk_operation_items SET state=:state,error_code=:error WHERE operation_id=:operation AND issue_id=:issue"
)


PROCESS_BULK_ITEM_UPDATE_BULK_OPERATIONS = text("""UPDATE bulk_operations SET state=CASE WHEN EXISTS(
            SELECT 1 FROM bulk_operation_items WHERE operation_id=:id AND state='PENDING') THEN 'RUNNING' ELSE 'DONE' END WHERE id=:id""")


PROCESS_BULK_ITEM_UPDATE_BULK_OPERATIONS_2 = text("UPDATE bulk_operations SET state='FAILED' WHERE id=:id")


PROCESS_BULK_ITEM_UPDATE_BULK_OPERATIONS_3 = text("UPDATE bulk_operations SET state='DONE' WHERE id=:id")


PROCESS_BULK_ITEM_INSERT_ACTIVITIES = text("""INSERT INTO activities(id,workspace_id,issue_id,actor_id,type,data,created_at)
                    VALUES (:id,:workspace,:issue,:user,'issue.bulk_changed',CAST(:data AS jsonb),:now)""")


PROCESS_BULK_ITEM_DELETE_ISSUE_CYCLES = text("DELETE FROM issue_cycles WHERE issue_id=:id")


PROCESS_BULK_ITEM_INSERT_ISSUE_CYCLES = text(
    "INSERT INTO issue_cycles(issue_id,cycle_id) VALUES (:id,:cycle)"
)


PROCESS_BULK_ITEM_UPDATE_ISSUES = text("UPDATE issues SET updated_at=:now WHERE id=:id")


CREATE_COMMENT_INSERT_COMMENTS = text(
    """INSERT INTO comments (id, issue_id, author_id, client_request_key, parent_comment_id, mention_ids, content, body, created_at, updated_at)
               VALUES (:id, :issue_id, :author_id, :request_key, :parent, CAST(:mentions AS jsonb), :content, CAST(:body AS jsonb), :now, :now)"""
)


UPDATE_COMMENT_UPDATE_COMMENTS = text(
    "UPDATE comments SET content = :content, body = CAST(:body AS jsonb), mention_ids = CAST(:mentions AS jsonb), updated_at = :now WHERE id = :comment_id"
)


CREATE_COMMENT_LOCK = text('SELECT pg_advisory_xact_lock(hashtextextended(:key,0))')


REMOVE_COMMENT_UPDATE_COMMENTS = text('UPDATE comments SET deleted_at = :now, updated_at = :now WHERE id = :comment_id')


TOGGLE_COMMENT_REACTION_DELETE_COMMENT_REACTIONS = text('DELETE FROM comment_reactions WHERE comment_id = :comment_id AND user_id = :user_id AND emoji = :emoji RETURNING emoji')


TOGGLE_COMMENT_REACTION_INSERT_COMMENT_REACTIONS = text('INSERT INTO comment_reactions (comment_id, user_id, emoji) VALUES (:comment_id, :user_id, :emoji)')


SET_REVIEWERS_DELETE_DOCUMENT_REVIEWERS = text("DELETE FROM document_reviewers WHERE document_id=:id AND NOT reviewer_id=ANY(CAST(:ids AS text[]))")


SET_REVIEWERS_INSERT_DOCUMENT_REVIEWERS = text("""INSERT INTO document_reviewers (document_id,reviewer_id,assigned_by,assigned_at)
            VALUES (:id,:reviewer,:by,:now)""")


DECIDE_UPDATE_DOCUMENTS = text("UPDATE documents SET status='DRAFT',updated_by=:user,updated_at=:now WHERE id=:id")


DECIDE_UPDATE_DOCUMENT_REVIEWERS = text("""UPDATE document_reviewers SET decision=:decision,note=:note,decided_at=:now
            WHERE document_id=:id AND reviewer_id=:user RETURNING reviewer_id""")


LOCK_TEAM_FOLDERS_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")


DEFAULT_FOLDER_INSERT_DOCUMENT_FOLDERS = text(
    """INSERT INTO document_folders (id, workspace_id, team_id, kind, name, icon, position, created_at, updated_at)
               VALUES (:id, :workspace, :team, 'general', :name, '📁', 0, :now, :now)"""
)


REPUBLISH_BELOW_UPDATE_DOCUMENT_PUBLICATIONS = text(
    """WITH RECURSIVE below(id) AS (
                   SELECT id FROM document_folders WHERE id = :id
                   UNION ALL SELECT f.id FROM document_folders f JOIN below ON f.parent_id = below.id)
               UPDATE document_publications SET release = NULL
               WHERE document_id IN (SELECT d.id FROM documents d WHERE d.folder_id IN (SELECT id FROM below))"""
)


CREATE_FOLDER_INSERT_DOCUMENT_FOLDERS = text(
    """INSERT INTO document_folders
               (id, workspace_id, team_id, parent_id, project_id, kind, name, icon, position, number, created_at, updated_at)
               VALUES (:id, :workspace, :team, :parent, :project, :kind, :name, :icon, :position, :number, :now, :now)"""
)


UPDATE_FOLDER_UPDATE_DOCUMENT_FOLDERS = text(
    """UPDATE document_folders SET name = :name, icon = :icon, position = :position, kind = :kind,
               parent_id = :parent, number = :number, updated_at = :now WHERE id = :id"""
)


DELETE_FOLDER_DELETE_DOCUMENT_FOLDERS = text("DELETE FROM document_folders WHERE id = :id")


MUTATE_FOLDER_FILE_DELETE_ATTACHMENTS = text("DELETE FROM attachments WHERE id = :id")


LINK_ISSUE_DOCUMENT_INSERT_DOCUMENT_LINKS = text(
    """INSERT INTO document_links (id, document_id, workspace_id, issue_id)
               VALUES (:id, :document, :workspace, :issue) ON CONFLICT DO NOTHING"""
)


UPDATE_FOLDER_UPDATE_DOCUMENT_FOLDERS_2 = text(
    """WITH RECURSIVE below(id) AS (
                       SELECT id FROM document_folders WHERE id = :id
                       UNION ALL SELECT f.id FROM document_folders f JOIN below ON f.parent_id = below.id)
                   UPDATE document_folders SET project_id = :project WHERE id IN (SELECT id FROM below)"""
)


MUTATE_FOLDER_FILE_UPDATE_ATTACHMENTS = text("UPDATE attachments SET entity_id = :folder WHERE id = :id")


LINK_ISSUE_DOCUMENT_DELETE_DOCUMENT_LINKS = text(
    "DELETE FROM document_links WHERE workspace_id = :workspace AND document_id = :document AND issue_id = :issue"
)


CREATE_DOCUMENT_INSERT_DOCUMENTS = text("""INSERT INTO documents (id, workspace_id, team_id, folder_id, title, content, icon, source_type, source_url, doc_type, status, pinned, position, created_by, updated_by, created_at, updated_at)
                            VALUES (:id, :workspace_id, :team_id, :folder_id, :title, :content, :icon, :source_type, :source_url, :doc_type, :status, :pinned, :position, :user_id, :user_id, :now, :now)""")


ARCHIVE_DOCUMENT_UPDATE_DOCUMENTS = text(
    "UPDATE documents SET archived_at=:now,updated_at=:now,updated_by=:actor WHERE id=:id"
)


def update_document_update_documents_sql(sets) -> TextClause:
    return text(
        f"UPDATE documents SET {', '.join(sets)}, updated_by = :updated_by, updated_at = :now WHERE id = :id"
    )


UPDATE_DOCUMENT_UPDATE_DOCUMENT_PUBLICATIONS = text("UPDATE document_publications SET release = NULL WHERE document_id = :id")


WRITE_ACTIVITY_INSERT_ACTIVITIES = text(
    """INSERT INTO activities (id, workspace_id, issue_id, actor_id, type, data, created_at)
               VALUES (:id, :workspace_id, :issue_id, :actor_id, :action, CAST(:data AS jsonb), :now)"""
)


VALIDATE_PARENT_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended('issue-hierarchy:' || :workspace, 0))")


ALLOCATE_ISSUE_NUMBER_UPDATE_TEAMS = text("""UPDATE teams SET issue_sequence=issue_sequence+1, updated_at=:now
                WHERE id=:team AND workspace_id=:workspace AND archived_at IS NULL
                RETURNING id, identifier, issue_sequence""")


ALLOCATE_ISSUE_NUMBER_UPDATE_WORKSPACES = text("""UPDATE workspaces SET issue_sequence=issue_sequence+1
                WHERE id=:workspace RETURNING NULL::text AS id,
                NULL::text AS identifier, issue_sequence""")


ADD_ISSUE_RELATION_UPDATE_ISSUE_RELATIONS = text(
    """UPDATE issue_relations
                   SET issue_id = :source_issue_id, related_issue_id = :target_issue_id,
                       type = :relation_type, created_by = :user_id, created_at = :now
                   WHERE issue_id = :previous_issue_id AND related_issue_id = :previous_related_issue_id"""
)


ADD_ISSUE_RELATION_INSERT_ISSUE_RELATIONS = text(
    """INSERT INTO issue_relations
                   (workspace_id, issue_id, related_issue_id, type, created_at, created_by)
                   VALUES (:workspace_id, :issue_id, :related_issue_id, :relation_type, :now, :user_id)"""
)


ENSURE_DEFAULT_ISSUE_STATUSES_INSERT_ISSUE_STATUSES = text(
    """INSERT INTO issue_statuses
                   (id, workspace_id, name, category, color, position, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :category, :color, :position, :now, :now)"""
)


ENSURE_DEFAULT_ISSUE_STATUSES_UPDATE_ISSUE_STATUSES = text(
    """UPDATE issue_statuses
                       SET name = :name, category = :category, color = :color,
                           position = :position, updated_at = :now
                       WHERE id = :id"""
)


CREATE_ISSUE_INSERT_ISSUES = text(
    """INSERT INTO issues (id, workspace_id, team_id, status_id, project_id, parent_issue_id,
               identifier, number, issue_type, severity, environment, reproduction_steps, expected_result, actual_result, title, description, priority, estimated_effort, actual_effort, start_date, target_date, due_date, creator_id,
               reporter_id, assignee_id, completed_at, canceled_at, created_at, updated_at,sla_opt_out)
               VALUES (:id, :workspace_id, :team_id, :status_id, :project_id, :parent_issue_id,
               :identifier, :number, :issueType, :severity, :environment, :reproductionSteps, :expectedResult, :actualResult, :title, :description, :priority, :estimated_effort, :actual_effort, :start_date, :target_date, :due_date, :creator_id,
               :reporter_id, :assignee_id, :completed_at, :canceled_at, :now, :now,:sla_opt_out)"""
)


CREATE_ISSUE_INSERT_ISSUE_LABELS = text(
    "INSERT INTO issue_labels (issue_id, label_id) VALUES (:issue_id, :label_id)"
)


CREATE_ISSUE_INSERT_ISSUE_SUBSCRIPTIONS = text(
    "INSERT INTO issue_subscriptions (issue_id, user_id) VALUES (:issue_id, :user_id) ON CONFLICT DO NOTHING"
)


def update_issue_update_issues_sql(sets) -> TextClause:
    return text(
        f"UPDATE issues SET {', '.join([*sets, 'updated_at = :now'])} WHERE id = :issue_id"
    )


UPDATE_ISSUE_DELETE_ISSUE_LABELS = text("DELETE FROM issue_labels WHERE issue_id = :issue_id")


UPDATE_ISSUE_DELETE_ISSUE_RELEASES = text("DELETE FROM issue_releases WHERE issue_id = :issue_id")


UPDATE_ISSUE_INSERT_ISSUE_SUBSCRIPTIONS = text(
    "INSERT INTO issue_subscriptions (issue_id, user_id) VALUES (:issue_id, :user_id) ON CONFLICT DO NOTHING"
)


UPDATE_ISSUE_INSERT_ISSUE_LABELS = text(
    "INSERT INTO issue_labels (issue_id, label_id) VALUES (:issue_id, :label_id)"
)


UPDATE_ISSUE_INSERT_ISSUE_RELEASES = text(
    "INSERT INTO issue_releases (issue_id, release_id) VALUES (:issue_id, :release_id)"
)


CREATE_ISSUE_TEMPLATE_INSERT_ISSUE_TEMPLATES = text(
    '''INSERT INTO issue_templates
               (id, workspace_id, name, description, title, issue_description, status_id,
                priority, project_id, assignee_id, label_ids, created_by, created_at, updated_at)
               VALUES (:id, :workspace_id, :name, :description, :title, :issue_description, :status_id,
                :priority, :project_id, :assignee_id, :label_ids, :created_by, :now, :now)'''
)


DELETE_ISSUE_TEMPLATE_DELETE_ISSUE_TEMPLATES = text('DELETE FROM issue_templates WHERE id = :template_id AND workspace_id = :workspace_id RETURNING id')


REMOVE_ISSUE_RELATION_DELETE_ISSUE_RELATIONS = text(
    '''DELETE FROM issue_relations
               WHERE workspace_id = :workspace_id
                 AND ((issue_id = :issue_id AND related_issue_id = :related_issue_id)
                   OR (issue_id = :related_issue_id AND related_issue_id = :issue_id))
               RETURNING issue_id, related_issue_id, type'''
)


MOVE_ISSUE_DELETE_ISSUE_CYCLES = text('DELETE FROM issue_cycles WHERE issue_id = :issue_id')


MOVE_ISSUE_UPDATE_ISSUES = text('UPDATE issues SET parent_issue_id = NULL, updated_at = :now WHERE parent_issue_id = :issue_id')


MOVE_ISSUE_UPDATE_ISSUES_2 = text(
    '''UPDATE issues
               SET team_id = :team_id, status_id = :status_id, identifier = :identifier,
                   number = :number, parent_issue_id = NULL,
                   project_id = CASE WHEN :clear_project THEN NULL ELSE project_id END,
                   updated_at = :now
               WHERE id = :issue_id AND workspace_id = :workspace_id'''
)


CLASSIFY_ISSUE_UPDATE_ISSUES = text(
    '''UPDATE issues SET resolution = :resolution, duplicate_of_id = :duplicate_of_id,
               status_id = :status_id, completed_at = NULL, canceled_at = :now, updated_at = :now
               WHERE id = :issue_id AND workspace_id = :workspace_id'''
)


CONVERT_ISSUE_TO_COMMENT_INSERT_COMMENTS = text('''INSERT INTO comments (id, issue_id, author_id, content, body, created_at, updated_at)
                VALUES (:id, :issue_id, :author_id, :content, CAST(:body AS jsonb), :now, :now)''')


CONVERT_ISSUE_TO_COMMENT_UPDATE_ISSUES = text('UPDATE issues SET archived_at = :now, updated_at = :now WHERE id = :issue_id')


SET_ISSUE_REMINDER_INSERT_ISSUE_REMINDERS = text(
    '''INSERT INTO issue_reminders (id, issue_id, user_id, remind_at, delivered_at, created_at, updated_at)
               VALUES (:id, :issue_id, :user_id, :remind_at, NULL, :now, :now)
               ON CONFLICT (issue_id, user_id) DO UPDATE
               SET remind_at = EXCLUDED.remind_at, delivered_at = NULL, updated_at = EXCLUDED.updated_at
               RETURNING id, issue_id, user_id, remind_at, delivered_at, created_at, updated_at'''
)


CANCEL_ISSUE_REMINDER_DELETE_ISSUE_REMINDERS = text('DELETE FROM issue_reminders WHERE issue_id = :issue_id AND user_id = :user_id')


ARCHIVE_ISSUE_UPDATE_ISSUES = text('UPDATE issues SET archived_at = :now, updated_at = :now WHERE id = ANY(CAST(:ids AS text[])) AND workspace_id = :workspace_id AND archived_at IS NULL')


SUBSCRIBE_ISSUE_INSERT_ISSUE_SUBSCRIPTIONS = text('''INSERT INTO issue_subscriptions (issue_id, user_id) VALUES (:issue_id, :user_id)
                ON CONFLICT DO NOTHING''')


UNSUBSCRIBE_ISSUE_DELETE_ISSUE_SUBSCRIPTIONS = text('DELETE FROM issue_subscriptions WHERE issue_id = :issue_id AND user_id = :user_id')


FAVORITE_ISSUE_INSERT_ISSUE_FAVORITES = text('''INSERT INTO issue_favorites (issue_id, user_id) VALUES (:issue_id, :user_id)
                ON CONFLICT DO NOTHING''')


UNFAVORITE_ISSUE_DELETE_ISSUE_FAVORITES = text('DELETE FROM issue_favorites WHERE issue_id = :issue_id AND user_id = :user_id')


TOGGLE_ISSUE_REACTION_DELETE_ISSUE_REACTIONS = text('''DELETE FROM issue_reactions WHERE issue_id = :issue_id AND user_id = :user_id
                AND emoji = :emoji RETURNING emoji''')


ADD_ISSUE_REACTION_INSERT_ISSUE_REACTIONS = text(
    '''INSERT INTO issue_reactions (issue_id, user_id, emoji)
               VALUES (:issue_id, :user_id, :emoji) ON CONFLICT DO NOTHING'''
)


REMOVE_ISSUE_REACTION_DELETE_ISSUE_REACTIONS = text(
    '''DELETE FROM issue_reactions WHERE issue_id = :issue_id
               AND user_id = :user_id AND emoji = :emoji'''
)


def update_issue_template_update_issue_templates_sql(sets) -> TextClause:
    return text(f"UPDATE issue_templates SET {', '.join(sets)}, updated_at = :now WHERE id = :template_id AND workspace_id = :workspace_id")


TOGGLE_ISSUE_REACTION_INSERT_ISSUE_REACTIONS = text('''INSERT INTO issue_reactions (issue_id, user_id, emoji)
                    VALUES (:issue_id, :user_id, :emoji)''')


ACTOR_CONTEXT_LOCK = text(
    "SELECT set_config('flowie.actor_id',:actor,true),set_config('flowie.audit_source',:source,true)"
)


MANAGED_DUE_LOCK = text("SELECT set_config('flowie.sla_managed_due','true',true)")


MANAGED_DUE_UPDATE_ISSUES = text("UPDATE issues SET due_date=:due WHERE id=:id")


MANAGED_DUE_LOCK_2 = text("SELECT set_config('flowie.sla_managed_due',:previous,true)")


REORDER_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


def reorder_update_unnest_sql(table) -> TextClause:
    return text(f"""UPDATE {table} item SET manual_order=sequence.position*1024
        FROM unnest(CAST(:ids AS text[])) WITH ORDINALITY AS sequence(id,position)
        WHERE item.id=sequence.id AND item.workspace_id=:workspace""")


def reorder_update_sql(table) -> TextClause:
    return text(
        f"UPDATE {table} SET updated_at=:now WHERE id=:id AND workspace_id=:workspace"
    )


MUTATE_STATUS_LOCK = text('SELECT pg_advisory_xact_lock(hashtextextended(:scope,0))')


MUTATE_STATUS_INSERT_AUDIT_LOGS = text('''INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:audit,:workspace,:user,:action,'issue-status',:id,CAST(:metadata AS jsonb),:now)''')


MUTATE_STATUS_DELETE_ISSUE_STATUSES = text('DELETE FROM issue_statuses WHERE id=:id')


MUTATE_STATUS_UPDATE_ISSUE_STATUSES = text('''UPDATE issue_statuses SET name=:name,category=:category,color=:color,
                position=:position,required_before_start=:requiredBeforeStart,updated_at=:now WHERE id=:id''')


MUTATE_STATUS_INSERT_ISSUE_STATUSES = text('''INSERT INTO issue_statuses(id,workspace_id,name,category,color,position,required_before_start,created_at,updated_at)
                VALUES (:id,:workspace,:name,:category,:color,:position,:requiredBeforeStart,:now,:now)''')
