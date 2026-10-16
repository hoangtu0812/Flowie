from datetime import datetime

from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.pagination import CursorCodec
from ..access.projects import _workspace_access
from .history_sql import history_ctes, scoped_sql


async def workflow_report(db, workspace, user, query, *, now=None):
    await _workspace_access(db, workspace, user["id"])
    now = now or _utcnow()
    scope, params = scoped_sql(workspace, user["id"], query.selection.options())
    params.update(query.parameters(now))
    sql = (
        history_ctes(scope)
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
    result = dict((await db.execute(text(sql), params)).mappings().one())
    if len(result["statuses"]) > 1000:
        raise ApiError(
            400, "Too many status groups. Narrow the report filters.", "Bad Request"
        )
    result["asOf"] = now
    return {"data": result}


async def workload_page(db, workspace, user, query, secret, *, cursor=None, limit=50):
    await _workspace_access(db, workspace, user["id"])
    scope, params = scoped_sql(workspace, user["id"], query.selection.options())
    params.update(query.parameters(_utcnow()))
    ctes = (
        """WITH scoped AS ("""
        + scope
        + """), grouped AS (
        SELECT COALESCE(start_date::date-((EXTRACT(ISODOW FROM start_date)::int-1-:week_start+7)%7),DATE '0001-01-01') AS week,
            COALESCE('u:'||assignee_id,'none') AS key,assignee_id,COUNT(*) AS count,COALESCE(SUM(estimated_effort),0) AS estimated_effort,
            COUNT(*) FILTER(WHERE estimated_effort IS NULL) AS missing_estimates,COUNT(*) FILTER(WHERE due_date<:now) AS overdue
        FROM scoped WHERE category NOT IN ('COMPLETED','CANCELED') AND (start_date IS NULL OR start_date::date BETWEEN :from_date AND :to_date)
        GROUP BY week,assignee_id
    ) """
    )
    total = (
        await db.execute(text(ctes + "SELECT COUNT(*) FROM grouped"), params)
    ).scalar_one()
    codec = CursorCodec(
        secret,
        user["id"],
        "workflow-workload",
        {"workspace": workspace, **query.model_dump(mode="json")},
    )
    predicate = ""
    if cursor:
        after, identifier = codec.decode(cursor)
        params.update(after=after.date(), after_id=identifier)
        predicate = " WHERE (g.week,g.key)>(:after,:after_id)"
    rows = (
        (
            await db.execute(
                text(
                    ctes
                    + "SELECT g.*,u.name FROM grouped g LEFT JOIN users u ON u.id=g.assignee_id"
                    + predicate
                    + " ORDER BY g.week,g.key LIMIT :limit"
                ),
                {**params, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    return {
        "data": [
            {
                "id": row["week"].isoformat() + ":" + row["key"],
                "week": row["week"].isoformat() if row["week"].year > 1 else None,
                "assigneeId": row["assignee_id"],
                "assigneeName": row["name"],
                "count": row["count"],
                "estimatedEffort": row["estimated_effort"],
                "missingEstimates": row["missing_estimates"],
                "overdue": row["overdue"],
            }
            for row in rows[:limit]
        ],
        "meta": {
            "total": total,
            "limit": limit,
            "nextCursor": codec.encode(
                datetime.combine(rows[limit - 1]["week"], datetime.min.time()),
                rows[limit - 1]["key"],
            )
            if len(rows) > limit
            else None,
        },
    }
