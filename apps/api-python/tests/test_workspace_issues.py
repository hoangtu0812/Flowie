import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.native_issues import MoveIssueInput, move_issue, list_sub_issues
from app.modules.work_items.contracts import CreateIssueInput, UpdateIssueInput
from app.modules.work_items.issues import create_issue, update_issue
from app.modules.work_items.issue_queries import _issue_row
from app.modules.work_items.issue_search import search_page
from app.modules.work_items.bug_reports import report
from app.modules.work_items.query_contract import IssueSelectionQuery
from app.modules.notifications.access import readable_recipients
from app.modules.sla.alerts import escalation_actor
from app.domains.native_projects import _project_issue_rows, _project


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_workspace_issues_keep_workflow_visibility_and_move_to_teams():
    asyncio.run(verify_workspace_issues())


async def verify_workspace_issues():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            users = [
                {"id": _cuid(), "name": name}
                for name in ("Owner", "Workspace member", "Outsider")
            ]
            for user in users:
                await db.execute(
                    text(
                        """INSERT INTO users(id,name,email,status,created_at,updated_at)
                    VALUES (:id,:name,:email,'ACTIVE',:now,:now)"""
                    ),
                    {**user, "email": _cuid() + "@example.test", "now": now},
                )
            owner, member, outsider = users
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name="Workspace issues",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.execute(
                text(
                    """INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at)
                VALUES (:id,:workspace,:user,'MEMBER','ACTIVE',:now,:now)"""
                ),
                {
                    "id": _cuid(),
                    "workspace": workspace,
                    "user": member["id"],
                    "now": now,
                },
            )
            task = (
                await create_issue(
                    CreateIssueInput(workspaceId=workspace, title="Unplanned task"),
                    member,
                    db,
                )
            )["data"]
            bug = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, title="Unplanned bug", issueType="BUG"
                    ),
                    member,
                    db,
                )
            )["data"]
            assert (
                task["teamId"] is None
                and task["team"] is None
                and task["projectId"] is None
            )
            assert task["status"]["category"] == "BACKLOG"
            assert task["identifier"] == "WS_1" and bug["identifier"] == "WS_2"
            assert await readable_recipients(
                db,
                workspace,
                "issue",
                task["id"],
                [owner["id"], member["id"], outsider["id"]],
            ) == {owner["id"], member["id"]}
            assert (
                await escalation_actor(
                    db, {"workspace_id": workspace, "team_id": None}, member["id"]
                )
            )["id"] == member["id"]
            assert (
                await escalation_actor(
                    db, {"workspace_id": workspace, "team_id": None}, outsider["id"]
                )
                is None
            )
            private = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=team, title="Team task"
                    ),
                    owner,
                    db,
                )
            )["data"]
            page = await search_page(
                db, workspace, member["id"], "test-secret", {"limit": 1, "noTeam": True}
            )
            assert page["meta"]["total"] == 2 and page["meta"]["nextCursor"]
            second = await search_page(
                db,
                workspace,
                member["id"],
                "test-secret",
                {"limit": 1, "noTeam": True, "cursor": page["meta"]["nextCursor"]},
            )
            assert {page["data"][0]["id"], second["data"][0]["id"]} == {
                task["id"],
                bug["id"],
            }
            query = IssueSelectionQuery(
                issueType="BUG", noProject=True, categories=["backlog"]
            ).options()
            bugs = await search_page(db, workspace, member["id"], "test-secret", query)
            assert [row["id"] for row in bugs["data"]] == [bug["id"]]
            assert (await report(db, workspace, member["id"], None, None))["total"] == 1
            for user, identifier in [(member, private["id"]), (outsider, task["id"])]:
                with pytest.raises(ApiError):
                    await _issue_row(db, identifier, workspace, user["id"])
            child = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace,
                        parentIssueId=task["id"],
                        title="Child task",
                    ),
                    member,
                    db,
                )
            )["data"]
            children = await list_sub_issues(task["id"], workspace, member, db)
            assert child["id"] in [row["id"] for row in children["data"]]
            project_id = _cuid()
            await db.execute(
                text(
                    """INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at)
                VALUES (:id,:workspace,'Shared project','SHARED',:now,:now)"""
                ),
                {"id": project_id, "workspace": workspace, "now": now},
            )
            await update_issue(
                bug["id"], UpdateIssueInput(projectId=project_id), workspace, member, db
            )
            project_rows = await _project_issue_rows(
                db, project_id, workspace, member["id"]
            )
            assert [row["id"] for row in project_rows] == [bug["id"]]
            assert project_rows[0]["team"] is None
            assert [
                row["id"]
                for row in (await _project(db, project_id, workspace, member["id"]))[
                    "issues"
                ]
            ] == [bug["id"]]
            completed = (
                await db.execute(
                    text(
                        "SELECT id FROM issue_statuses WHERE workspace_id=:workspace AND team_id IS NULL AND category='COMPLETED' LIMIT 1"
                    ),
                    {"workspace": workspace},
                )
            ).scalar_one()
            await update_issue(
                task["id"], UpdateIssueInput(statusId=completed), workspace, member, db
            )
            assert (await _issue_row(db, task["id"], workspace, member["id"]))[
                "completedAt"
            ]
            moved = (
                await move_issue(
                    bug["id"],
                    MoveIssueInput(workspaceId=workspace, teamId=team),
                    owner,
                    db,
                )
            )["data"]
            assert moved["teamId"] == team and moved["issueType"] == "BUG"
            with pytest.raises(ApiError):
                await _issue_row(db, bug["id"], workspace, member["id"])
            returned = (
                await move_issue(
                    bug["id"], MoveIssueInput(workspaceId=workspace), owner, db
                )
            )["data"]
            assert (
                returned["teamId"] is None
                and returned["status"]["category"] == "BACKLOG"
            )
            assert (await _issue_row(db, bug["id"], workspace, member["id"]))[
                "id"
            ] == bug["id"]
            events = (
                (
                    await db.execute(
                        text(
                            "SELECT to_team_id FROM issue_lifecycle_events WHERE issue_id=:id ORDER BY issue_version"
                        ),
                        {"id": bug["id"]},
                    )
                )
                .scalars()
                .all()
            )
            assert events == [None, team, None]
    finally:
        await engine.dispose()
