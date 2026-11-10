"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

WORKSPACE_ROLE_SELECT_WORKSPACE_MEMBERS = text(
    "SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"
)


OWNER_SELECT_WORKSPACE_MEMBERS = text("""SELECT role FROM workspace_members
            WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'
            FOR SHARE""")


WORKSPACE_ACCESS_SELECT_WORKSPACE_MEMBERS = text(
    "SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"
)


WORKSPACE_MANAGER_SELECT_WORKSPACE_MEMBERS = text(
    "SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"
)


TEAM_ACCESS_SELECT_TEAMS = text(
    """SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.id = :team_id AND t.workspace_id = :workspace_id AND t.archived_at IS NULL AND tm.user_id = :user_id"""
)


ENFORCE_READ_ONLY_ROLE_SELECT_WORKSPACE_MEMBERS = text("SELECT workspace_id, role FROM workspace_members WHERE user_id = :user AND status = 'ACTIVE'")
