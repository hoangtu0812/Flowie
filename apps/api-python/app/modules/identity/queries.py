"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

OVERVIEW_SELECT_USERS = text(
    '''SELECT (SELECT COUNT(*)::int FROM users) AS users,
                      (SELECT COUNT(*)::int FROM users WHERE status = 'ACTIVE') AS active_users,
                      (SELECT COUNT(*)::int FROM organizations) AS organizations,
                      (SELECT COUNT(*)::int FROM workspaces) AS workspaces,
                      (SELECT COUNT(*)::int FROM projects) AS projects,
                      (SELECT COUNT(*)::int FROM issues) AS issues'''
)


def users_select_sql(ADMIN_USER_QUERY) -> TextClause:
    return text(f'{ADMIN_USER_QUERY} ORDER BY u.created_at DESC')


WORKSPACES_SELECT_WORKSPACE_MEMBERS = text(
    '''SELECT w.id, w.name, w.slug, w.created_at,
                      o.name AS organization_name, o.slug AS organization_slug,
                      ow.name AS owner_name, ow.email AS owner_email,
                      (SELECT COUNT(*)::int FROM workspace_members m WHERE m.workspace_id = w.id) AS members,
                      (SELECT COUNT(*)::int FROM teams t WHERE t.workspace_id = w.id) AS teams,
                      (SELECT COUNT(*)::int FROM projects p WHERE p.workspace_id = w.id) AS projects,
                      (SELECT COUNT(*)::int FROM issues i WHERE i.workspace_id = w.id) AS issues
               FROM workspaces w
               JOIN organizations o ON o.id = w.organization_id
               JOIN users ow ON ow.id = o.owner_id
               ORDER BY w.created_at DESC'''
)


AUDIT_LOGS_SELECT_AUDIT_LOGS = text(
    '''SELECT id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at
               FROM audit_logs ORDER BY created_at DESC LIMIT 200'''
)


UPDATE_USER_SELECT_USERS = text('SELECT id, email, status, platform_role FROM users WHERE id = :id')


def update_user_select_sql(ADMIN_USER_QUERY) -> TextClause:
    return text(f'{ADMIN_USER_QUERY} WHERE u.id = :id')


def find_user_by_email_select_users_sql(USER_COLUMNS) -> TextClause:
    return text(f'SELECT {USER_COLUMNS} FROM users WHERE email = :email')


def find_user_by_id_select_users_sql(USER_COLUMNS) -> TextClause:
    return text(f'SELECT {USER_COLUMNS} FROM users WHERE id = :id')


FIRST_WORKSPACE_SELECT_WORKSPACE_MEMBERS = text(
    '''
            SELECT w.id, w.slug, w.name
            FROM workspace_members AS wm
            INNER JOIN workspaces AS w ON w.id = wm.workspace_id
            WHERE wm.user_id = :user_id AND wm.status = 'ACTIVE'
            ORDER BY wm.created_at ASC
            LIMIT 1
            '''
)


JOIN_TENANT_WORKSPACES_SELECT_WORKSPACES = text(
    '''SELECT w.id FROM workspaces w
               WHERE lower(w.auto_join_tenant_id) = :tenant_id
                 AND NOT EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id = :user_id)
                 AND NOT EXISTS (SELECT 1 FROM workspace_auto_join_blocks b WHERE b.workspace_id = w.id AND b.user_id = :user_id)'''
)


LIST_SESSIONS_SELECT_SESSIONS = text(
    '''
            SELECT id, refresh_token_hash, ip_address, user_agent, expires_at, created_at, last_used_at
            FROM sessions
            WHERE user_id = :user_id AND revoked_at IS NULL AND expires_at > :now
            ORDER BY last_used_at DESC
            '''
)


LIST_API_KEYS_SELECT_PERSONAL_API_KEYS = text(
    '''
            SELECT id, name, prefix, expires_at, last_used_at, created_at
            FROM personal_api_keys
            WHERE user_id = :user_id
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > :now)
            ORDER BY created_at DESC
            '''
)


UNIQUE_WORKSPACE_SLUG_SELECT_WORKSPACES = text('SELECT 1 FROM workspaces WHERE slug = :slug UNION ALL SELECT 1 FROM workspace_slugs WHERE slug = :slug LIMIT 1')


VERIFY_REGISTRATION_SELECT_REGISTRATION_VERIFICATION_TOKENS = text(
    '''
                SELECT id, email, name, password_hash, timezone, code_hash, expires_at, attempt_count
                FROM registration_verification_tokens
                WHERE email = :email
                FOR UPDATE
                '''
)


UPSERT_MICROSOFT_USER_SELECT_USER_IDENTITIES = text(
    '''SELECT users.id, users.email, users.name, users.username, users.title,
                           users.timezone, users.avatar_url, users.password_hash,
                           users.is_platform_admin, users.email_verified_at, users.status,
                           users.created_at
                    FROM user_identities identity
                    JOIN users ON users.id = identity.user_id
                    WHERE identity.provider = 'MICROSOFT'
                      AND identity.provider_account_id = :provider_account_id
                    FOR UPDATE OF users'''
)


REQUEST_REGISTRATION_VERIFICATION_SELECT_REGISTRATION_VERIFICATION_TOKENS = text(
    '''
                    SELECT last_sent_at FROM registration_verification_tokens
                    WHERE email = :email
                    FOR UPDATE
                    '''
)


REQUEST_REGISTRATION_VERIFICATION_SELECT_REGISTRATION_VERIFICATION_TOKENS_2 = text(
    '''
                        SELECT COUNT(*) FROM registration_verification_tokens
                        WHERE request_fingerprint = :fingerprint
                          AND created_at > :window_start
                        '''
)


UPSERT_MICROSOFT_USER_SELECT_USERS = text('SELECT id FROM users WHERE lower(email) = :email AND id <> :id')


UPSERT_MICROSOFT_USER_SELECT_USER_IDENTITIES_2 = text("SELECT id FROM user_identities WHERE user_id = :id AND provider = 'MICROSOFT'")


def upsert_microsoft_user_select_users_sql(USER_COLUMNS) -> TextClause:
    return text(f'SELECT {USER_COLUMNS} FROM users WHERE lower(email) = :email FOR UPDATE')


CONSUME_RESET_SELECT_USERS = text("SELECT id FROM users WHERE id=:id FOR UPDATE")


CONSUME_RESET_SELECT_PASSWORD_RESET_TOKENS = text("SELECT user_id FROM password_reset_tokens WHERE token_hash=:hash")


ISSUE_RESET_SELECT_USERS = text(
    "SELECT id FROM users WHERE email=:email AND status='ACTIVE' AND password_hash IS NOT NULL FOR UPDATE"
)


CONSUME_RESET_SELECT_PASSWORD_RESET_TOKENS_2 = text("""SELECT r.id,r.user_id FROM password_reset_tokens r
        JOIN users u ON u.id=r.user_id WHERE r.token_hash=:hash AND r.used_at IS NULL
        AND r.expires_at>:now AND u.status='ACTIVE' AND u.password_hash IS NOT NULL FOR UPDATE OF r,u""")


READ_PREFERENCES_SELECT_USER_UI_PREFERENCES = text(
    "SELECT preferences,version FROM user_ui_preferences WHERE user_id=:user"
)


PROFILE_MANAGED_BY_SELECT_USER_IDENTITIES = text(
    """SELECT provider::text FROM user_identities
               WHERE user_id = :user_id AND provider = 'MICROSOFT' LIMIT 1"""
)


UPLOAD_AVATAR_SELECT_USERS = text('SELECT id, name, email, username, title, timezone, avatar_url, created_at FROM users WHERE id = :id')


GET_AVATAR_SELECT_USERS = text('SELECT avatar_url FROM users WHERE id = :id')


WORKSPACE_MEMBER_ACCESS_SELECT_WORKSPACE_MEMBERS = text(
    """SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"""
)


def workspace_members_select_workspace_members_sql(condition) -> TextClause:
    return text(
        f"""SELECT u.id, u.name, u.email, u.username, u.title, u.timezone, u.avatar_url,
                       u.created_at, u.last_seen_at, wm.role, wm.joined_at, wm.created_at AS member_created_at
                FROM workspace_members wm JOIN users u ON u.id = wm.user_id
                WHERE wm.workspace_id = :workspace_id AND wm.status = 'ACTIVE' {condition}
                ORDER BY wm.joined_at ASC"""
    )


WORKSPACE_MEMBERS_SELECT_TEAM_MEMBERS = text(
    """SELECT tm.user_id, tm.role, t.id, t.name, t.identifier, t.icon
               FROM team_members tm JOIN teams t ON t.id = tm.team_id
               WHERE tm.user_id = ANY(:ids) AND t.workspace_id = :workspace_id
                 AND t.archived_at IS NULL"""
)


WORKSPACE_MEMBERS_SELECT_PROJECT_MEMBERS = text(
    """SELECT pm.user_id, p.id, p.name, p.identifier
               FROM project_members pm JOIN projects p ON p.id = pm.project_id
               WHERE pm.user_id = ANY(:ids) AND p.workspace_id = :workspace_id
                 AND p.archived_at IS NULL"""
)
