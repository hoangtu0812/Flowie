"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def team_row_select_teams_sql(condition) -> TextClause:
    return text(f'SELECT * FROM teams WHERE id = :team_id AND workspace_id = :workspace_id {condition} LIMIT 1')


MEMBERS_SELECT_TEAM_MEMBERS = text('''SELECT tm.team_id, tm.user_id, tm.role, tm.created_at, u.id, u.name, u.email, u.avatar_url, u.title FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = :team_id ORDER BY tm.created_at ASC''')


COUNTS_SELECT_ISSUES = text('''SELECT (SELECT COUNT(*) FROM issues WHERE team_id = :team_id) AS issues, (SELECT COUNT(*) FROM projects WHERE team_id = :team_id) AS projects, (SELECT COUNT(*) FROM cycles WHERE team_id = :team_id) AS cycles, (SELECT COUNT(*) FROM documents WHERE team_id = :team_id) AS documents''')


LIST_TEAMS_SELECT_TEAMS = text('SELECT * FROM teams WHERE workspace_id = :workspace_id AND archived_at IS NULL ORDER BY name ASC')


LIST_DELETED_SELECT_TEAMS = text('SELECT id, name, identifier, icon, deleted_at FROM teams WHERE workspace_id = :workspace_id AND deleted_at >= :since ORDER BY deleted_at DESC')


GET_TEAM_SELECT_TEAM_MEMBERS = text('SELECT 1 FROM team_members WHERE team_id = :team_id AND user_id = :user_id')


ADD_MEMBER_SELECT_WORKSPACE_MEMBERS = text("SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'")


UPDATE_TEAM_SELECT_ISSUE_TEMPLATES = text('SELECT 1 FROM issue_templates WHERE id = :id AND workspace_id = :workspace_id')


UPDATE_TEAM_SELECT_TEAMS = text('SELECT id, parent_team_id FROM teams WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL')


MEMBER_ACCESS_SELECT_WORKSPACE_MEMBERS = text(
    """SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"""
)


MANAGER_ACCESS_SELECT_WORKSPACE_MEMBERS = text("""SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id
                 AND status = 'ACTIVE' AND role IN ('OWNER', 'ADMIN')""")


REQUIRE_TEAM_SELECT_TEAMS = text(
    """SELECT id, workspace_id, name FROM teams
               WHERE id = :team_id AND workspace_id = :workspace_id AND archived_at IS NULL"""
)


GET_SETTINGS_SELECT_TEAM_DISPATCHER_SETTINGS = text("SELECT * FROM team_dispatcher_settings WHERE team_id = :team_id")


USED_BUDGET_SELECT_AUDIT_LOGS = text("""SELECT COUNT(*)::int AS used FROM audit_logs
               WHERE action = :action AND created_at >= :cutoff
                 AND metadata->>'teamId' = :team_id""")


OVERDUE_ASSIGNED_SELECT_ISSUES = text(
    """SELECT i.id, i.identifier, i.title, i.due_date, i.assignee_id, u.name AS assignee_name
               FROM issues i
               JOIN issue_statuses st ON st.id = i.status_id
               LEFT JOIN users u ON u.id = i.assignee_id
               WHERE i.team_id = :team_id AND i.archived_at IS NULL
                 AND i.assignee_id IS NOT NULL
                 AND i.due_date::date < :today
                 AND st.category NOT IN ('COMPLETED', 'CANCELED')
               ORDER BY i.due_date ASC LIMIT :limit"""
)


ALREADY_NUDGED_SELECT_NOTIFICATIONS = text(
    """SELECT entity_id FROM notifications
               WHERE type = :type AND created_at >= :cutoff AND entity_id = ANY(:issue_ids)"""
)


POST_DISCORD_REPORT_SELECT_DISCORD_WEBHOOKS = text("""SELECT webhook_url FROM discord_webhooks
               WHERE workspace_id = :workspace_id AND enabled = TRUE LIMIT 1""")


APP_LINKS_SELECT_WORKSPACES = text("SELECT id FROM workspaces WHERE id = :workspace_id")


MEMBER_ACCESS_SELECT_WORKSPACE_MEMBERS_2 = text(
    """SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE' """
)


MANAGER_ACCESS_SELECT_WORKSPACE_MEMBERS_2 = text("""SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id
                 AND status = 'ACTIVE' AND role IN ('OWNER', 'ADMIN')""")


REQUIRE_TEAM_SELECT_TEAMS_2 = text(
    """SELECT 1 FROM teams
               WHERE id = :team_id AND workspace_id = :workspace_id AND archived_at IS NULL"""
)


TEAM_MEMBERS_SELECT_TEAM_MEMBERS = text("""SELECT tm.user_id, tm.role, u.name, u.avatar_url
               FROM team_members tm JOIN users u ON u.id = tm.user_id
               WHERE tm.team_id = :team_id ORDER BY u.name ASC""")


OPEN_TEAM_ISSUES_SELECT_ISSUES = text("""SELECT i.id, i.identifier, i.title, i.priority, i.estimated_effort,
                      i.assignee_id, i.due_date, i.created_at
               FROM issues i JOIN issue_statuses st ON st.id = i.status_id
               WHERE i.team_id = :team_id AND i.archived_at IS NULL
                 AND st.category IN ('TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED')""")


VELOCITIES_SELECT_ISSUES = text("""SELECT i.assignee_id, COALESCE(SUM(i.actual_effort), 0) AS done
               FROM issues i JOIN issue_statuses st ON st.id = i.status_id
               WHERE i.team_id = :team_id AND i.assignee_id IS NOT NULL
                 AND st.category = 'COMPLETED' AND i.completed_at >= :since
               GROUP BY i.assignee_id""")


MEMBER_TOP_LABELS_SELECT_ISSUES = text(
    """SELECT i.assignee_id, l.id AS label_id, l.name AS label_name, COUNT(*) AS completions
               FROM issues i
               JOIN issue_statuses st ON st.id = i.status_id
               JOIN issue_labels il ON il.issue_id = i.id
               JOIN labels l ON l.id = il.label_id
               WHERE i.team_id = :team_id AND i.assignee_id IS NOT NULL
                 AND st.category = 'COMPLETED' AND i.completed_at >= :since
               GROUP BY i.assignee_id, l.id, l.name
               ORDER BY completions DESC"""
)


ISSUE_LABELS_SELECT_ISSUE_LABELS = text("""SELECT il.issue_id, l.id AS label_id, l.name AS label_name
               FROM issue_labels il JOIN labels l ON l.id = il.label_id
               WHERE il.issue_id = ANY(:issue_ids)""")


WORKSPACE_OPEN_ISSUES_SELECT_ISSUES = text(
    """SELECT i.id, i.identifier, i.title, i.priority, i.estimated_effort, i.due_date,
                      i.project_id, p.name AS project_name, i.assignee_id, u.name AS assignee_name
               FROM issues i
               JOIN issue_statuses st ON st.id = i.status_id
               LEFT JOIN projects p ON p.id = i.project_id AND p.archived_at IS NULL
               LEFT JOIN users u ON u.id = i.assignee_id
               WHERE i.workspace_id = :workspace_id AND i.archived_at IS NULL
                 AND st.category IN ('TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED')"""
)


RECENT_COMPLETIONS_SELECT_ISSUES = text(
    """SELECT COALESCE(i.project_id, 'no-project') AS project_id, COUNT(*) AS done
               FROM issues i JOIN issue_statuses st ON st.id = i.status_id
               WHERE i.workspace_id = :workspace_id AND st.category = 'COMPLETED'
                 AND i.completed_at >= :since
               GROUP BY COALESCE(i.project_id, 'no-project')"""
)


SEND_DIGEST_FOR_WORKSPACE_SELECT_DISCORD_WEBHOOKS = text(
    """SELECT webhook_url FROM discord_webhooks
               WHERE workspace_id = :workspace_id AND enabled = TRUE AND daily_digest_enabled = TRUE LIMIT 1"""
)
