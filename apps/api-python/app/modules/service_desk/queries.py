"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

ROLE_SELECT_WORKSPACE_MEMBERS = text("SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'")


ACCEPTS_TICKETS_SELECT_PROJECTS = text('''SELECT 1 FROM projects project JOIN teams team ON team.id = project.team_id
                                      WHERE project.id = :project_id AND project.workspace_id = :workspace_id AND project.team_id = :team_id
                                      AND project.service_desk_enabled AND project.archived_at IS NULL AND team.archived_at IS NULL''')


ASK_SELECT_ASK_MESSAGES = text('''SELECT ask.*, team.id AS team_id_value, team.name AS team_name, team.identifier AS team_identifier, team.icon AS team_icon,
                                      project.id AS project_id_value, project.name AS project_name, project.identifier AS project_identifier,
                                      creator.id AS creator_id, creator.name AS creator_name, creator.avatar_url AS creator_avatar_url,
                                      issue.id AS issue_id_value, issue.identifier AS issue_identifier, issue.title AS issue_title, COALESCE(issue.completed_at, issue.canceled_at) AS issue_closed_at, issue_status.category AS issue_category, assignee.name AS assignee_name, assignee.avatar_url AS assignee_avatar_url,
                                      (SELECT message.author_id FROM ask_messages message WHERE message.ask_id = ask.id ORDER BY message.created_at DESC, message.id DESC LIMIT 1) AS last_message_author
                               FROM asks ask JOIN teams team ON team.id = ask.team_id JOIN users creator ON creator.id = ask.created_by
                               LEFT JOIN projects project ON project.id = ask.project_id LEFT JOIN issues issue ON issue.id = ask.converted_issue_id LEFT JOIN issue_statuses issue_status ON issue_status.id = issue.status_id LEFT JOIN users assignee ON assignee.id = ask.assignee_id
                               WHERE ask.id = :ask_id AND ask.workspace_id = :workspace_id AND ask.archived_at IS NULL''')


IS_HANDLER_SELECT_TEAM_MEMBERS = text('SELECT 1 FROM team_members WHERE team_id = :team_id AND user_id = :user_id')


LIST_SERVICE_DESK_PROJECTS_SELECT_PROJECTS = text('''SELECT project.id, project.name, project.team_id FROM projects project JOIN teams team ON team.id = project.team_id
                                      WHERE project.workspace_id = :workspace_id AND project.service_desk_enabled
                                      AND project.archived_at IS NULL AND team.archived_at IS NULL ORDER BY project.name''')


LIST_ASKS_SELECT_ASKS = text('''SELECT ask.id FROM asks ask JOIN team_members member ON member.team_id = ask.team_id
                                      WHERE ask.workspace_id = :workspace_id AND ask.archived_at IS NULL AND member.user_id = :user_id ORDER BY ask.updated_at DESC''')


TICKET_FOR_ISSUE_SELECT_ASKS = text('SELECT id FROM asks WHERE converted_issue_id = :issue_id AND workspace_id = :workspace_id AND archived_at IS NULL')


def list_ask_messages_select_ask_messages_sql(MESSAGE_COLUMNS) -> TextClause:
    return text(f'''SELECT {MESSAGE_COLUMNS} FROM ask_messages message JOIN users author ON author.id = message.author_id
                                       WHERE message.ask_id = :ask_id ORDER BY message.created_at, message.id''')


def create_ask_message_select_ask_messages_sql(MESSAGE_COLUMNS) -> TextClause:
    return text(f'SELECT {MESSAGE_COLUMNS} FROM ask_messages message JOIN users author ON author.id = message.author_id WHERE message.id = :id')


RECORD_TICKET_FILE_SELECT_AUDIT_LOGS = text('''SELECT 1 FROM audit_logs WHERE entity_type = 'ask' AND entity_id = :ask_id AND actor_id = :user_id
                                      AND action IN ('ask.created', 'ask.file_added') AND created_at > :since LIMIT 1''')


REFERENCES_SELECT_PROJECTS = text('''SELECT 1 FROM projects WHERE id = :project_id AND workspace_id = :workspace_id
                                          AND archived_at IS NULL AND (team_id IS NULL OR team_id = :team_id)''')


LIST_ASKS_SELECT_ASKS_2 = text('''SELECT id FROM asks WHERE workspace_id = :workspace_id AND archived_at IS NULL AND created_by = :user_id ORDER BY updated_at DESC''')


def knowledge_applications_select_sql(SCOPE) -> TextClause:
    return text(f'SELECT DISTINCT s.project_id, s.project_name FROM ({SCOPE}) s ORDER BY s.project_name, s.project_id')


def knowledge_sources_select_teams_sql(SCOPE) -> TextClause:
    return text(f"""
            SELECT m.document_id, m.release, m.title, m.content, m.project_id, m.project_name,
                   ts_rank_cd(m.vector, m.query) AS rank,
                   (m.team_id IS NULL OR EXISTS (
                       SELECT 1 FROM teams dt JOIN team_members tm ON tm.team_id = dt.id
                       WHERE dt.id = m.team_id AND dt.archived_at IS NULL AND tm.user_id = :user
                   )) AS can_open
            FROM (
                SELECT s.*, to_tsvector('simple', translate(lower(s.title || ' ' || s.content), :accents, :normalized)) AS vector,
                       to_tsquery('simple', :query) AS query
                FROM ({SCOPE}) s
            ) m
            WHERE m.vector @@ m.query
            ORDER BY rank DESC, m.document_id
            LIMIT :limit
        """)


ASSISTANT_STATUS_SELECT_WORKSPACE_AGENT_PROVIDERS = text('SELECT EXISTS (SELECT 1 FROM workspace_agent_providers WHERE workspace_id = :workspace AND enabled)')


ROLE_SELECT_WORKSPACE_MEMBERS_2 = text('SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = \'ACTIVE\'')


REQUEST_SELECT_CUSTOMER_REQUESTS = text('''SELECT request.*, creator.id AS creator_id, creator.name AS creator_name, creator.avatar_url AS creator_avatar_url,
                                      project.id AS project_id_value, project.name AS project_name, project.identifier AS project_identifier,
                                      issue.id AS issue_id_value, issue.identifier AS issue_identifier, issue.title AS issue_title
                               FROM customer_requests request
                               JOIN users creator ON creator.id = request.created_by
                               LEFT JOIN projects project ON project.id = request.project_id
                               LEFT JOIN issues issue ON issue.id = request.issue_id
                               WHERE request.id = :request_id AND request.workspace_id = :workspace_id AND request.archived_at IS NULL''')


LIST_CUSTOMER_REQUESTS_SELECT_CUSTOMER_REQUESTS = text('SELECT id FROM customer_requests WHERE workspace_id = :workspace_id AND archived_at IS NULL ORDER BY updated_at DESC')


REFERENCES_SELECT_PROJECTS_2 = text('SELECT 1 FROM projects WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL')


REFERENCES_SELECT_ISSUES = text('SELECT 1 FROM issues WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL')
