from __future__ import annotations

from sqlalchemy import text

LIST_SELECT_WORKSPACE_API_KEYS = text("""SELECT k.*,u.name AS created_by FROM workspace_api_keys k
        JOIN users u ON u.id=k.user_id WHERE k.workspace_id=:workspace ORDER BY k.created_at DESC LIMIT 200""")


# The key stops working once its creator is no longer an active member of the workspace.
# VI: Key ngừng hoạt động khi người tạo không còn là thành viên đang hoạt động của workspace.
AUTHENTICATE_SELECT_WORKSPACE_API_KEYS = text("""SELECT k.id,k.workspace_id,k.scopes FROM workspace_api_keys k
        JOIN users u ON u.id=k.user_id
        JOIN workspace_members wm ON wm.workspace_id=k.workspace_id AND wm.user_id=k.user_id
        WHERE k.token_hash=:hash AND k.revoked_at IS NULL AND k.expires_at>:now
        AND u.status='ACTIVE' AND wm.status='ACTIVE'""")
