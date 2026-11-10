"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

CREATE_CYCLE_INSERT_CYCLES = text(
    '''INSERT INTO cycles (id, workspace_id, team_id, name, description, status, start_date, end_date, created_at, updated_at)
               VALUES (:id, :workspace_id, :team_id, :name, :description, :status, :start_date, :end_date, :now, :now)'''
)


ADD_ISSUE_INSERT_ISSUE_CYCLES = text('''INSERT INTO issue_cycles (issue_id, cycle_id) VALUES (:issue_id, :cycle_id)
                ON CONFLICT DO NOTHING''')


REMOVE_ISSUE_DELETE_ISSUE_CYCLES = text('DELETE FROM issue_cycles WHERE cycle_id = :cycle_id AND issue_id = :issue_id RETURNING issue_id')


DELETE_CYCLE_DELETE_CYCLES = text('DELETE FROM cycles WHERE id = :cycle_id AND workspace_id = :workspace_id')


RECONCILE_SCHEDULE_STATUSES_UPDATE_CYCLES = text('UPDATE cycles SET status = :status, updated_at = :updated_at WHERE id = :id')


def update_cycle_update_cycles_sql(sets) -> TextClause:
    return text(f"UPDATE cycles SET {', '.join(sets)}, updated_at = :now WHERE id = :cycle_id")
