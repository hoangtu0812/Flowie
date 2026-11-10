"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

PERSIST_TURN_INSERT_AGENT_MESSAGES = text('''INSERT INTO agent_messages (id, conversation_id, role, content, source_text, created_at)
            VALUES (:id, :conversation_id, 'USER', :content, :source_text, :now)''')


PERSIST_TURN_INSERT_AGENT_MESSAGES_2 = text('''INSERT INTO agent_messages (id, conversation_id, role, content, proposal, created_at)
            VALUES (:id, :conversation_id, 'ASSISTANT', :content, CAST(:proposal AS jsonb), :now)''')


PERSIST_TURN_UPDATE_AGENT_CONVERSATIONS = text('UPDATE agent_conversations SET updated_at = :now WHERE id = :id')


SAVE_PROVIDER_INSERT_WORKSPACE_AGENT_PROVIDERS = text('''INSERT INTO workspace_agent_providers
            (id, workspace_id, provider, endpoint, model, api_key_encrypted, enabled, created_at, updated_at)
            VALUES (:id, :workspace_id, CAST(:provider AS "AgentProvider"), :endpoint, :model, :api_key, :enabled, :now, :now)
            ON CONFLICT (workspace_id, provider) DO UPDATE SET endpoint = EXCLUDED.endpoint,
            model = EXCLUDED.model, api_key_encrypted = EXCLUDED.api_key_encrypted,
            enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at''')


SAVE_PROVIDER_INSERT_AUDIT_LOGS = text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
            VALUES (:id, :workspace_id, :actor_id, 'agent.provider.updated', 'workspace_agent_provider', :entity_id, CAST(:metadata AS jsonb), :now)''')


INSTALL_TOOL_INSERT_WORKSPACE_AGENT_TOOLS = text('''INSERT INTO workspace_agent_tools (id, workspace_id, tool_key, created_at, updated_at)
            VALUES (:id, :workspace_id, :tool_key, :now, :now)
            ON CONFLICT (workspace_id, tool_key) DO NOTHING''')


INSTALL_TOOL_INSERT_AUDIT_LOGS = text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
            VALUES (:id, :workspace_id, :actor_id, 'agent.tool.installed', 'workspace_agent_tool', :entity_id, '{}'::jsonb, :now)''')


REMOVE_TOOL_DELETE_WORKSPACE_AGENT_TOOLS = text('DELETE FROM workspace_agent_tools WHERE workspace_id = :workspace_id AND tool_key = :tool_key')


REMOVE_TOOL_INSERT_AUDIT_LOGS = text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
            VALUES (:id, :workspace_id, :actor_id, 'agent.tool.removed', 'workspace_agent_tool', :entity_id, '{}'::jsonb, :now)''')


CREATE_PERSONAL_SKILL_INSERT_USER_AGENT_SKILLS = text('''INSERT INTO user_agent_skills
            (id, user_id, skill_key, name, description, instructions, config, created_at, updated_at)
            VALUES (:id, :user_id, :skill_key, :name, :description, :instructions, '{}'::jsonb, :now, :now)''')


INSTALL_SKILL_INSERT_USER_AGENT_SKILLS = text('''INSERT INTO user_agent_skills (id, user_id, skill_key, config, created_at, updated_at)
            VALUES (:id, :user_id, :skill_key, CAST(:config AS jsonb), :now, :now)
            ON CONFLICT (user_id, skill_key) DO NOTHING''')


UPDATE_ISSUE_DEFAULTS_UPDATE_USER_AGENT_SKILLS = text('''UPDATE user_agent_skills SET config = CAST(:config AS jsonb), updated_at = :now
            WHERE user_id = :user_id AND skill_key = :skill_key''')


UPDATE_PERSONAL_SKILL_UPDATE_USER_AGENT_SKILLS = text('''UPDATE user_agent_skills
            SET name = :name, description = :description, instructions = :instructions, updated_at = :now
            WHERE user_id = :user_id AND skill_key = :skill_key AND skill_key LIKE 'custom.%' ''')


REMOVE_SKILL_DELETE_USER_AGENT_SKILLS = text('DELETE FROM user_agent_skills WHERE user_id = :user_id AND skill_key = :skill_key')


PROJECT_FACTS_UPDATE_PROJECT_UPDATES = text(
    """SELECT body, health, created_at FROM project_updates
               WHERE project_id = :project_id AND kind = 'update'
               ORDER BY created_at DESC LIMIT 3"""
)


APPLY_PROJECT_SCHEDULE_INSERT_AUDIT_LOGS = text(
    '''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :workspace_id, :actor_id, 'agent.project_schedule.applied', 'project', :project_id,
                       CAST(:metadata AS jsonb), :now)'''
)


ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES = text('UPDATE agent_messages SET accepted_at = COALESCE(accepted_at, :now) WHERE id = :id')


ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES_2 = text('UPDATE agent_messages SET applied_at = :now, applied_result = CAST(:result AS jsonb) WHERE id = :id')


ACCEPT_PROPOSAL_INSERT_AUDIT_LOGS = text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
            VALUES (:id, :workspace_id, :actor_id, 'agent.proposal.accepted', 'agent_message', :entity_id, CAST(:metadata AS jsonb), :now)''')


PERSIST_TURN_INSERT_AGENT_CONVERSATIONS = text('''INSERT INTO agent_conversations (id, workspace_id, user_id, title, created_at, updated_at)
                VALUES (:id, :workspace_id, :user_id, :title, :now, :now)''')


SAVE_PROVIDER_UPDATE_WORKSPACE_AGENT_PROVIDERS = text('UPDATE workspace_agent_providers SET enabled = false, updated_at = :now WHERE workspace_id = :workspace_id')


APPLY_PROJECT_SCHEDULE_UPDATE_ISSUES = text(
    '''UPDATE issues SET start_date = :start_date, target_date = :target_date,
                       due_date = :due_date, updated_at = :now
                   WHERE id = :issue_id AND project_id = :project_id AND workspace_id = :workspace_id'''
)


APPLY_PROJECT_SCHEDULE_INSERT_ACTIVITIES = text(
    '''INSERT INTO activities (id, workspace_id, issue_id, actor_id, type, data, created_at)
                   VALUES (:id, :workspace_id, :issue_id, :actor_id, 'issue.updated',
                           CAST(:data AS jsonb), :now)'''
)


ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES_3 = text('UPDATE agent_messages SET applied_result = CAST(:result AS jsonb) WHERE id = :id')


ACCEPT_PROPOSAL_UPDATE_AGENT_MESSAGES_4 = text('UPDATE agent_messages SET applied_result = CAST(:result AS jsonb) WHERE id = :id')


APPLY_ASSIGNMENT_UPDATE_ISSUES = text('UPDATE issues SET assignee_id = :assignee_id, updated_at = :now WHERE id = :id')


APPLY_ASSIGNMENT_INSERT_AUDIT_LOGS = text('''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
                    VALUES (:id, :workspace_id, :actor_id, 'agent.assignment.applied', 'issue', :entity_id,
                            CAST(:metadata AS jsonb), :now)''')
