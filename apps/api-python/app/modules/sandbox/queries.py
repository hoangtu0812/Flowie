from sqlalchemy import text

ISSUE_WORKSPACE_SELECT_ISSUES = text('SELECT workspace_id FROM issues WHERE id=:id')

# The workspace of the issue a session is named after ("DTD-7-flowie" -> DTD-7), among the
# person's active workspaces.
# VI: Workspace của task mà phiên mang tên ("DTD-7-flowie" -> DTD-7), trong các workspace
# VI: người đó đang tham gia.
NOTIFY_ISSUE_WORKSPACE_SELECT_ISSUES = text(
    """SELECT i.workspace_id FROM issues i
       JOIN workspace_members m ON m.workspace_id = i.workspace_id AND m.user_id = :user AND m.status = 'ACTIVE'
       WHERE i.identifier = :identifier ORDER BY i.created_at DESC LIMIT 1"""
)

NOTIFY_FIRST_WORKSPACE_SELECT_WORKSPACE_MEMBERS = text(
    """SELECT workspace_id FROM workspace_members WHERE user_id = :user AND status = 'ACTIVE'
       ORDER BY created_at, workspace_id LIMIT 1"""
)
