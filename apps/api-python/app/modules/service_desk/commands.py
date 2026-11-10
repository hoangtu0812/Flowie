"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

AUDIT_INSERT_AUDIT_LOGS = text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
                             VALUES (:id, :workspace_id, :actor_id, :action, 'ask', :entity_id, CAST(:metadata AS jsonb), :now)''')


ADD_MESSAGE_INSERT_ASK_MESSAGES = text('INSERT INTO ask_messages (id, ask_id, author_id, content, created_at) VALUES (:id, :ask_id, :author_id, :content, :now)')


CREATE_ASK_INSERT_ASKS = text('''INSERT INTO asks (id, number, workspace_id, team_id, project_id, title, description, priority, status, notified_ticket_status, created_by, created_at, updated_at)
                             VALUES (:id, :number, :workspace_id, :team_id, :project_id, :title, :description, :priority, 'open', 'received', :created_by, :now, :now)''')


TRANSITION_ASK_UPDATE_ASKS = text('''UPDATE asks SET status = :status, notified_ticket_status = :label, updated_at = :now,
                                       reopened_at = CASE WHEN :reopen THEN CAST(:now AS timestamp) ELSE reopened_at END
                                       WHERE id = :ask_id AND status = :current''')


CONVERT_ASK_UPDATE_ASKS = text("UPDATE asks SET status = 'accepted', converted_issue_id = :issue_id, updated_at = :now WHERE id = :ask_id")


CREATE_ASK_MESSAGE_UPDATE_ASKS = text('UPDATE asks SET updated_at = :now WHERE id = :ask_id')


RECORD_TICKET_FILE_UPDATE_ASKS = text('UPDATE asks SET updated_at = :now WHERE id = :ask_id')


ARCHIVE_ASK_UPDATE_ASKS = text('UPDATE asks SET archived_at = :now, updated_at = :now WHERE id = :ask_id')


def update_ask_update_asks_sql(sets) -> TextClause:
    return text(f"UPDATE asks SET {', '.join(sets)}, updated_at = :now WHERE id = :ask_id")


CREATE_ASK_UPDATE_WORKSPACES = text('UPDATE workspaces SET ticket_sequence = ticket_sequence + 1 WHERE id = :id RETURNING ticket_sequence')


AUDIT_INSERT_AUDIT_LOGS_2 = text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
                             VALUES (:id, :workspace_id, :actor_id, :action, 'customer-request', :entity_id, CAST(:metadata AS jsonb), :now)''')


CREATE_CUSTOMER_REQUEST_INSERT_CUSTOMER_REQUESTS = text('''INSERT INTO customer_requests (id, workspace_id, title, description, customer, source, status, priority, project_id, issue_id, created_by, created_at, updated_at)
                             VALUES (:id, :workspace_id, :title, :description, :customer, :source, :status, :priority, :project_id, :issue_id, :created_by, :now, :now)''')


ARCHIVE_CUSTOMER_REQUEST_UPDATE_CUSTOMER_REQUESTS = text('UPDATE customer_requests SET archived_at = :now, updated_at = :now WHERE id = :request_id')


def update_customer_request_update_customer_requests_sql(sets) -> TextClause:
    return text(f"UPDATE customer_requests SET {', '.join(sets)}, updated_at = :now WHERE id = :request_id")
