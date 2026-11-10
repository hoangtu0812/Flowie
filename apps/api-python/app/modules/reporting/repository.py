from datetime import datetime

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.pagination import CursorCodec
from ..access.projects import workspace_access
from .history_sql import history_ctes, scoped_sql
from .queries import (
    workflow_report_select_sql,
    workload_page_select_grouped_sql,
    workload_page_select_grouped_sql_2,
)


async def workflow_report(db, workspace, user, query, *, now=None):
    await workspace_access(db, workspace, user["id"])
    now = now or utcnow()
    scope, params = scoped_sql(workspace, user["id"], query.selection.options())
    params.update(query.parameters(now))
    sql = workflow_report_select_sql(history_ctes(scope))
    result = dict((await db.execute(sql, params)).mappings().one())
    if len(result["statuses"]) > 1000:
        raise ApiError(
            400, "Too many status groups. Narrow the report filters.", "Bad Request"
        )
    result["asOf"] = now
    return {"data": result}


async def workload_page(db, workspace, user, query, secret, *, cursor=None, limit=50):
    await workspace_access(db, workspace, user["id"])
    scope, params = scoped_sql(workspace, user["id"], query.selection.options())
    params.update(query.parameters(utcnow()))
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
        await db.execute(workload_page_select_grouped_sql(ctes), params)
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
                workload_page_select_grouped_sql_2(ctes, predicate),
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
