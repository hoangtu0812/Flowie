
from ...core.clock import utcnow
from .history_sql import history_ctes, scoped_sql
from .queries import dashboard_report_select_sql
from .repository import workflow_report


async def dashboard_report(db, workspace, user, query, *, now=None):
    now = now or utcnow()
    result = await workflow_report(db, workspace, user, query, now=now)
    scope, params = scoped_sql(workspace, user["id"], query.selection.options())
    params.update(query.parameters(now))
    sql = dashboard_report_select_sql(history_ctes(scope))
    result["data"].update(dict((await db.execute(sql, params)).mappings().one()))
    return result
