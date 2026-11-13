"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

CONFIGURED_PROVIDER_SELECT_WORKSPACE_AGENT_PROVIDERS = text('''SELECT provider, endpoint, model, api_key_encrypted
                FROM workspace_agent_providers
                WHERE workspace_id = :workspace_id AND enabled = true
                ORDER BY updated_at DESC LIMIT 1''')


WORKSPACE_CATALOG_SELECT_TEAMS = text('''SELECT id, name, identifier FROM teams
                WHERE workspace_id = :workspace_id AND deleted_at IS NULL AND archived_at IS NULL
                ORDER BY name''')


WORKSPACE_CATALOG_SELECT_PROJECTS = text('''SELECT id, name, identifier, team_id FROM projects
                WHERE workspace_id = :workspace_id AND archived_at IS NULL ORDER BY name''')


OVERDUE_ISSUE_INSIGHT_SELECT_ISSUES = text('''SELECT COUNT(*)::int AS total,
                       COUNT(DISTINCT issue.team_id)::int AS team_count,
                       COALESCE(MAX(:today - issue.due_date::date), 0)::int AS longest_days
                FROM issues issue
                JOIN issue_statuses status ON status.id = issue.status_id
                WHERE issue.workspace_id = :workspace_id
                  AND issue.archived_at IS NULL
                  AND issue.due_date::date < :today
                  AND status.category NOT IN ('COMPLETED', 'CANCELED')
                  AND EXISTS(
                      SELECT 1 FROM team_members member
                      WHERE member.team_id = issue.team_id AND member.user_id = :user_id
                  )''')


OVERDUE_ISSUE_INSIGHT_SELECT_ISSUES_2 = text('''SELECT team.name, COUNT(*)::int AS total
                FROM issues issue
                JOIN teams team ON team.id = issue.team_id
                JOIN issue_statuses status ON status.id = issue.status_id
                WHERE issue.workspace_id = :workspace_id
                  AND issue.archived_at IS NULL
                  AND issue.due_date::date < :today
                  AND status.category NOT IN ('COMPLETED', 'CANCELED')
                  AND EXISTS(
                      SELECT 1 FROM team_members member
                      WHERE member.team_id = issue.team_id AND member.user_id = :user_id
                  )
                GROUP BY team.id, team.name
                ORDER BY total DESC, team.name ASC
                LIMIT 5''')


# Open issues per visible team that are overdue, due today or due within the window ending :window_end.
# :team_ids NULL means every visible team; otherwise only those teams.
# VI: Issue chưa xong theo từng team được xem: quá hạn, đến hạn hôm nay, hoặc đến hạn trước :window_end.
# VI: :team_ids NULL nghĩa là mọi team được xem; nếu có thì chỉ các team đó.
DEADLINE_INSIGHT_SELECT_TEAMS = text('''SELECT team.name,
                       COUNT(*) FILTER (WHERE issue.due_date::date < :today)::int AS overdue,
                       COUNT(*) FILTER (WHERE issue.due_date::date = :today)::int AS due_today,
                       COUNT(*) FILTER (WHERE issue.due_date::date > :today)::int AS due_soon
                FROM issues issue
                JOIN teams team ON team.id = issue.team_id
                JOIN issue_statuses status ON status.id = issue.status_id
                WHERE issue.workspace_id = :workspace_id
                  AND issue.archived_at IS NULL
                  AND issue.due_date::date <= :window_end
                  AND status.category NOT IN ('COMPLETED', 'CANCELED')
                  AND (CAST(:team_ids AS text[]) IS NULL OR issue.team_id = ANY(CAST(:team_ids AS text[])))
                  AND EXISTS(
                      SELECT 1 FROM team_members member
                      WHERE member.team_id = issue.team_id AND member.user_id = :user_id
                  )
                GROUP BY team.id, team.name
                ORDER BY due_today DESC, due_soon DESC, team.name ASC''')


# Teams the user belongs to, so a question can be narrowed to the ones it names.
# VI: Các team người dùng là thành viên, để câu hỏi được thu hẹp vào team nó nêu tên.
DEADLINE_INSIGHT_SELECT_MEMBER_TEAMS = text('''SELECT team.id, team.name, team.identifier FROM teams team
                WHERE team.workspace_id = :workspace_id AND team.archived_at IS NULL
                  AND EXISTS (SELECT 1 FROM team_members member
                              WHERE member.team_id = team.id AND member.user_id = :user_id)
                ORDER BY team.name ASC''')


# Open visible issues due from today up to :window_end, soonest first, for the answer and analyst facts.
# VI: Issue chưa xong được xem, đến hạn từ hôm nay đến :window_end, gần nhất trước, cho câu trả lời và dữ liệu hỏi đáp.
DEADLINE_INSIGHT_SELECT_ISSUES = text('''SELECT issue.identifier, issue.title, team.name AS team, project.identifier AS project,
                       assignee.name AS assignee, status.name AS status, issue.priority,
                       issue.due_date::date AS due_date
                FROM issues issue
                JOIN teams team ON team.id = issue.team_id
                JOIN issue_statuses status ON status.id = issue.status_id
                LEFT JOIN projects project ON project.id = issue.project_id
                LEFT JOIN users assignee ON assignee.id = issue.assignee_id
                WHERE issue.workspace_id = :workspace_id
                  AND issue.archived_at IS NULL
                  AND issue.due_date::date BETWEEN :today AND :window_end
                  AND status.category NOT IN ('COMPLETED', 'CANCELED')
                  AND (CAST(:team_ids AS text[]) IS NULL OR issue.team_id = ANY(CAST(:team_ids AS text[])))
                  AND EXISTS (SELECT 1 FROM team_members member
                              WHERE member.team_id = issue.team_id AND member.user_id = :user_id)
                ORDER BY issue.due_date ASC, issue.identifier ASC
                LIMIT 30''')


ISSUE_COUNT_INSIGHT_SELECT_ISSUES = text('''SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status.category = 'COMPLETED')::int AS completed,
                    COUNT(*) FILTER (WHERE status.category NOT IN ('COMPLETED', 'CANCELED'))::int AS open
            FROM issues issue JOIN issue_statuses status ON status.id = issue.status_id
            WHERE issue.workspace_id = :workspace_id AND issue.archived_at IS NULL
              AND EXISTS (SELECT 1 FROM team_members member WHERE member.team_id = issue.team_id AND member.user_id = :user_id)''')


WORKLOAD_INSIGHT_SELECT_TEAMS = text('''SELECT team.id, team.name FROM teams team
                WHERE team.workspace_id = :workspace_id AND team.archived_at IS NULL
                  AND EXISTS (SELECT 1 FROM team_members member
                              WHERE member.team_id = team.id AND member.user_id = :user_id)
                ORDER BY team.name ASC LIMIT 20''')


WORKLOAD_INSIGHT_SELECT_ISSUES = text('''SELECT issue.team_id, COUNT(*)::int AS total
                FROM issues issue JOIN issue_statuses status ON status.id = issue.status_id
                WHERE issue.workspace_id = :workspace_id AND issue.archived_at IS NULL
                  AND issue.assignee_id IS NULL
                  AND status.category NOT IN ('COMPLETED', 'CANCELED')
                GROUP BY issue.team_id''')


ISSUE_STATUS_INSIGHT_SELECT_ISSUES = text('''SELECT status.name, status.category, COUNT(*)::int AS total
            FROM issues issue JOIN issue_statuses status ON status.id = issue.status_id
            WHERE issue.workspace_id = :workspace_id AND issue.archived_at IS NULL
              AND EXISTS (SELECT 1 FROM team_members member WHERE member.team_id = issue.team_id AND member.user_id = :user_id)
            GROUP BY status.id, status.name, status.category ORDER BY total DESC, status.name''')


ISSUE_ASSIGNEE_INSIGHT_SELECT_ISSUES = text('''SELECT COALESCE(assignee.name, 'Chưa phân công') AS name, COUNT(*)::int AS total
            FROM issues issue LEFT JOIN users assignee ON assignee.id = issue.assignee_id
            WHERE issue.workspace_id = :workspace_id AND issue.archived_at IS NULL
              AND EXISTS (SELECT 1 FROM team_members member WHERE member.team_id = issue.team_id AND member.user_id = :user_id)
            GROUP BY assignee.id, assignee.name ORDER BY total DESC, name LIMIT 10''')


PROJECT_PROGRESS_INSIGHT_SELECT_PROJECTS = text('''SELECT project.name, project.identifier, COUNT(issue.id)::int AS total,
                    COUNT(issue.id) FILTER (WHERE status.category = 'COMPLETED')::int AS completed
            FROM projects project LEFT JOIN issues issue ON issue.project_id = project.id AND issue.archived_at IS NULL
            LEFT JOIN issue_statuses status ON status.id = issue.status_id
            WHERE project.workspace_id = :workspace_id AND project.archived_at IS NULL
              AND (project.team_id IS NULL OR EXISTS (SELECT 1 FROM team_members member WHERE member.team_id = project.team_id AND member.user_id = :user_id))
            GROUP BY project.id, project.name, project.identifier ORDER BY project.name LIMIT 50''')


PROJECT_DELIVERY_INSIGHT_SELECT_PROJECTS = text('''SELECT project.name, project.identifier, project.health, project.target_date::date AS target_date,
                       COUNT(issue.id)::int AS total,
                       COUNT(issue.id) FILTER (WHERE status.category = 'COMPLETED')::int AS completed,
                       COUNT(issue.id) FILTER (
                           WHERE status.category NOT IN ('COMPLETED', 'CANCELED')
                             AND issue.due_date::date < :today
                       )::int AS overdue_issues
                FROM projects project
                LEFT JOIN issues issue ON issue.project_id = project.id AND issue.archived_at IS NULL
                LEFT JOIN issue_statuses status ON status.id = issue.status_id
                WHERE project.workspace_id = :workspace_id
                  AND project.archived_at IS NULL
                  AND project.status NOT IN ('done', 'shipped', 'canceled', 'duplicate')
                  AND (
                      project.team_id IS NULL OR EXISTS (
                          SELECT 1 FROM team_members member
                          WHERE member.team_id = project.team_id AND member.user_id = :user_id
                      )
                  )
                GROUP BY project.id, project.name, project.identifier, project.health, project.target_date
                ORDER BY project.target_date NULLS LAST, project.name
                LIMIT 100''')


STALE_ISSUE_INSIGHT_SELECT_ISSUES = text('''SELECT issue.identifier, issue.title, issue.updated_at::date AS updated_date,
                       issue.due_date::date AS due_date, status.name AS status_name,
                       (:today - issue.updated_at::date)::int AS inactive_days
                FROM issues issue
                JOIN issue_statuses status ON status.id = issue.status_id
                WHERE issue.workspace_id = :workspace_id
                  AND issue.archived_at IS NULL
                  AND status.category NOT IN ('COMPLETED', 'CANCELED')
                  AND issue.updated_at::date <= :stale_since
                  AND EXISTS (
                      SELECT 1 FROM team_members member
                      WHERE member.team_id = issue.team_id AND member.user_id = :user_id
                  )
                ORDER BY issue.updated_at ASC, issue.identifier ASC
                LIMIT 20''')


INITIATIVE_DELIVERY_INSIGHT_SELECT_INITIATIVES = text('''SELECT initiative.name, initiative.health, initiative.target_date::date AS target_date,
                       COUNT(DISTINCT project.id)::int AS total_projects,
                       COUNT(DISTINCT project.id) FILTER (
                           WHERE project.status IN ('done', 'shipped')
                       )::int AS completed_projects
                FROM initiatives initiative
                LEFT JOIN initiative_projects link ON link.initiative_id = initiative.id
                LEFT JOIN projects project ON project.id = link.project_id
                    AND project.archived_at IS NULL
                    AND (
                        project.team_id IS NULL OR EXISTS (
                            SELECT 1 FROM team_members member
                            WHERE member.team_id = project.team_id AND member.user_id = :user_id
                        )
                    )
                WHERE initiative.workspace_id = :workspace_id
                  AND initiative.archived_at IS NULL
                  AND initiative.status NOT IN ('completed', 'canceled')
                GROUP BY initiative.id, initiative.name, initiative.health, initiative.target_date
                ORDER BY initiative.target_date NULLS LAST, initiative.name
                LIMIT 100''')


CYCLE_PROGRESS_INSIGHT_SELECT_CYCLES = text('''SELECT cycle.name, cycle.status, COUNT(issue.id)::int AS total,
                    COUNT(issue.id) FILTER (WHERE issue_status.category = 'COMPLETED')::int AS completed
            FROM cycles cycle LEFT JOIN issue_cycles link ON link.cycle_id = cycle.id
            LEFT JOIN issues issue ON issue.id = link.issue_id AND issue.archived_at IS NULL
            LEFT JOIN issue_statuses issue_status ON issue_status.id = issue.status_id
            WHERE cycle.workspace_id = :workspace_id
              AND EXISTS (SELECT 1 FROM team_members member WHERE member.team_id = cycle.team_id AND member.user_id = :user_id)
            GROUP BY cycle.id, cycle.name, cycle.status ORDER BY cycle.status, cycle.name LIMIT 50''')


INSTALLED_TOOL_KEYS_SELECT_WORKSPACE_AGENT_TOOLS = text('SELECT tool_key FROM workspace_agent_tools WHERE workspace_id = :workspace_id')


PERSONAL_SKILLS_SELECT_USER_AGENT_SKILLS = text('''SELECT skill_key, name, description, instructions, config
            FROM user_agent_skills WHERE user_id = :user_id''')


PERSIST_TURN_SELECT_AGENT_MESSAGES = text('SELECT * FROM agent_messages WHERE id = :id')


PERSIST_TURN_SELECT_AGENT_MESSAGES_2 = text('SELECT * FROM agent_messages WHERE id = :id')


CONVERSATION_SOURCE_TEXT_SELECT_AGENT_MESSAGES = text('''SELECT source_text FROM agent_messages
            WHERE conversation_id = :conversation_id AND source_text IS NOT NULL
              AND created_at > COALESCE((
                  SELECT MAX(applied_at) FROM agent_messages
                  WHERE conversation_id = :conversation_id AND applied_at IS NOT NULL
              ), to_timestamp(0))
            ORDER BY created_at DESC, id DESC LIMIT 5''')


LIST_PROVIDERS_SELECT_WORKSPACE_MEMBERS = text("SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'")


LIST_PROVIDERS_SELECT_WORKSPACE_AGENT_PROVIDERS = text('SELECT * FROM workspace_agent_providers WHERE workspace_id = :workspace_id ORDER BY provider')


SAVE_PROVIDER_SELECT_WORKSPACE_AGENT_PROVIDERS = text('SELECT api_key_encrypted FROM workspace_agent_providers WHERE workspace_id = :workspace_id AND provider = CAST(:provider AS "AgentProvider")')


SAVE_PROVIDER_SELECT_WORKSPACE_AGENT_PROVIDERS_2 = text('SELECT * FROM workspace_agent_providers WHERE workspace_id = :workspace_id AND provider = CAST(:provider AS "AgentProvider")')


CHECK_PROVIDER_SELECT_WORKSPACE_AGENT_PROVIDERS = text('''SELECT provider, endpoint, model, api_key_encrypted FROM workspace_agent_providers
                WHERE workspace_id = :workspace_id AND provider = CAST(:provider AS "AgentProvider")''')


LIST_TOOLS_SELECT_WORKSPACE_MEMBERS = text("SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'")


LIST_SKILLS_SELECT_USER_AGENT_SKILLS = text('''SELECT skill_key, name, description, instructions, config
            FROM user_agent_skills WHERE user_id = :user_id AND skill_key LIKE 'custom.%'
            ORDER BY updated_at DESC, created_at DESC''')


PROJECT_FACTS_SELECT_PROJECTS = text(
    """SELECT p.id, p.name, p.description, p.status, p.priority, p.health, p.team_id,
                      p.start_date, p.target_date,
                      t.name AS team_name, u.name AS lead_name
               FROM projects p
               LEFT JOIN teams t ON t.id = p.team_id
               LEFT JOIN users u ON u.id = p.lead_id
               WHERE p.id = :project_id AND p.workspace_id = :workspace_id AND p.archived_at IS NULL"""
)


PROJECT_FACTS_SELECT_ISSUES = text(
    """SELECT s.category, COUNT(*) AS total FROM issues i
               JOIN issue_statuses s ON s.id = i.status_id
               WHERE i.project_id = :project_id AND i.archived_at IS NULL
               GROUP BY s.category"""
)


PROJECT_FACTS_SELECT_ISSUES_2 = text(
    """SELECT i.identifier, i.title, s.name AS status, i.due_date FROM issues i
               JOIN issue_statuses s ON s.id = i.status_id
               WHERE i.project_id = :project_id AND i.archived_at IS NULL
                 AND s.category NOT IN ('COMPLETED', 'CANCELED')
               ORDER BY i.due_date NULLS LAST, i.updated_at DESC LIMIT 12"""
)


PROJECT_FACTS_SELECT_PROJECT_MILESTONES = text(
    """SELECT title, target_date, completed_at FROM project_milestones
               WHERE project_id = :project_id ORDER BY target_date NULLS LAST LIMIT 8"""
)


PROJECT_FACTS_SELECT_ISSUES_3 = text(
    """SELECT i.identifier, i.title, u.name AS assignee, (:today - i.due_date::date)::int AS days_late
               FROM issues i
               JOIN issue_statuses s ON s.id = i.status_id
               LEFT JOIN users u ON u.id = i.assignee_id
               WHERE i.project_id = :project_id AND i.archived_at IS NULL
                 AND s.category NOT IN ('COMPLETED', 'CANCELED') AND i.due_date::date < :today
               ORDER BY i.due_date ASC, i.identifier ASC LIMIT 10"""
)


PROJECT_SCHEDULE_FACTS_SELECT_PROJECTS = text(
    '''SELECT p.id, p.name, p.description, p.start_date, p.target_date, p.team_id
               FROM projects p
               WHERE p.id = :project_id AND p.workspace_id = :workspace_id AND p.archived_at IS NULL'''
)


PROJECT_SCHEDULE_FACTS_SELECT_ISSUES = text(
    '''SELECT i.id, i.parent_issue_id, i.identifier, i.title, i.description,
                      i.estimated_effort, i.start_date, i.target_date, i.due_date,
                      s.name AS status_name
               FROM issues i
               JOIN issue_statuses s ON s.id = i.status_id
               WHERE i.project_id = :project_id AND i.workspace_id = :workspace_id
                 AND i.archived_at IS NULL AND s.category NOT IN ('COMPLETED', 'CANCELED')
               ORDER BY i.created_at ASC
               LIMIT 101'''
)


LIST_CONVERSATIONS_SELECT_AGENT_CONVERSATIONS = text('''SELECT id, title, created_at, updated_at FROM agent_conversations
            WHERE workspace_id = :workspace_id AND user_id = :user_id ORDER BY updated_at DESC LIMIT 50''')


GET_CONVERSATION_SELECT_AGENT_CONVERSATIONS = text('''SELECT id, title, created_at, updated_at FROM agent_conversations
            WHERE id = :id AND workspace_id = :workspace_id AND user_id = :user_id''')


GET_CONVERSATION_SELECT_AGENT_MESSAGES = text('SELECT * FROM agent_messages WHERE conversation_id = :conversation_id ORDER BY created_at')


PORTFOLIO_FACTS_SELECT_ISSUES = text('''SELECT issue.identifier, issue.title, project.identifier AS project, assignee.name AS assignee,
                       status.name AS status, issue.priority, (:today - issue.due_date::date)::int AS days_late
                FROM issues issue
                JOIN issue_statuses status ON status.id = issue.status_id
                LEFT JOIN projects project ON project.id = issue.project_id
                LEFT JOIN users assignee ON assignee.id = issue.assignee_id
                WHERE issue.workspace_id = :workspace_id
                  AND issue.archived_at IS NULL
                  AND issue.due_date::date < :today
                  AND status.category NOT IN ('COMPLETED', 'CANCELED')
                  AND EXISTS (SELECT 1 FROM team_members member
                              WHERE member.team_id = issue.team_id AND member.user_id = :user_id)
                ORDER BY issue.due_date ASC, issue.identifier ASC
                LIMIT 30''')


MENTIONED_ISSUES_SELECT_ISSUES = text('''SELECT issue.identifier, issue.title, status.name AS status, issue.priority,
                       assignee.name AS assignee, project.identifier AS project, issue.start_date,
                       issue.target_date, issue.due_date, issue.updated_at,
                       LEFT(issue.description, :description_chars) AS description
                FROM issues issue
                JOIN issue_statuses status ON status.id = issue.status_id
                LEFT JOIN projects project ON project.id = issue.project_id
                LEFT JOIN users assignee ON assignee.id = issue.assignee_id
                WHERE issue.workspace_id = :workspace_id AND issue.identifier = ANY(:identifiers)
                  AND issue.archived_at IS NULL
                  AND EXISTS (SELECT 1 FROM team_members member
                              WHERE member.team_id = issue.team_id AND member.user_id = :user_id)
                ORDER BY issue.identifier''')


PROCESS_MESSAGE_SELECT_AGENT_MESSAGES = text('''WITH recent_messages AS (
                SELECT id, role, content, proposal, created_at,
                       LEAD(role) OVER (
                           ORDER BY created_at ASC,
                                    CASE role WHEN 'USER' THEN 0 ELSE 1 END,
                                    id ASC
                       ) AS next_role,
                       LEAD(proposal) OVER (
                           ORDER BY created_at ASC,
                                    CASE role WHEN 'USER' THEN 0 ELSE 1 END,
                                    id ASC
                       ) AS next_proposal
                FROM agent_messages
                WHERE conversation_id = :conversation_id
                  AND created_at > COALESCE((
                      SELECT MAX(applied_at) FROM agent_messages
                      WHERE conversation_id = :conversation_id AND applied_at IS NOT NULL
                  ), to_timestamp(0))
            )
            SELECT role, content, proposal FROM recent_messages
            WHERE (role = 'ASSISTANT' AND proposal IS NOT NULL)
               OR (role = 'USER' AND next_role = 'ASSISTANT' AND next_proposal IS NOT NULL)
            ORDER BY created_at DESC, CASE role WHEN 'USER' THEN 1 ELSE 0 END, id DESC
            LIMIT 12''')


ACCEPT_PROPOSAL_SELECT_AGENT_MESSAGES = text('''SELECT message.* FROM agent_messages message
            JOIN agent_conversations conversation ON conversation.id = message.conversation_id
            WHERE message.id = :message_id AND conversation.workspace_id = :workspace_id AND conversation.user_id = :user_id
            AND message.role = 'ASSISTANT' FOR UPDATE''')


APPLY_ASSIGNMENT_SELECT_ISSUES = text('''SELECT issue.id, issue.identifier, issue.assignee_id, assignee.name AS assignee_name
                FROM issues issue
                JOIN issue_statuses status ON status.id = issue.status_id
                LEFT JOIN users assignee ON assignee.id = issue.assignee_id
                WHERE issue.id = :issue_id AND issue.workspace_id = :workspace_id
                  AND issue.archived_at IS NULL
                  AND status.category NOT IN ('COMPLETED', 'CANCELED')''')


APPLY_ASSIGNMENT_SELECT_WORKSPACE_MEMBERS = text("""SELECT 1 FROM workspace_members
                WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'""")


# The latest user messages of a conversation, newest first, to find the question a short reply answers.
# VI: Các tin nhắn người dùng mới nhất của hội thoại, mới nhất trước, để tìm câu hỏi mà câu trả lời ngắn đang bổ sung.
FOLLOW_UP_SELECT_AGENT_MESSAGES = text('''SELECT content, source_text IS NOT NULL AS has_source FROM agent_messages
                    WHERE conversation_id = :conversation_id AND role = 'USER'
                    ORDER BY created_at DESC, id DESC LIMIT :limit''')


ANALYST_TURN_SELECT_AGENT_MESSAGES = text('''SELECT role, content FROM agent_messages WHERE conversation_id = :conversation_id
                    ORDER BY created_at DESC, id DESC LIMIT :limit''')


PROCESS_MESSAGE_SELECT_AGENT_CONVERSATIONS = text('SELECT id, title FROM agent_conversations WHERE id = :id AND workspace_id = :workspace_id AND user_id = :user_id')


PROJECT_FACTS_SELECT_ISSUES_4 = text(
    """SELECT
                   COUNT(*) FILTER (WHERE s.category NOT IN ('COMPLETED', 'CANCELED') AND i.due_date::date < :today)::int AS overdue,
                   COUNT(*) FILTER (WHERE s.category NOT IN ('COMPLETED', 'CANCELED') AND i.updated_at::date <= :stale_since)::int AS stale,
                   COUNT(*) FILTER (WHERE s.category NOT IN ('COMPLETED', 'CANCELED') AND i.assignee_id IS NULL)::int AS unassigned,
                   COUNT(*) FILTER (WHERE s.category = 'COMPLETED' AND i.completed_at::date >= :week_ago)::int AS completed_week
               FROM issues i JOIN issue_statuses s ON s.id = i.status_id
               WHERE i.project_id = :project_id AND i.archived_at IS NULL"""
)
