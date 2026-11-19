"""Issue milestones (DTD-946): an issue carries at most one milestone of its own project, can be
filtered by it, drops it when it leaves the project, and the milestone reports its progress.
VI: Milestone của issue (DTD-946): issue mang tối đa một milestone của chính dự án chứa nó, lọc
VI: được theo milestone, tự gỡ khi rời dự án, và milestone báo tiến độ của nó.
"""

import asyncio
import json
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.portfolio.projects_api import (
    MilestoneInput,
    create_milestone,
    list_milestones,
    remove_milestone,
)
from app.modules.work_items.contracts import CreateIssueInput, UpdateIssueInput
from app.modules.work_items.issue_search import search_page
from app.modules.work_items.issues import create_issue, update_issue
from app.modules.work_items.issues_api import MoveIssueInput, issue_options, move_issue


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_issue_milestones_stay_inside_their_project():
    asyncio.run(verify_issue_milestones())


async def expect_error(status, call):
    with pytest.raises(ApiError) as caught:
        await call
    assert caught.value.status_code == status, caught.value


async def verify_issue_milestones():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    try:
        async with async_sessionmaker(engine)() as db:
            now, owner = utcnow(), {"id": cuid(), "name": "Owner"}
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {**owner, "email": cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=owner["id"], organization_name="Mile", workspace_name=cuid(), now=now
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            project_a, project_b = cuid(), cuid()
            for project in (project_a, project_b):
                await db.execute(
                    text(
                        "INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,:id,:id,:now,:now)"
                    ),
                    {"id": project, "workspace": workspace, "team": team, "now": now},
                )
            await db.commit()

            async def new_milestone(project, title):
                payload = MilestoneInput(workspaceId=workspace, title=title, targetDate="2026-12-31")
                return (await create_milestone(project, payload, owner, db))["data"]

            alpha, beta = await new_milestone(project_a, "Alpha"), await new_milestone(project_a, "Beta")
            other = await new_milestone(project_b, "Other")

            async def new_issue(title, **fields):
                payload = CreateIssueInput(workspaceId=workspace, teamId=team, title=title, **fields)
                return (await create_issue(payload, owner, db))["data"]

            # Assigning: one milestone of the issue's project; another project's or none is refused.
            # VI: Gán: một milestone của dự án chứa issue; của dự án khác hoặc khi không có dự án bị từ chối.
            issue = await new_issue("Ship it", projectId=project_a, milestoneId=alpha["id"])
            assert issue["milestoneId"] == alpha["id"]
            assert issue["milestone"]["title"] == "Alpha"
            await expect_error(
                404,
                update_issue(issue["id"], UpdateIssueInput(milestoneId=other["id"]), workspace, owner, db),
            )
            await expect_error(400, new_issue("No project", milestoneId=alpha["id"]))
            await new_issue("Plain", projectId=project_a)
            done_status = (
                await db.execute(
                    text(
                        "SELECT id FROM issue_statuses WHERE workspace_id=:w AND category='COMPLETED' ORDER BY position LIMIT 1"
                    ),
                    {"w": workspace},
                )
            ).scalar_one()
            await new_issue("Done", projectId=project_a, milestoneId=alpha["id"], statusId=done_status)
            await db.commit()

            # Progress on the milestone list: completed / active issues.
            # VI: Tiến độ trên danh sách milestone: số issue hoàn thành / đang hoạt động.
            listed = {row["title"]: row for row in (await list_milestones(project_a, workspace, owner, db))["data"]}
            assert (listed["Alpha"]["completedIssueCount"], listed["Alpha"]["issueCount"]) == (1, 2)
            assert (listed["Beta"]["completedIssueCount"], listed["Beta"]["issueCount"]) == (0, 0)

            # Filtering by milestone, including "no milestone"; options tag milestones with projects.
            # VI: Lọc theo milestone, gồm "không có milestone"; options gắn milestone với dự án.
            async def titles(operator, values):
                filters = [{"columnId": "milestone", "type": "option", "operator": operator, "values": values}]
                options = {"limit": 100, "projectId": project_a, "filters": json.dumps(filters)}
                page = await search_page(db, workspace, owner["id"], "milestone-secret", options)
                return sorted(row["title"] for row in page["data"])

            assert await titles("is", [alpha["id"]]) == ["Done", "Ship it"]
            assert await titles("is", ["no-milestone"]) == ["Plain"]
            options = (await issue_options(workspace, team, owner, db, False))["data"]
            assert {(row["title"], row["projectId"]) for row in options["milestones"]} == {
                ("Alpha", project_a), ("Beta", project_a), ("Other", project_b),
            }

            # Changing and clearing write activity; deleting the milestone clears it from issues.
            # VI: Đổi và gỡ đều ghi activity; xoá milestone thì issue không còn tham chiếu tới nó.
            moved = (
                await update_issue(issue["id"], UpdateIssueInput(milestoneId=beta["id"]), workspace, owner, db)
            )["data"]
            assert moved["milestone"]["title"] == "Beta"

            async def last_changes(issue_id):
                return (
                    await db.execute(
                        text(
                            "SELECT data FROM activities WHERE issue_id=:id AND type='issue.updated' ORDER BY created_at DESC LIMIT 1"
                        ),
                        {"id": issue_id},
                    )
                ).scalar_one()["changes"]

            assert {"field": "Milestone", "change": "Alpha → Beta"} in await last_changes(issue["id"])
            await remove_milestone(project_a, beta["id"], workspace, owner, db)
            cleared = (await update_issue(issue["id"], UpdateIssueInput(title="Ship it again"), workspace, owner, db))["data"]
            assert cleared["milestoneId"] is None and cleared["milestone"] is None

            # Leaving the project, by project change or by team move, drops the milestone.
            # VI: Rời dự án, do đổi dự án hay chuyển team, đều gỡ milestone.
            again = (
                await update_issue(issue["id"], UpdateIssueInput(milestoneId=alpha["id"]), workspace, owner, db)
            )["data"]
            assert again["milestoneId"] == alpha["id"]
            switched = (
                await update_issue(issue["id"], UpdateIssueInput(projectId=project_b), workspace, owner, db)
            )["data"]
            assert switched["milestoneId"] is None
            assert {"field": "Milestone", "change": "Alpha → —"} in await last_changes(issue["id"])
            traveller = await new_issue("Traveller", projectId=project_a, milestoneId=alpha["id"])
            left = (await move_issue(traveller["id"], MoveIssueInput(workspaceId=workspace), owner, db))["data"]
            assert left["projectId"] is None and left["milestoneId"] is None

            # DTD-957: the issue page lists every readable project of the workspace, and an issue
            # without a team joins another team's project by moving there in one step.
            # VI: DTD-957: trang issue liệt kê mọi dự án đọc được của workspace, và issue không có
            # VI: team vào dự án của team khác bằng một bước chuyển sang team đó.
            private_team, private_project = cuid(), cuid()
            await db.execute(
                text(
                    "INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Private','PRIV',:now,:now)"
                ),
                {"id": private_team, "workspace": workspace, "now": now},
            )
            await db.execute(
                text(
                    "INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,:id,:id,:now,:now)"
                ),
                {"id": private_project, "workspace": workspace, "team": private_team, "now": now},
            )
            team_bound = {row["id"] for row in (await issue_options(workspace, None, owner, db, True))["data"]["projects"]}
            listed = {row["id"] for row in (await issue_options(workspace, None, owner, db, True, True))["data"]["projects"]}
            assert project_b not in team_bound and {project_a, project_b} <= listed
            assert private_project not in listed
            await expect_error(404, move_issue(
                traveller["id"], MoveIssueInput(workspaceId=workspace, teamId=team, projectId=private_project), owner, db,
            ))
            joined = (await move_issue(
                traveller["id"], MoveIssueInput(workspaceId=workspace, teamId=team, projectId=project_b), owner, db,
            ))["data"]
            assert joined["teamId"] == team and joined["projectId"] == project_b
            assert joined["identifier"] != traveller["identifier"]
            assert {"field": "Project", "change": f"— → {project_b}"} in await last_changes(traveller["id"])
            await expect_error(400, move_issue(
                traveller["id"], MoveIssueInput(workspaceId=workspace, teamId=team, projectId=project_a), owner, db,
            ))
            await db.rollback()
    finally:
        await engine.dispose()
