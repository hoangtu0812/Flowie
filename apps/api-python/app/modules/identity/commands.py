"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

UPDATE_USER_INSERT_AUDIT_LOGS = text(
    '''INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :actor_id, 'admin.user.updated', 'user', :entity_id, CAST(:metadata AS jsonb), :now)'''
)


def update_user_update_users_sql(sets) -> TextClause:
    return text(f"UPDATE users SET {', '.join(sets)} WHERE id = :id")


UPDATE_USER_UPDATE_SESSIONS = text(
    'UPDATE sessions SET revoked_at = :now WHERE user_id = :id AND revoked_at IS NULL'
)


CREATE_WORKSPACE_BOOTSTRAP_INSERT_ORGANIZATIONS = text(
    '''
            INSERT INTO organizations (id, name, slug, owner_id, created_at, updated_at)
            VALUES (:id, :name, :slug, :owner_id, :now, :now)
            '''
)


CREATE_WORKSPACE_BOOTSTRAP_INSERT_WORKSPACES = text(
    '''
            INSERT INTO workspaces (id, organization_id, name, slug, timezone, created_at, updated_at)
            VALUES (:id, :organization_id, :name, :slug, 'UTC', :now, :now)
            '''
)


CREATE_WORKSPACE_BOOTSTRAP_INSERT_WORKSPACE_MEMBERS = text(
    '''
            INSERT INTO workspace_members (id, workspace_id, user_id, status, role, joined_at, created_at, updated_at)
            VALUES (:id, :workspace_id, :user_id, 'ACTIVE', 'OWNER', :now, :now, :now)
            '''
)


CREATE_WORKSPACE_BOOTSTRAP_INSERT_TEAMS = text(
    '''
            INSERT INTO teams (id, workspace_id, name, identifier, description, created_at, updated_at)
            VALUES (:id, :workspace_id, 'General', 'GEN', 'Default team for this workspace.', :now, :now)
            '''
)


CREATE_WORKSPACE_BOOTSTRAP_INSERT_TEAM_MEMBERS = text("INSERT INTO team_members (team_id, user_id, role) VALUES (:team_id, :user_id, 'LEAD')")


LOGIN_UPDATE_USERS = text('''UPDATE users SET last_login_at = :now, last_seen_at = :now,
                    timezone = COALESCE((SELECT preferences->>'timezone' FROM user_ui_preferences WHERE user_id=users.id), :timezone, timezone),
                    is_platform_admin = :is_platform_admin, updated_at = :now
                WHERE id = :id''')


REFRESH_PRESENCE_UPDATE_USERS = text('UPDATE users SET last_seen_at = :now WHERE id = :id')


REVOKE_API_KEY_UPDATE_PERSONAL_API_KEYS = text(
    '''
            UPDATE personal_api_keys
            SET revoked_at = :now
            WHERE id = :id AND user_id = :user_id AND revoked_at IS NULL
            RETURNING id
            '''
)


CREATE_WORKSPACE_BOOTSTRAP_INSERT_WORKSPACE_AGENT_TOOLS = text('''INSERT INTO workspace_agent_tools (id, workspace_id, tool_key, created_at, updated_at)
                    VALUES (:id, :workspace_id, :tool_key, :now, :now)''')


CREATE_WORKSPACE_BOOTSTRAP_INSERT_ISSUE_STATUSES = text(
    '''
                INSERT INTO issue_statuses (id, workspace_id, name, category, color, position, created_at, updated_at)
                VALUES (:id, :workspace_id, :name, :category, :color, :position, :now, :now)
                '''
)


VERIFY_REGISTRATION_INSERT_USERS = text(
    '''
                INSERT INTO users (
                    id, email, name, timezone, password_hash, is_platform_admin,
                    email_verified_at, status, created_at, updated_at
                ) VALUES (
                    :id, :email, :name, :timezone, :password_hash, :is_platform_admin,
                    :email_verified_at, :status, :created_at, :updated_at
                )
                '''
)


VERIFY_REGISTRATION_INSERT_USER_IDENTITIES = text(
    '''
                INSERT INTO user_identities (
                    id, user_id, provider, provider_account_id, email, created_at, updated_at
                ) VALUES (:id, :user_id, 'LOCAL', :provider_account_id, :email, :now, :now)
                '''
)


VERIFY_REGISTRATION_DELETE_REGISTRATION_VERIFICATION_TOKENS = text('DELETE FROM registration_verification_tokens WHERE id = :id')


JOIN_TENANT_WORKSPACES_INSERT_WORKSPACE_MEMBERS = text(
    '''INSERT INTO workspace_members (id, workspace_id, user_id, status, role, joined_at, created_at, updated_at)
                   VALUES (:id, :workspace_id, :user_id, 'ACTIVE', 'MEMBER', :now, :now, :now)
                   ON CONFLICT (workspace_id, user_id) DO NOTHING RETURNING id'''
)


JOIN_TENANT_WORKSPACES_INSERT_AUDIT_LOGS = text(
    '''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
                   VALUES (:id, :workspace_id, :actor_id, 'workspace.member.auto_joined', 'workspace-member', :entity_id, CAST('{}' AS jsonb), :now)'''
)


UPSERT_MICROSOFT_USER_UPDATE_USERS = text(
    '''UPDATE users SET name = :name, email = :email,
                       auth_version = auth_version + CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END,
                       password_hash = NULL,
                       timezone = COALESCE((SELECT preferences->>'timezone' FROM user_ui_preferences WHERE user_id=users.id), :timezone, timezone),
                       is_platform_admin = (CAST(:is_environment_admin AS boolean) OR platform_role IS NOT NULL),
                       email_verified_at = COALESCE(email_verified_at, :now),
                       last_login_at = :now, last_seen_at = :now, updated_at = :now
                   WHERE id = :id'''
)


UPSERT_MICROSOFT_USER_DELETE_USER_IDENTITIES = text("DELETE FROM user_identities WHERE user_id = :id AND provider = 'LOCAL'")


UPSERT_MICROSOFT_USER_UPDATE_USER_IDENTITIES = text(
    '''UPDATE user_identities SET email = :email, tenant_id = :tenant_id, updated_at = :now
                   WHERE provider = 'MICROSOFT' AND provider_account_id = :provider_account_id'''
)


MICROSOFT_CALLBACK_UPDATE_USERS = text(
    'UPDATE users SET avatar_url = :avatar_url, updated_at = :now WHERE id = :id'
)


REQUEST_REGISTRATION_VERIFICATION_DELETE_REGISTRATION_VERIFICATION_TOKENS = text(
    '''
                    DELETE FROM registration_verification_tokens WHERE email = :email
                    '''
)


REQUEST_REGISTRATION_VERIFICATION_INSERT_REGISTRATION_VERIFICATION_TOKENS = text(
    '''
                    INSERT INTO registration_verification_tokens (
                        id, email, name, password_hash, timezone, code_hash, request_fingerprint,
                        expires_at, created_at, last_sent_at
                    ) VALUES (
                        :id, :email, :name, :password_hash, :timezone, :code_hash, :request_fingerprint,
                        :expires_at, :created_at, :last_sent_at
                    )
                    '''
)


REQUEST_REGISTRATION_VERIFICATION_DELETE_REGISTRATION_VERIFICATION_TOKENS_2 = text('DELETE FROM registration_verification_tokens WHERE email = :email AND code_hash = :code_hash')


VERIFY_REGISTRATION_UPDATE_REGISTRATION_VERIFICATION_TOKENS = text('UPDATE registration_verification_tokens SET attempt_count = attempt_count + 1 WHERE id = :id')


UPSERT_MICROSOFT_USER_UPDATE_SESSIONS = text('UPDATE sessions SET revoked_at = :now WHERE user_id = :id AND revoked_at IS NULL')


VERIFY_REGISTRATION_DELETE_REGISTRATION_VERIFICATION_TOKENS_2 = text('DELETE FROM registration_verification_tokens WHERE id = :id')


UPSERT_MICROSOFT_USER_INSERT_USER_IDENTITIES = text(
    '''INSERT INTO user_identities (
                               id, user_id, provider, provider_account_id, email, tenant_id,
                               created_at, updated_at
                           ) VALUES (
                               :id, :user_id, 'MICROSOFT', :provider_account_id, :email,
                               :tenant_id, :now, :now
                           )'''
)


UPSERT_MICROSOFT_USER_INSERT_USERS = text(
    '''INSERT INTO users (
                               id, email, name, timezone, password_hash, is_platform_admin,
                               email_verified_at, status, created_at, updated_at, last_login_at,
                               last_seen_at
                           ) VALUES (
                               :id, :email, :name, :timezone, NULL, :is_platform_admin,
                               :now, 'ACTIVE', :now, :now, :now, :now
                           )'''
)


UPSERT_MICROSOFT_USER_INSERT_USER_IDENTITIES_2 = text(
    '''INSERT INTO user_identities (
                               id, user_id, provider, provider_account_id, email, tenant_id,
                               created_at, updated_at
                           ) VALUES (
                               :id, :user_id, 'MICROSOFT', :provider_account_id, :email,
                               :tenant_id, :now, :now
                           )'''
)


LIMIT_REQUEST_DELETE_AUTH_RATE_LIMITS = text("DELETE FROM auth_rate_limits WHERE window_start<:cutoff")


ISSUE_RESET_UPDATE_PASSWORD_RESET_TOKENS = text(
    "UPDATE password_reset_tokens SET used_at=:now WHERE user_id=:user AND used_at IS NULL"
)


ISSUE_RESET_INSERT_PASSWORD_RESET_TOKENS = text("""INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,created_at)
        VALUES (:id,:user,:hash,:expires,:now)""")


CONSUME_RESET_UPDATE_USERS = text(
    "UPDATE users SET password_hash=:password, auth_version=auth_version+1, updated_at=:now WHERE id=:user"
)


CONSUME_RESET_UPDATE_PASSWORD_RESET_TOKENS = text(
    "UPDATE password_reset_tokens SET used_at=:now WHERE user_id=:user AND used_at IS NULL"
)


def consume_reset_update_sql(table) -> TextClause:
    return text(
        f"UPDATE {table} SET revoked_at=:now WHERE user_id=:user AND revoked_at IS NULL"
    )


LIMIT_REQUEST_INSERT_AUTH_RATE_LIMITS = text("""INSERT INTO auth_rate_limits (key,window_start,count)
        VALUES (:key,:now,1) ON CONFLICT(key) DO UPDATE SET
        count=CASE WHEN auth_rate_limits.window_start<:cutoff THEN 1 ELSE auth_rate_limits.count+1 END,
        window_start=CASE WHEN auth_rate_limits.window_start<:cutoff THEN :now ELSE auth_rate_limits.window_start END
        RETURNING count""")


WRITE_PREFERENCES_UPDATE_USERS = text("UPDATE users SET timezone=:zone,updated_at=:now WHERE id=:user")


UPLOAD_AVATAR_UPDATE_USERS = text(
    '''UPDATE users
               SET avatar_url = :object_key, updated_at = CURRENT_TIMESTAMP
               WHERE id = :id'''
)


def update_me_update_users_sql(updates) -> TextClause:
    return text(
        f'''UPDATE users SET {', '.join(updates)} WHERE id = :id
                    RETURNING id, name, email, username, title, timezone, avatar_url, created_at'''
    )


WRITE_PREFERENCES_INSERT_USER_UI_PREFERENCES = text(
    "INSERT INTO user_ui_preferences(user_id,preferences,updated_at) VALUES (:user,CAST(:values AS jsonb),:now) ON CONFLICT(user_id) DO NOTHING RETURNING version,preferences"
)


WRITE_PREFERENCES_UPDATE_USER_UI_PREFERENCES = text(
    "UPDATE user_ui_preferences SET preferences=preferences || CAST(:values AS jsonb),version=version+1,updated_at=:now WHERE user_id=:user AND version=:expected RETURNING version,preferences"
)
