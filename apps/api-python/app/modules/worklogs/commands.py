from sqlalchemy import text

INSERT_WORKLOG = text("""INSERT INTO issue_worklogs(id, issue_id, user_id, work_date, hours, note, created_at, updated_at)
    VALUES (:id, :issue, :user, :work_date, :hours, :note, :now, :now)""")

UPDATE_WORKLOG = text("""UPDATE issue_worklogs SET work_date = :work_date, hours = :hours, note = :note,
    updated_at = :now WHERE id = :id""")

DELETE_WORKLOG = text("DELETE FROM issue_worklogs WHERE id = :id")

# Actual effort in man-days from the logged hours; with no worklog left the sum is NULL, which
# clears the field instead of keeping a figure nothing supports.
# VI: Actual effort tính theo man-day từ số giờ đã ghi; khi không còn worklog thì tổng là NULL,
# VI: xoá trường này thay vì giữ một con số không còn căn cứ.
SYNC_ACTUAL_EFFORT = text("""UPDATE issues SET updated_at = :now, actual_effort = (
        SELECT ROUND(CAST(SUM(hours) / :hours_per_day AS numeric), 2) FROM issue_worklogs WHERE issue_id = :issue)
    WHERE id = :issue RETURNING actual_effort""")
