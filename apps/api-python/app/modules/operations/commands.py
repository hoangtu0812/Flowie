"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

CLIENT_ERROR_INSERT_CLIENT_ERROR_EVENTS = text('''INSERT INTO client_error_events(id,workspace_id,actor_id,category,route_kind,digest,created_at)
        VALUES (:id,:workspace,:user,:category,:route,:digest,:now)''')


HEARTBEAT_INSERT_OPERATION_HEARTBEATS = text('''INSERT INTO operation_heartbeats(id,instance_id,job,status,last_seen_at,last_progress_at,failures,last_error_code)
            VALUES (:id,:instance,:job,COALESCE(:status,'running'),:now,:progress,:failed,:error)
            ON CONFLICT(instance_id,job) DO UPDATE SET status=COALESCE(:status,operation_heartbeats.status),last_seen_at=:now,
            last_progress_at=COALESCE(:progress,operation_heartbeats.last_progress_at),
            failures=operation_heartbeats.failures+:failed,last_error_code=CASE WHEN :progress IS NOT NULL THEN NULL ELSE COALESCE(:error,operation_heartbeats.last_error_code) END''')
