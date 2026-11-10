"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

RECORD_CHANGE_INSERT_AUDIT_LOGS = text("""INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:actor,:action,:entity,:identifier,CAST(:metadata AS jsonb),:now)""")
