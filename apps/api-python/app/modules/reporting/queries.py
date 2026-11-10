"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text

from ..access.project_scope import project_read_scope


def change_page_select_changes_sql(ctes) -> TextClause:
    return text(ctes + "SELECT COUNT(*) FROM changes")


def project_page_select_grouped_sql(ctes) -> TextClause:
    return text(ctes + "SELECT COUNT(*) FROM grouped")


def change_page_select_changes_sql_2(ctes, predicate) -> TextClause:
    return text(
        ctes
        # The users join is on its primary key, so it keeps one row per change and the cursor order.
        # VI: Join users theo khóa chính nên vẫn một dòng cho mỗi thay đổi và giữ thứ tự con trỏ.
        + "SELECT c.*,u.name AS actor_name,u.avatar_url AS actor_avatar_url FROM changes c"
        + " LEFT JOIN users u ON u.id=c.actor_id"
        + predicate
        + " ORDER BY c.occurred_at DESC,c.id DESC LIMIT :limit"
    )


def project_page_select_grouped_sql_2(ctes, predicate) -> TextClause:
    return text(
        ctes
        + "SELECT * FROM grouped"
        + predicate
        + " ORDER BY created_at DESC,id DESC LIMIT :limit"
    )


def workload_page_select_grouped_sql(ctes) -> TextClause:
    return text(ctes + "SELECT COUNT(*) FROM grouped")


def workload_page_select_grouped_sql_2(ctes, predicate) -> TextClause:
    return text(
        ctes
        + "SELECT g.*,u.name FROM grouped g LEFT JOIN users u ON u.id=g.assignee_id"
        + predicate
        + " ORDER BY g.week,g.key LIMIT :limit"
    )


def dashboard_report_select_sql(ctes) -> TextClause:
    return text(
        ctes
        + """, latest_completion AS (
        SELECT issue_id,MAX(completed_at) AS at FROM episodes
        WHERE completion_visible GROUP BY issue_id
    ), effort AS (
        SELECT d.day::text AS day,
            COALESCE((SELECT SUM(i.estimated_effort) FROM scoped i WHERE i.start_date::date=d.day),0) AS estimated,
            COALESCE((SELECT SUM(i.actual_effort) FROM scoped i JOIN latest_completion c ON c.issue_id=i.id
                WHERE c.at>=d.starts AND c.at<d.ends),0) AS actual FROM days d
    ), completion_counts AS (
        SELECT issue_id,COUNT(*) AS count FROM episodes
        WHERE completion_visible AND completed_at>=:start AND completed_at<:until GROUP BY issue_id
    ), project_groups AS (
        SELECT COALESCE(p.id,'none') AS id,p.id AS project_id,p.name,
            COUNT(*) FILTER(WHERE i.created_at>=:start AND i.created_at<:until AND i.created_at<=:now) AS created,
            COALESCE(SUM(c.count),0) AS completed,
            COALESCE(SUM(i.estimated_effort),0) AS estimated,COALESCE(SUM(i.actual_effort),0) AS actual
        FROM scoped i LEFT JOIN projects p ON p.id=i.project_id AND """
        + project_read_scope()
        + """
        LEFT JOIN completion_counts c ON c.issue_id=i.id GROUP BY p.id,p.name
    ), throughput_top AS (
        SELECT * FROM project_groups ORDER BY created+completed DESC,id LIMIT 8
    ), effort_top AS (
        SELECT * FROM project_groups ORDER BY estimated+actual DESC,id LIMIT 8
    ), member_groups AS (
        -- Current status per assignee over readable scoped issues only; canceled work is excluded.
        -- VI: Trạng thái hiện tại theo người được giao, chỉ trên issue đọc được; bỏ issue đã hủy.
        SELECT COALESCE(i.assignee_id,'none') AS id,i.assignee_id,u.name,
            COUNT(*) FILTER(WHERE i.category NOT IN ('STARTED','COMPLETED')) AS todo,
            COUNT(*) FILTER(WHERE i.category='STARTED') AS started,
            COUNT(*) FILTER(WHERE i.category='COMPLETED') AS done,
            COALESCE(SUM(i.estimated_effort),0) AS estimated,COALESCE(SUM(i.actual_effort),0) AS actual
        FROM scoped i LEFT JOIN users u ON u.id=i.assignee_id
        WHERE i.category<>'CANCELED' GROUP BY i.assignee_id,u.name
    ), member_top AS (
        SELECT * FROM member_groups ORDER BY todo+started+done DESC,name,id LIMIT 10
    ) SELECT
        COALESCE((SELECT json_agg(effort ORDER BY day) FROM effort),'[]'::json) AS effort,
        COALESCE((SELECT json_agg(throughput_top ORDER BY created+completed DESC,id) FROM throughput_top),'[]'::json) AS "projectThroughput",
        COALESCE((SELECT json_agg(effort_top ORDER BY estimated+actual DESC,id) FROM effort_top),'[]'::json) AS "projectEffort",
        (SELECT COUNT(*) FROM project_groups) AS "projectGroups",
        COALESCE((SELECT json_agg(member_top ORDER BY todo+started+done DESC,name,id) FROM member_top),'[]'::json) AS "memberGroups",
        (SELECT COUNT(*) FROM member_groups) AS "memberCount",
        (SELECT COUNT(*) FROM scoped WHERE estimated_effort IS NOT NULL AND start_date IS NULL) AS "missingEstimatedDates",
        (SELECT COUNT(*) FROM scoped i WHERE actual_effort IS NOT NULL AND NOT EXISTS(
            SELECT 1 FROM latest_completion c WHERE c.issue_id=i.id)) AS "missingActualDates"
    """
    )


def workflow_report_select_sql(ctes) -> TextClause:
    return text(
        ctes
        + """, summary AS (
        SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE category NOT IN ('COMPLETED','CANCELED')) AS open,
            COUNT(*) FILTER(WHERE category='STARTED') AS wip,
            COUNT(*) FILTER(WHERE category='COMPLETED') AS completed,
            COUNT(*) FILTER(WHERE category='CANCELED') AS canceled,
            COUNT(*) FILTER(WHERE category NOT IN ('COMPLETED','CANCELED') AND due_date<:now) AS overdue,
            COUNT(*) FILTER(WHERE created_at>=:start AND created_at<:until AND created_at<=:now) AS created_in_range,
            COALESCE(SUM(estimated_effort),0) AS estimated_effort,COALESCE(SUM(actual_effort),0) AS actual_effort
        FROM scoped
    ), flow AS (
        SELECT COUNT(*) AS observed_completions,COUNT(lead_seconds) AS lead_samples,COUNT(cycle_seconds) AS cycle_samples,
            AVG(lead_seconds) AS lead_mean_seconds,percentile_cont(0.5) WITHIN GROUP(ORDER BY lead_seconds) AS lead_p50_seconds,
            percentile_cont(0.85) WITHIN GROUP(ORDER BY lead_seconds) AS lead_p85_seconds,
            AVG(cycle_seconds) AS cycle_mean_seconds,percentile_cont(0.5) WITHIN GROUP(ORDER BY cycle_seconds) AS cycle_p50_seconds,
            percentile_cont(0.85) WITHIN GROUP(ORDER BY cycle_seconds) AS cycle_p85_seconds
        FROM samples
    ), age_counts AS (
        SELECT COUNT(*) FILTER(WHERE seconds IS NULL) AS unknown,
            COUNT(*) FILTER(WHERE seconds<604800) AS under_7_days,
            COUNT(*) FILTER(WHERE seconds>=604800 AND seconds<1209600) AS days_7_14,
            COUNT(*) FILTER(WHERE seconds>=1209600 AND seconds<2592000) AS days_14_30,
            COUNT(*) FILTER(WHERE seconds>=2592000) AS days_30_plus FROM aging
    ), reopens AS (
        SELECT COUNT(*) AS reopened,COUNT(*) FILTER(WHERE issue_type='BUG') AS bugs_reopened FROM ordered
        WHERE readable AND from_category='COMPLETED' AND to_category NOT IN ('COMPLETED','CANCELED') AND to_archived_at IS NULL
            AND occurred_at>=:start AND occurred_at<:until
    ), statuses AS (
        SELECT i.status_id AS id,s.name,s.color,s.category::text AS category,COUNT(*) AS count FROM scoped i JOIN issue_statuses s ON s.id=i.status_id
        GROUP BY i.status_id,s.name,s.color,s.category ORDER BY count DESC,i.status_id LIMIT 1001
    ) SELECT (SELECT row_to_json(summary) FROM summary) AS summary,(SELECT row_to_json(flow) FROM flow) AS flow,
        (SELECT row_to_json(age_counts) FROM age_counts) AS aging,(SELECT row_to_json(reopens) FROM reopens) AS reopens,
        COALESCE((SELECT json_agg(trend) FROM trend),'[]'::json) AS trend,
        COALESCE((SELECT json_agg(statuses) FROM statuses),'[]'::json) AS statuses"""
    )
