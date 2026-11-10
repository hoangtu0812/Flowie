"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

AUDIT_INSERT_AUDIT_LOGS = text("INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at) VALUES (:id, :workspace_id, :actor_id, :action, 'team', :team_id, CAST(:metadata AS jsonb), :now)")


RESTORE_TEAM_UPDATE_TEAMS = text('UPDATE teams SET archived_at = NULL, deleted_at = NULL, updated_at = :now WHERE id = :id RETURNING *')


JOIN_TEAM_INSERT_TEAM_MEMBERS = text("INSERT INTO team_members (team_id, user_id, role) VALUES (:team_id, :user_id, 'MEMBER') ON CONFLICT (team_id, user_id) DO NOTHING")


LEAVE_TEAM_DELETE_TEAM_MEMBERS = text('DELETE FROM team_members WHERE team_id = :team_id AND user_id = :user_id AND EXISTS (SELECT 1 FROM teams WHERE id = :team_id AND workspace_id = :workspace_id AND archived_at IS NULL) RETURNING team_id')


CREATE_TEAM_INSERT_TEAMS = text('''INSERT INTO teams (id, workspace_id, name, identifier, description, icon, color, created_at, updated_at) VALUES (:id, :workspace_id, :name, :identifier, :description, :icon, :color, :now, :now)''')


CREATE_TEAM_INSERT_DOCUMENT_FOLDERS = text("INSERT INTO document_folders (id, workspace_id, team_id, name, icon, position, created_at, updated_at) VALUES (:id, :workspace_id, :team_id, 'Team documents', '📁', 0, :now, :now)")


RETIRE_UPDATE_TEAMS = text('UPDATE teams SET archived_at = :now, deleted_at = :now, updated_at = :now WHERE id = :id AND workspace_id = :workspace_id AND deleted_at IS NULL RETURNING *')


RETIRE_UPDATE_TEAMS_2 = text('UPDATE teams SET archived_at = :now, updated_at = :now WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL RETURNING *')


ADD_MEMBER_INSERT_TEAM_MEMBERS = text('INSERT INTO team_members (team_id, user_id, role) VALUES (:team_id, :user_id, :role)')


CHANGE_MEMBER_UPDATE_TEAM_MEMBERS = text('UPDATE team_members SET role = :role WHERE team_id = :team_id AND user_id = :user_id RETURNING user_id')


CHANGE_MEMBER_DELETE_TEAM_MEMBERS = text('DELETE FROM team_members WHERE team_id = :team_id AND user_id = :user_id RETURNING user_id')


CREATE_TEAM_INSERT_TEAM_MEMBERS = text("INSERT INTO team_members (team_id, user_id, role) VALUES (:team_id, :user_id, 'LEAD')")


def update_team_update_teams_sql(sets) -> TextClause:
    return text(f"UPDATE teams SET {', '.join(sets)}, updated_at = :now WHERE id = :id")


UPDATE_TEAM_UPDATE_ISSUES = text('''UPDATE issues SET identifier = :identifier || '-' || number::text, updated_at = :now
                            WHERE team_id = :id AND workspace_id = :workspace_id''')


UPDATE_TEAM_UPDATE_ISSUES_2 = text('''UPDATE notifications AS n
                            SET data = jsonb_set(n.data, '{entityPath}', to_jsonb('/issue/' || i.identifier))
                            FROM issues AS i
                            WHERE n.entity_type = 'issue' AND n.entity_id = i.id
                              AND i.team_id = :id AND n.data -> 'entityPath' IS NOT NULL''')


RUN_TEAM_DISPATCHER_INSERT_TEAM_DISPATCHER_SETTINGS = text(
    """INSERT INTO team_dispatcher_settings
               (team_id, enabled, dry_run, max_actions_per_day, assign_unassigned,
                nudge_overdue, last_run_at, last_run_result, created_at, updated_at)
               VALUES (:team_id, :enabled, :dry_run, :max_actions, :assign, :nudge,
                       :now, CAST(:result AS jsonb), :now, :now)
               ON CONFLICT (team_id) DO UPDATE SET
                 last_run_at = :now, last_run_result = CAST(:result AS jsonb), updated_at = :now"""
)


SAVE_DISPATCHER_SETTINGS_INSERT_TEAM_DISPATCHER_SETTINGS = text("""INSERT INTO team_dispatcher_settings
               (team_id, enabled, dry_run, max_actions_per_day, assign_unassigned,
                nudge_overdue, created_at, updated_at)
               VALUES (:team_id, :enabled, :dry_run, :max_actions, :assign, :nudge, :now, :now)
               ON CONFLICT (team_id) DO UPDATE SET
                 enabled = :enabled, dry_run = :dry_run, max_actions_per_day = :max_actions,
                 assign_unassigned = :assign, nudge_overdue = :nudge, updated_at = :now
               RETURNING *""")


RUN_TEAM_DISPATCHER_UPDATE_ISSUES = text("""UPDATE issues SET assignee_id = :assignee_id, updated_at = :now
                       WHERE id = :issue_id AND assignee_id IS NULL AND archived_at IS NULL
                         AND EXISTS (
                             SELECT 1 FROM issue_statuses st
                             WHERE st.id = issues.status_id
                               AND st.category NOT IN ('COMPLETED', 'CANCELED'))
                       RETURNING id""")


RUN_TEAM_DISPATCHER_INSERT_AUDIT_LOGS = text("""INSERT INTO audit_logs
                       (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
                       VALUES (:id, :workspace_id, NULL, :action, 'issue', :entity_id,
                               CAST(:metadata AS jsonb), :now)""")


RUN_TEAM_DISPATCHER_INSERT_NOTIFICATIONS = text("""INSERT INTO notifications
                       (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                       VALUES (:id, :workspace_id, :user_id, :type, 'issue', :entity_id,
                               CAST(:data AS jsonb), :now)""")


RUN_TEAM_DISPATCHER_INSERT_NOTIFICATIONS_2 = text("""INSERT INTO notifications
                       (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                       VALUES (:id, :workspace_id, :user_id, :type, 'issue', :entity_id,
                               CAST(:data AS jsonb), :now)""")


SEND_DIGEST_FOR_WORKSPACE_UPDATE_DISCORD_WEBHOOKS = text(
    "UPDATE discord_webhooks SET daily_digest_sent_at = :now WHERE workspace_id = :workspace_id"
)
