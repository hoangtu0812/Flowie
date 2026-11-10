"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

CYCLE_SELECT_CYCLES = text('SELECT * FROM cycles WHERE id = :cycle_id AND workspace_id = :workspace_id LIMIT 1')


CYCLE_SELECT_ISSUE_CYCLES = text(
    '''SELECT ic.issue_id, ic.created_at, i.updated_at, i.completed_at, s.category AS status_category
               FROM issue_cycles ic
               JOIN issues i ON i.id = ic.issue_id
               JOIN issue_statuses s ON s.id = i.status_id
               WHERE ic.cycle_id = :cycle_id AND i.archived_at IS NULL
               ORDER BY ic.created_at'''
)


RECONCILE_SCHEDULE_STATUSES_SELECT_CYCLES = text(
    '''SELECT id, status, start_date, end_date
               FROM cycles
               WHERE workspace_id = :workspace_id AND team_id = :team_id
                 AND status IN ('UPCOMING', 'ACTIVE')'''
)


CYCLE_ISSUES_SELECT_ISSUE_CYCLES = text('''SELECT issue_id FROM issue_cycles WHERE cycle_id = :cycle_id ORDER BY created_at DESC''')


def list_cycles_select_cycles_sql(status_filter: bool) -> TextClause:
    # PostgreSQL cannot infer the type of a nullable bind reused in an
    # ``:status IS NULL OR ...`` predicate. Omit the predicate when no filter
    # is requested; this is also the natural query for the Cycles timeline.
    # VI: PostgreSQL không suy được kiểu của bind nullable dùng lại trong mệnh đề
    # VI: ``:status IS NULL OR ...``. Bỏ mệnh đề khi không lọc; đây cũng là truy
    # VI: vấn tự nhiên cho timeline Cycles.
    query = '''SELECT id FROM cycles WHERE workspace_id = :workspace_id AND team_id = :team_id'''
    if status_filter:
        query += ' AND status = :status'
    query += ' ORDER BY start_date DESC NULLS LAST, created_at DESC'
    return text(query)
