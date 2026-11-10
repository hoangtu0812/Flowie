"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def write_display_preferences_update_workspaces_sql(column) -> TextClause:
    return text(
        f'''
            UPDATE workspaces
            SET {column} = CAST(:settings AS jsonb), updated_at = :now
            WHERE id = :workspace_id
            RETURNING {column} AS settings, updated_at
            '''
    )


WRITE_DISPLAY_PREFERENCES_INSERT_AUDIT_LOGS = text(
    '''
            INSERT INTO audit_logs (
                id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at
            ) VALUES (
                :id, :workspace_id, :actor_id, :action, 'workspace', :entity_id,
                CAST('{}' AS jsonb), :now
            )
            '''
)


DELETE_WORKSPACE_UPDATE_USER_UI_PREFERENCES = text('''UPDATE user_ui_preferences
            SET preferences = preferences - 'defaultWorkspaceId', version = version + 1, updated_at = :now
            WHERE preferences ->> 'defaultWorkspaceId' = :workspace''')


DELETE_WORKSPACE_DELETE_WORKSPACES = text('DELETE FROM workspaces WHERE id = :workspace')


ACCEPT_INVITATION_UPDATE_WORKSPACE_MEMBERS = text("UPDATE workspace_members SET status = 'ACTIVE', joined_at = :now, updated_at = :now WHERE id = :id")


DECLINE_INVITATION_DELETE_WORKSPACE_MEMBERS = text("DELETE FROM workspace_members WHERE id = :id AND user_id = :user_id AND status = 'INVITED' RETURNING id")


BLOCK_AUTO_JOIN_INSERT_WORKSPACE_AUTO_JOIN_BLOCKS = text('INSERT INTO workspace_auto_join_blocks (workspace_id, user_id) VALUES (:workspace_id, :user_id) ON CONFLICT DO NOTHING')


UPDATE_AUTO_JOIN_UPDATE_WORKSPACES = text('UPDATE workspaces SET auto_join_tenant_id = :tenant_id, updated_at = :now WHERE id = :workspace_id')


UPDATE_AUTO_JOIN_INSERT_AUDIT_LOGS = text(
    '''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :workspace_id, :actor_id, 'workspace.auto_join.changed', 'workspace', :workspace_id, CAST(:metadata AS jsonb), :now)'''
)


LEAVE_INSERT_AUDIT_LOGS = text("INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at) VALUES (:id, :workspace_id, :actor_id, 'workspace.member.left', 'workspace-member', :entity_id, CAST('{}' AS jsonb), :now)")


LEAVE_DELETE_TEAM_MEMBERS = text('DELETE FROM team_members WHERE user_id = :user_id AND team_id IN (SELECT id FROM teams WHERE workspace_id = :workspace_id)')


LEAVE_DELETE_WORKSPACE_MEMBERS = text('DELETE FROM workspace_members WHERE id = :id')


UPDATE_MEMBER_UPDATE_WORKSPACE_MEMBERS = text('UPDATE workspace_members SET role = :role, updated_at = :now WHERE id = :id')


REMOVE_MEMBER_DELETE_TEAM_MEMBERS = text('DELETE FROM team_members WHERE user_id = :user_id AND team_id IN (SELECT id FROM teams WHERE workspace_id = :workspace_id)')


REMOVE_MEMBER_DELETE_WORKSPACE_MEMBERS = text('DELETE FROM workspace_members WHERE id = :id')


UPDATE_WORKSPACE_INSERT_AUDIT_LOGS = text(
    '''
                INSERT INTO audit_logs (
                    id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at
                ) VALUES (
                    :id, :workspace_id, :actor_id, :action, 'workspace', :entity_id,
                    CAST(:metadata AS jsonb), :now
                )
                '''
)


INVITE_UPDATE_WORKSPACE_MEMBERS = text("UPDATE workspace_members SET status = 'INVITED', role = :role, invited_by = :invited_by, joined_at = NULL, updated_at = :now WHERE id = :id")


INVITE_INSERT_WORKSPACE_MEMBERS = text("INSERT INTO workspace_members (id, workspace_id, user_id, status, role, invited_by, created_at, updated_at) VALUES (:id, :workspace_id, :user_id, 'INVITED', :role, :invited_by, :now, :now)")


def update_workspace_update_workspaces_sql(sets) -> TextClause:
    return text(f'UPDATE workspaces SET {sets}, updated_at = :now WHERE id = :workspace_id')
