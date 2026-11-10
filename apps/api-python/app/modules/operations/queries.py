"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

OVERVIEW_SELECT_CLIENT_ERROR_EVENTS = text('''SELECT category,route_kind,COUNT(*) AS count FROM client_error_events
        WHERE workspace_id=:workspace AND created_at>=:cutoff GROUP BY category,route_kind''')


OVERVIEW_SELECT_ISSUE_SLA_JOBS = text('''SELECT COUNT(*) FILTER(WHERE j.failed_at IS NULL AND j.next_attempt_at<=:now) AS pending,
        COUNT(*) FILTER(WHERE j.failed_at IS NOT NULL) AS failed,
        MIN(j.next_attempt_at) FILTER(WHERE j.failed_at IS NULL AND j.next_attempt_at<=:now) AS oldest
        FROM issue_sla_jobs j JOIN issues i ON i.id=j.issue_id LEFT JOIN teams t ON t.id=i.team_id
        WHERE i.workspace_id=:workspace AND t.archived_at IS NULL AND (i.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=i.team_id AND tm.user_id=:user))''')


def overview_select_sql(source, scope) -> TextClause:
    return text(f'''SELECT COUNT(*) FILTER(WHERE e.delivered_at IS NULL AND e.failed_at IS NULL) AS pending,
            COUNT(*) FILTER(WHERE e.failed_at IS NOT NULL) AS failed,
            MIN(e.available_at) FILTER(WHERE e.delivered_at IS NULL AND e.failed_at IS NULL AND e.available_at<=:now) AS oldest
            FROM {source} WHERE {scope}=:workspace''')


VISIBLE_JOBS_SELECT_OPERATION_HEARTBEATS = text("""WITH ranked AS (
        SELECT *,ROW_NUMBER() OVER(PARTITION BY job ORDER BY last_seen_at DESC,instance_id) AS position
        FROM operation_heartbeats WHERE last_seen_at>=:cutoff
    ) SELECT instance_id,job,status,last_seen_at,last_progress_at,failures,last_error_code FROM ranked
        WHERE position=1 OR (status<>'stopped' AND last_seen_at>=:alive)
        ORDER BY CASE WHEN status<>'stopped' AND last_seen_at>=:alive THEN 0 ELSE 1 END,last_seen_at DESC,job,instance_id LIMIT 101""")
