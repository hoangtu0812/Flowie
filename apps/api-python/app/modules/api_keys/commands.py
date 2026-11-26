from __future__ import annotations

from sqlalchemy import text

CREATE_INSERT_WORKSPACE_API_KEYS = text("""INSERT INTO workspace_api_keys
        (id,workspace_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
        VALUES (:id,:workspace,:user,:name,:prefix,:hash,:scopes,:expires,:now) RETURNING *""")


REVOKE_UPDATE_WORKSPACE_API_KEYS = text("""UPDATE workspace_api_keys SET revoked_at=:now
        WHERE id=:id AND workspace_id=:workspace AND revoked_at IS NULL RETURNING name""")


# Only an inactive (revoked or expired) key may be deleted; an active key is revoked first.
# VI: Chỉ xoá được key không còn hoạt động (đã thu hồi hoặc hết hạn); key đang dùng phải thu hồi trước.
DELETE_DELETE_WORKSPACE_API_KEYS = text("""DELETE FROM workspace_api_keys
        WHERE id=:id AND workspace_id=:workspace AND (revoked_at IS NOT NULL OR expires_at<=:now) RETURNING name""")


# Marks the key used and counts this call in its per-minute window.
# VI: Ghi lần dùng cuối và đếm lời gọi này trong cửa sổ mỗi phút của key.
USE_UPDATE_WORKSPACE_API_KEYS = text("""UPDATE workspace_api_keys SET last_used_at=:now,
        rate_count=CASE WHEN rate_window=date_trunc('minute',CAST(:now AS timestamp)) THEN rate_count+1 ELSE 1 END,
        rate_window=date_trunc('minute',CAST(:now AS timestamp)) WHERE id=:id RETURNING rate_count""")


AUDIT_INSERT_AUDIT_LOGS = text("""INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:user,:action,'api-key',:key,CAST(:metadata AS jsonb),:now)""")
