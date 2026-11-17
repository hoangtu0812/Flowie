from sqlalchemy import text

from ..access.team_scope import workspace_team_scope

# Every worklog of one issue, newest work day first, with the person who logged it.
# VI: Mọi worklog của một issue, ngày làm mới nhất trước, kèm người đã ghi.
LIST_WORKLOGS = text("""SELECT w.id, w.issue_id, w.user_id, w.work_date, w.hours, w.note,
        w.created_at, w.updated_at, u.name AS user_name, u.avatar_url AS user_avatar_url
    FROM issue_worklogs w JOIN users u ON u.id = w.user_id
    WHERE w.issue_id = :issue
    ORDER BY w.work_date DESC, w.created_at DESC""")

# Serializes worklog writes on one issue so the recomputed actual effort sees every row.
# VI: Ghi worklog trên một issue lần lượt để actual effort tính lại thấy đủ mọi dòng.
LOCK_ISSUE = text("SELECT id FROM issues WHERE id = :issue FOR UPDATE")

SELECT_WORKLOG = text(
    "SELECT id, user_id FROM issue_worklogs WHERE id = :id AND issue_id = :issue FOR UPDATE"
)

# Worklogs are counted only on unarchived issues the viewer may read, in the viewer's teams;
# the optional team and project filters narrow that set and never widen it.
# VI: Chỉ tính worklog trên issue chưa archive mà người xem đọc được, trong team của họ; bộ lọc
# VI: team và dự án tuỳ chọn chỉ thu hẹp tập này, không bao giờ mở rộng.
_TIMESHEET_SCOPE = f"""{workspace_team_scope("i")}
    AND w.work_date >= :start AND w.work_date < :end
    AND (CAST(:team AS text) IS NULL OR i.team_id = :team)
    AND (CAST(:project AS text) IS NULL OR i.project_id = :project)"""

TIMESHEET_TOTALS = text(f"""SELECT w.user_id, u.name AS user_name, u.avatar_url AS user_avatar_url,
        w.work_date, SUM(w.hours) AS hours
    FROM issue_worklogs w JOIN issues i ON i.id = w.issue_id JOIN users u ON u.id = w.user_id
    WHERE {_TIMESHEET_SCOPE}
    GROUP BY w.user_id, u.name, u.avatar_url, w.work_date""")

TIMESHEET_ENTRIES = text(f"""SELECT w.work_date, u.name AS user_name, u.email AS user_email,
        i.identifier, i.title, p.name AS project_name, w.hours, w.note
    FROM issue_worklogs w JOIN issues i ON i.id = w.issue_id JOIN users u ON u.id = w.user_id
    LEFT JOIN projects p ON p.id = i.project_id
    WHERE {_TIMESHEET_SCOPE}
    ORDER BY w.work_date, u.name, i.identifier""")
