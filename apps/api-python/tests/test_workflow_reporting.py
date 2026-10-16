import asyncio
from datetime import datetime
import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.reporting.contracts import WorkflowReport
from app.modules.reporting.repository import workflow_report, workload_page
from app.modules.reporting.breakdowns import change_page, project_page
from app.modules.reporting.dashboard import dashboard_report


def test_report_ranges_use_local_day_boundaries_and_preserve_unknown_future_days():
    query = WorkflowReport(
        fromDate="2026-03-08", toDate="2026-03-08", timezone="America/New_York"
    )
    params = query.parameters(datetime(2026, 3, 10))
    assert (params["until"] - params["start"]).total_seconds() == 23 * 3600
    assert '"complete": true' in params["days"]
    for values in [
        {"fromDate": "2026-10-20", "toDate": "2026-10-19"},
        {"fromDate": "2025-01-01", "toDate": "2026-01-02"},
        {"fromDate": "9999-12-30", "toDate": "9999-12-31"},
    ]:
        with pytest.raises(ValidationError):
            WorkflowReport(**values)


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_reports_cover_all_rows_actual_episodes_baselines_private_teams_and_weekly_paging():
    asyncio.run(verify_report())


async def verify_report():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            user = {"id": _cuid(), "name": "Reporting owner"}
            now = _utcnow()
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user["id"],
                organization_name="Reporting",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            statuses = {
                row["name"]: row["id"]
                for row in (
                    await db.execute(
                        text(
                            "SELECT id,name FROM issue_statuses WHERE workspace_id=:workspace"
                        ),
                        {"workspace": workspace},
                    )
                ).mappings()
            }
            base = {
                "workspace": workspace,
                "team": team,
                "todo": statuses["Todo"],
                "done": statuses["Done"],
                "started": statuses["In Progress"],
                "actor": user["id"],
            }
            issue, baseline, legacy_done = _cuid(), _cuid(), _cuid()
            await db.execute(
                text(
                    """INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,issue_type,creator_id,created_at,updated_at,version,estimated_effort,actual_effort)
                VALUES (:id,:workspace,:team,:done,'REPORT-1',1,'Flow test','BUG',:actor,'2026-10-12','2026-10-15',6,3,4),
                (:baseline,:workspace,:team,:started,'REPORT-2',2,'Observed work','TASK',:actor,'2026-01-01','2026-10-12',1,2,NULL),
                (:legacy_done,:workspace,:team,:done,'REPORT-3',3,'Legacy completion','TASK',:actor,'2026-01-01','2026-10-12',1,NULL,NULL)"""
                ),
                {**base, "id": issue, "baseline": baseline, "legacy_done": legacy_done},
            )
            # Synthetic history sets exact instants; production has no event-editing API.
            await db.execute(
                text("DELETE FROM issue_lifecycle_events WHERE issue_id=:id"),
                {"id": issue},
            )
            events = [
                ("2026-10-12T00:00:00", None, "Todo", None, "UNSTARTED"),
                ("2026-10-12T09:00:00", "Todo", "In Progress", "UNSTARTED", "STARTED"),
                ("2026-10-13T09:00:00", "In Progress", "Done", "STARTED", "COMPLETED"),
                ("2026-10-14T09:00:00", "Done", "Todo", "COMPLETED", "UNSTARTED"),
                ("2026-10-14T10:00:00", "Todo", "In Progress", "UNSTARTED", "STARTED"),
                ("2026-10-15T10:00:00", "In Progress", "Done", "STARTED", "COMPLETED"),
            ]
            event_ids = []
            for index, (at, previous, current, from_category, to_category) in enumerate(
                events, 1
            ):
                eid = _cuid()
                event_ids.append(eid)
                await db.execute(
                    text(
                        """INSERT INTO issue_lifecycle_events(id,issue_id,workspace_id,issue_version,kind,from_status_id,to_status_id,from_category,to_category,from_team_id,to_team_id,occurred_at)
                    VALUES (:eid,:issue,:workspace,:version,:kind,:previous,:current,:from_category,:to_category,:from_team,:team,:at)"""
                    ),
                    {
                        **base,
                        "eid": eid,
                        "issue": issue,
                        "version": index,
                        "kind": "CREATED" if index == 1 else "CHANGED",
                        "previous": statuses[previous] if previous else None,
                        "current": statuses[current],
                        "from_category": from_category,
                        "to_category": to_category,
                        "from_team": team if previous else None,
                        "at": datetime.fromisoformat(at),
                    },
                )
            await db.execute(
                text(
                    "UPDATE issue_lifecycle_events SET kind='BASELINE',occurred_at='2026-10-12T08:00:00' WHERE issue_id=ANY(CAST(:ids AS text[]))"
                ),
                {"ids": [baseline, legacy_done]},
            )
            prefix = _cuid()
            await db.execute(
                text(
                    """INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,created_at,updated_at,estimated_effort,start_date,assignee_id,due_date)
                SELECT :prefix||n::text,:workspace,:team,:todo,'REPORT-'||(n+1000)::text,n+1000,'Planned work',:actor,'2026-10-12','2026-10-12',0.5,
                DATE '2026-01-01'+((n-1)%52)*7,CASE WHEN ((n-1)/52)%2=0 THEN :actor END,CASE WHEN n%10=0 THEN TIMESTAMP '2026-10-10' END FROM generate_series(1,150) n"""
                ),
                {**base, "prefix": prefix},
            )
            await db.execute(
                text(
                    "UPDATE issue_lifecycle_events SET occurred_at='2026-10-12T00:00:00' WHERE issue_id LIKE :prefix"
                ),
                {"prefix": prefix + "%"},
            )
            private = _cuid()
            await db.execute(
                text(
                    "INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Private reporting','SECRET',:now,:now)"
                ),
                {"id": private, "workspace": workspace, "now": now},
            )
            await db.execute(
                text(
                    """INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,created_at,updated_at)
                SELECT :prefix||n::text,:workspace,:private,:todo,'SECRET-'||n::text,n,'Secret reporting task',:actor,'2026-10-12','2026-10-12' FROM generate_series(1,150) n"""
                ),
                {**base, "prefix": _cuid(), "private": private},
            )
            query = WorkflowReport(
                fromDate="2026-10-11", toDate="2026-10-15", timezone="UTC"
            )
            asof = datetime(2026, 10, 15, 12)
            result = (await workflow_report(db, workspace, user, query, now=asof))[
                "data"
            ]
            assert (
                result["summary"]["total"] == 153 and result["summary"]["open"] == 151
            )
            assert result["summary"]["wip"] == 1 and result["summary"]["overdue"] == 15
            assert (
                result["summary"]["estimated_effort"] == 80
                and result["summary"]["actual_effort"] == 4
            )
            assert result["summary"]["created_in_range"] == 151
            assert result["flow"]["observed_completions"] == 2
            assert (
                result["flow"]["lead_samples"] == 2
                and result["flow"]["cycle_samples"] == 2
            )
            assert (
                result["flow"]["lead_mean_seconds"] == 29 * 3600
                and result["flow"]["cycle_mean_seconds"] == 24 * 3600
            )
            assert result["reopens"] == {"reopened": 1, "bugs_reopened": 1}
            assert (
                result["aging"]["unknown"] == 1
                and result["aging"]["under_7_days"] == 150
            )
            assert [row["wip"] for row in result["trend"]] == [0, 2, 1, 2, 1]
            assert (
                result["trend"][0]["unknown"] == 2
                and result["trend"][-1]["complete"] is False
            )
            assert sum(row["completed"] for row in result["trend"]) == 2
            dashboard = (await dashboard_report(db, workspace, user, query, now=asof))[
                "data"
            ]
            assert dashboard["summary"]["total"] == 153
            assert sum(row["actual"] for row in dashboard["effort"]) == 4
            assert dashboard["projectThroughput"][0]["completed"] == 2
            assert dashboard["projectGroups"] == 1
            assert dashboard["missingEstimatedDates"] >= 1
            changes = await change_page(
                db, workspace, user, query, "report-secret", limit=50, now=asof
            )
            assert changes["meta"]["total"] == 154
            next_page = await change_page(
                db,
                workspace,
                user,
                query,
                "report-secret",
                limit=100,
                cursor=changes["meta"]["nextCursor"],
                now=asof,
            )
            assert not (
                {row["id"] for row in changes["data"]}
                & {row["id"] for row in next_page["data"]}
            )
            projects = await project_page(
                db, workspace, user, query, "report-secret", now=asof
            )
            assert (
                projects["meta"]["total"] == 1 and projects["data"][0]["total"] == 153
            )
            assert projects["data"][0]["completions"] == 2
            project_prefix, secret_project = _cuid(), _cuid()
            await db.execute(
                text(
                    """INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at)
                VALUES (:id,:workspace,:team,'Hidden report project','HIDDEN',:now,:now)"""
                ),
                {
                    "id": secret_project,
                    "workspace": workspace,
                    "team": private,
                    "now": now,
                },
            )
            await db.execute(
                text("UPDATE issues SET project_id=:project WHERE id=:id"),
                {"project": secret_project, "id": baseline},
            )
            safe_dashboard = (
                await dashboard_report(db, workspace, user, query, now=asof)
            )["data"]
            assert all(
                row["name"] != "Hidden report project"
                for row in safe_dashboard["projectThroughput"]
            )
            assert all(
                row["project_id"] is None for row in safe_dashboard["projectEffort"]
            )
            await db.execute(
                text(
                    """INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at)
                SELECT :prefix||n::text,:workspace,'Report project '||n::text,'RPT-'||n::text,:now,:now FROM generate_series(1,150) n"""
                ),
                {"prefix": project_prefix, "workspace": workspace, "now": now},
            )
            await db.execute(
                text(
                    "UPDATE issues SET project_id=:project||(number-1000)::text WHERE workspace_id=:workspace AND team_id=:team AND number>1000"
                ),
                {"project": project_prefix, "workspace": workspace, "team": team},
            )
            project_rows, cursor = [], None
            while True:
                project_result = await project_page(
                    db,
                    workspace,
                    user,
                    query,
                    "report-secret",
                    now=asof,
                    cursor=cursor,
                    limit=50,
                )
                project_rows.extend(project_result["data"])
                cursor = project_result["meta"]["nextCursor"]
                if not cursor:
                    break
            assert (
                len(project_rows) == 151
                and len({row["id"] for row in project_rows}) == 151
            )
            assert sum(row["total"] for row in project_rows) == 153
            assert not any(
                row["projectId"] == secret_project
                or row["name"] == "Hidden report project"
                for row in project_rows
            )
            long = WorkflowReport(
                fromDate="2026-01-01", toDate="2026-12-31", timezone="UTC"
            )
            first = await workload_page(
                db, workspace, user, long, "report-secret", limit=50
            )
            all_rows = list(first["data"])
            cursor = first["meta"]["nextCursor"]
            while cursor:
                page = await workload_page(
                    db, workspace, user, long, "report-secret", limit=50, cursor=cursor
                )
                all_rows.extend(page["data"])
                cursor = page["meta"]["nextCursor"]
            assert first["meta"]["total"] == 105 and len(all_rows) == 105
            assert (
                len({row["id"] for row in all_rows}) == 105
                and sum(row["count"] for row in all_rows) == 151
            )
            assert all_rows[0]["week"] is None
            with pytest.raises(ApiError):
                await workload_page(
                    db,
                    workspace,
                    user,
                    query,
                    "report-secret",
                    cursor=first["meta"]["nextCursor"],
                )
            # A visible completion can be counted without claiming a complete private episode duration.
            await db.execute(
                text(
                    "UPDATE issue_lifecycle_events SET from_team_id=:private WHERE id=:id"
                ),
                {"private": private, "id": event_ids[3]},
            )
            restricted = (await workflow_report(db, workspace, user, query, now=asof))[
                "data"
            ]
            assert (
                restricted["flow"]["lead_samples"] == 1
                and restricted["flow"]["observed_completions"] == 2
            )
            assert restricted["reopens"]["reopened"] == 0
            await db.execute(
                text("DELETE FROM team_members WHERE team_id=:team AND user_id=:actor"),
                base,
            )
            empty = (await workflow_report(db, workspace, user, query, now=asof))[
                "data"
            ]
            assert (
                empty["summary"]["total"] == 0
                and empty["flow"]["lead_mean_seconds"] is None
            )
            empty_dashboard = (
                await dashboard_report(db, workspace, user, query, now=asof)
            )["data"]
            assert not empty_dashboard["projectThroughput"]
            assert all(
                row["actual"] == row["estimated"] == 0
                for row in empty_dashboard["effort"]
            )
            await db.rollback()
    finally:
        await engine.dispose()
