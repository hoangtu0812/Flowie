"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def archive_page_select_sql(table, predicate) -> TextClause:
    return text(f"SELECT COUNT(*) FROM {table} e WHERE {predicate}")


def record_select_sql(table, scope, kind, lock) -> TextClause:
    return text(
        f"SELECT e.* FROM {table} e WHERE {scope(kind)} AND e.id=:id"
        + (" FOR UPDATE OF e" if lock else "")
    )


def archive_page_select_sql_2(title, table, predicate) -> TextClause:
    return text(
        f"SELECT e.id,e.{title} AS title,e.archived_at,e.updated_at FROM {table} e WHERE {predicate} ORDER BY e.archived_at DESC,e.id DESC LIMIT :limit"
    )


ARCHIVE_PROJECT_SELECT_ISSUES = text("""SELECT 1 FROM issues i WHERE i.project_id=:id AND i.workspace_id=:workspace AND i.archived_at IS NULL
        AND i.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id
        WHERE tm.team_id=i.team_id AND tm.user_id=:user AND t.archived_at IS NULL) LIMIT 1""")


RESTORE_PREVIEW_SELECT_ACTIVITIES = text(
    "SELECT 1 FROM activities WHERE issue_id=:id AND type IN ('issue.merged','issue.converted_to_comment') LIMIT 1"
)


def restore_preview_select_issues_sql(archive_scope) -> TextClause:
    return text(
        f"SELECT COUNT(*) FROM issues e WHERE {archive_scope('issue')} AND e.project_id=:id"
    )


ARCHIVE_PROJECT_SELECT_PROJECTS = text(
    "SELECT * FROM projects WHERE id=:id AND workspace_id=:workspace AND archived_at IS NULL FOR UPDATE"
)


def restore_preview_select_teams_sql(lock) -> TextClause:
    return text(
        "SELECT archived_at,deleted_at FROM teams WHERE id=:id AND workspace_id=:workspace"
        + (" FOR SHARE" if lock else "")
    )


def restore_preview_select_sql(table, lock) -> TextClause:
    return text(
        f"SELECT 1 FROM {table} WHERE id=:id AND workspace_id=:workspace AND archived_at IS NULL"
        + (" FOR SHARE" if lock else "")
    )
