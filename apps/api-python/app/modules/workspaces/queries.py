"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def member_row_select_workspace_members_sql(USER_SELECT) -> TextClause:
    return text(
        f'''
            SELECT wm.id AS member_id, wm.workspace_id, wm.user_id AS member_user_id,
                   wm.status AS member_status, wm.role AS member_role,
                   wm.joined_at AS member_joined_at, wm.invited_by AS member_invited_by,
                   wm.created_at AS member_created_at, wm.updated_at AS member_updated_at,
                   {USER_SELECT}
            FROM workspace_members AS wm
            INNER JOIN users AS u ON u.id = wm.user_id
            WHERE wm.workspace_id = :workspace_id AND wm.user_id = :user_id
            LIMIT 1
            '''
    )


WORKSPACE_SUMMARY_SELECT_WORKSPACES = text(
    '''
            SELECT w.id AS workspace_id_value, w.organization_id, w.name AS workspace_name,
                   w.slug AS workspace_slug, w.icon AS workspace_icon, w.description AS workspace_description,
                   w.timezone AS workspace_timezone, w.project_display_defaults,
                   w.issue_display_defaults, w.issue_insight_defaults,
                   w.created_at AS workspace_created_at, w.updated_at AS workspace_updated_at,
                   o.id AS organization_id_value, o.name AS organization_name,
                   o.slug AS organization_slug, o.logo_url AS organization_logo_url,
                   o.owner_id AS organization_owner_id, o.created_at AS organization_created_at,
                   o.updated_at AS organization_updated_at
            FROM workspaces AS w
            INNER JOIN organizations AS o ON o.id = w.organization_id
            WHERE w.id = :workspace_id
            LIMIT 1
            '''
)


def read_display_preferences_select_workspaces_sql(column) -> TextClause:
    return text(f'SELECT {column} AS settings, updated_at FROM workspaces WHERE id = :workspace_id')


MINE_SELECT_WORKSPACE_MEMBERS = text(
    '''
            SELECT wm.id AS member_id, wm.workspace_id, wm.user_id AS member_user_id,
                   wm.status AS member_status, wm.role AS member_role,
                   wm.joined_at AS member_joined_at, wm.invited_by AS member_invited_by,
                   wm.created_at AS member_created_at, wm.updated_at AS member_updated_at,
                   w.id AS workspace_id_value, w.organization_id, w.name AS workspace_name,
                   w.slug AS workspace_slug, w.icon AS workspace_icon, w.description AS workspace_description,
                   w.timezone AS workspace_timezone, w.project_display_defaults,
                   w.issue_display_defaults, w.issue_insight_defaults,
                   w.created_at AS workspace_created_at, w.updated_at AS workspace_updated_at,
                   o.id AS organization_id_value, o.name AS organization_name,
                   o.slug AS organization_slug, o.logo_url AS organization_logo_url,
                   o.owner_id AS organization_owner_id, o.created_at AS organization_created_at,
                   o.updated_at AS organization_updated_at
            FROM workspace_members AS wm
            INNER JOIN workspaces AS w ON w.id = wm.workspace_id
            INNER JOIN organizations AS o ON o.id = w.organization_id
            WHERE wm.user_id = :user_id AND wm.status = 'ACTIVE'
            ORDER BY wm.created_at ASC
            '''
)


PENDING_INVITATIONS_SELECT_WORKSPACE_MEMBERS = text(
    '''
            SELECT wm.id AS member_id, wm.workspace_id, wm.user_id AS member_user_id,
                   wm.status AS member_status, wm.role AS member_role,
                   wm.joined_at AS member_joined_at, wm.invited_by AS member_invited_by,
                   wm.created_at AS member_created_at, wm.updated_at AS member_updated_at,
                   w.id AS workspace_id_value, w.organization_id, w.name AS workspace_name,
                   w.slug AS workspace_slug, w.icon AS workspace_icon, w.description AS workspace_description,
                   w.timezone AS workspace_timezone, w.project_display_defaults,
                   w.issue_display_defaults, w.issue_insight_defaults,
                   w.created_at AS workspace_created_at, w.updated_at AS workspace_updated_at,
                   o.id AS organization_id_value, o.name AS organization_name,
                   o.slug AS organization_slug, o.logo_url AS organization_logo_url,
                   o.owner_id AS organization_owner_id, o.created_at AS organization_created_at,
                   o.updated_at AS organization_updated_at,
                   inviter.id AS inviter_id, inviter.name AS inviter_name, inviter.email AS inviter_email
            FROM workspace_members AS wm
            INNER JOIN workspaces AS w ON w.id = wm.workspace_id
            INNER JOIN organizations AS o ON o.id = w.organization_id
            LEFT JOIN users AS inviter ON inviter.id = wm.invited_by
            WHERE wm.user_id = :user_id AND wm.status = 'INVITED'
            ORDER BY wm.created_at DESC
            '''
)


DELETE_WORKSPACE_SELECT_WORKSPACES = text('''
            SELECT w.name, wm.role
            FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
            WHERE w.id = :workspace AND wm.user_id = :user AND wm.status = 'ACTIVE'
            FOR UPDATE OF w, wm
        ''')


def members_select_workspace_members_sql(USER_SELECT) -> TextClause:
    return text(
        f'''
            SELECT wm.id AS member_id, wm.workspace_id, wm.user_id AS member_user_id,
                   wm.status AS member_status, wm.role AS member_role,
                   wm.joined_at AS member_joined_at, wm.invited_by AS member_invited_by,
                   wm.created_at AS member_created_at, wm.updated_at AS member_updated_at,
                   {USER_SELECT}
            FROM workspace_members AS wm
            INNER JOIN users AS u ON u.id = wm.user_id
            WHERE wm.workspace_id = :workspace_id
            ORDER BY wm.created_at ASC
            '''
    )


INVITE_SELECT_USERS = text("SELECT id FROM users WHERE lower(email) = :email AND status = 'ACTIVE' LIMIT 2")


ACCEPT_INVITATION_SELECT_WORKSPACE_MEMBERS = text("SELECT workspace_id FROM workspace_members WHERE id = :id AND user_id = :user_id AND status = 'INVITED' LIMIT 1")


AUTO_JOIN_STATUS_SELECT_PROJECTS = text(
    '''SELECT w.auto_join_tenant_id,
                      (SELECT COUNT(*) FROM projects p WHERE p.workspace_id = w.id AND p.team_id IS NULL AND p.archived_at IS NULL) AS projects,
                      (SELECT COUNT(*) FROM issues i WHERE i.workspace_id = w.id AND i.team_id IS NULL AND i.archived_at IS NULL) AS issues,
                      (SELECT COUNT(*) FROM documents d WHERE d.workspace_id = w.id AND d.team_id IS NULL AND d.archived_at IS NULL) AS documents
               FROM workspaces w WHERE w.id = :workspace_id'''
)


UPDATE_MEMBER_SELECT_WORKSPACE_MEMBERS = text('SELECT user_id, role FROM workspace_members WHERE id = :id AND workspace_id = :workspace_id LIMIT 1')


REMOVE_MEMBER_SELECT_WORKSPACE_MEMBERS = text('SELECT user_id, role FROM workspace_members WHERE id = :id AND workspace_id = :workspace_id LIMIT 1')


RESOLVE_WORKSPACE_SELECT_WORKSPACES = text(
    '''SELECT w.id, w.slug FROM workspaces w
                   JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = :user AND m.status = 'ACTIVE'
                   WHERE w.id = :key OR w.id = (SELECT s.workspace_id FROM workspace_slugs s WHERE s.slug = lower(:key))
                   ORDER BY w.id = :key DESC LIMIT 1'''
)


UPDATE_WORKSPACE_SELECT_WORKSPACES = text('SELECT name, icon, slug FROM workspaces WHERE id = :id FOR UPDATE')


INVITATION_CANDIDATES_SELECT_USERS = text('''
        SELECT u.id, u.name, u.email FROM users u
        WHERE u.status = 'ACTIVE'
          AND (strpos(lower(u.name), :query) > 0 OR strpos(lower(u.email), :query) > 0)
          AND NOT EXISTS (
              SELECT 1 FROM workspace_members m WHERE m.user_id = u.id
                AND m.workspace_id = :workspace AND m.status IN ('ACTIVE', 'INVITED')
          )
        ORDER BY lower(u.name), u.id LIMIT 26
    ''')
