from sqlalchemy import text

from ...core.clock import _utcnow
from ..access.project_scope import project_read_scope
from .history_sql import history_ctes, scoped_sql
from .repository import workflow_report


async def dashboard_report(db, workspace, user, query, *, now=None):
    now = now or _utcnow()
    result = await workflow_report(db, workspace, user, query, now=now)
    scope, params = scoped_sql(workspace, user["id"], query.selection.options())
    params.update(query.parameters(now))
    sql = (
        history_ctes(scope)
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
    result["data"].update(dict((await db.execute(text(sql), params)).mappings().one()))
    return result
