"""Sub projects (DTD-915): a per-project list managed like milestones, carried by issues of that
project only, filterable, and dropped when an issue leaves the project.
VI: Sub project (DTD-915): danh sách riêng từng dự án, quản lý như milestone, chỉ issue của dự án
VI: đó mang được, lọc được, và tự gỡ khi issue rời dự án.
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
    SubProjectLabelInput,
    UpdateSubProjectLabelInput,
    create_sub_project_label,
    list_sub_project_labels,
    remove_sub_project_label,
    update_sub_project_label,
)
from app.modules.teams.api import TeamMemberRoleInput, update_member
from app.modules.work_items.contracts import CreateIssueInput, UpdateIssueInput
from app.modules.work_items.issue_search import search_page
from app.modules.work_items.issues import create_issue, update_issue
from app.modules.work_items.issues_api import MoveIssueInput, issue_options, move_issue
from tests.document_review_support import add_member


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_sub_projects_stay_inside_their_project():
    asyncio.run(verify_sub_projects())


async def expect_error(status, call):
    with pytest.raises(ApiError) as caught:
        await call
    assert caught.value.status_code == status, caught.value


async def verify_sub_projects():
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
                db, user_id=owner["id"], organization_name="Sub", workspace_name=cuid(), now=now
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            viewer = await add_member(db, workspace, team, name="Viewer")
            project_a, project_b = cuid(), cuid()
            for project in (project_a, project_b):
                await db.execute(
                    text(
                        "INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,:id,:id,:now,:now)"
                    ),
                    {"id": project, "workspace": workspace, "team": team, "now": now},
                )
            await db.commit()
            await update_member(
                team, viewer["id"], TeamMemberRoleInput(role="VIEWER"), workspace, owner, db
            )

            async def new_label(project, name):
                payload = SubProjectLabelInput(workspaceId=workspace, name=name, color="#336699")
                return (await create_sub_project_label(project, payload, owner, db))["data"]

            # Managing the list: case-insensitive unique names per project, VIEWER refused.
            # VI: Quản lý danh sách: tên duy nhất không phân biệt hoa thường trong dự án, VIEWER bị chặn.
            web, mobile = await new_label(project_a, " Web "), await new_label(project_a, "Mobile")
            other = await new_label(project_b, "Web")
            assert web["name"] == "Web"
            await expect_error(409, new_label(project_a, "web"))
            await expect_error(
                403,
                create_sub_project_label(
                    project_a,
                    SubProjectLabelInput(workspaceId=workspace, name="Ops", color="#000000"),
                    viewer,
                    db,
                ),
            )
            listed = (await list_sub_project_labels(project_a, workspace, viewer, db))["data"]
            assert [label["name"] for label in listed] == ["Mobile", "Web"]

            # Assigning: two of the issue's project; another project's label is refused.
            # VI: Gán: hai sub project của dự án chứa issue; label của dự án khác bị từ chối.
            issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace,
                        teamId=team,
                        projectId=project_a,
                        title="Split me",
                        subProjectLabelIds=[web["id"], mobile["id"], web["id"]],
                    ),
                    owner,
                    db,
                )
            )["data"]
            assert {label["name"] for label in issue["subProjectLabels"]} == {"Web", "Mobile"}
            await expect_error(
                404,
                update_issue(
                    issue["id"], UpdateIssueInput(subProjectLabelIds=[other["id"]]), workspace, owner, db
                ),
            )
            await expect_error(
                400,
                create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=team, title="No project",
                        subProjectLabelIds=[web["id"]],
                    ),
                    owner,
                    db,
                ),
            )
            plain = (
                await create_issue(
                    CreateIssueInput(workspaceId=workspace, teamId=team, projectId=project_a, title="Plain"),
                    owner,
                    db,
                )
            )["data"]
            await db.commit()

            # Filtering by sub project, and options tag each label with its project.
            # VI: Lọc theo sub project, và options gắn mỗi label với dự án của nó.
            async def titles(operator, values):
                filters = [{"columnId": "subProjects", "type": "multiOption", "operator": operator, "values": values}]
                options = {"limit": 100, "projectId": project_a, "filters": json.dumps(filters)}
                page = await search_page(db, workspace, owner["id"], "sub-secret", options)
                return sorted(row["title"] for row in page["data"])

            assert await titles("include", [web["id"]]) == ["Split me"]
            assert await titles("exclude", [web["id"]]) == ["Plain"]
            options = (await issue_options(workspace, team, owner, db, False))["data"]
            assert {(row["name"], row["projectId"]) for row in options["subProjectLabels"]} == {
                ("Web", project_a), ("Mobile", project_a), ("Web", project_b),
            }
            assert not any(label["name"] == "Mobile" for label in options["labels"])

            # Archived: kept on the issue, refused as a new assignment.
            # VI: Đã lưu trữ: giữ trên issue, bị từ chối khi gán mới.
            archived = (
                await update_sub_project_label(
                    project_a, mobile["id"], UpdateSubProjectLabelInput(archived=True), workspace, owner, db
                )
            )["data"]
            assert archived["archivedAt"] is not None
            kept = (
                await update_issue(
                    issue["id"],
                    UpdateIssueInput(subProjectLabelIds=[web["id"], mobile["id"]], title="Split me too"),
                    workspace,
                    owner,
                    db,
                )
            )["data"]
            assert len(kept["subProjectLabels"]) == 2
            await expect_error(
                400,
                update_issue(
                    plain["id"], UpdateIssueInput(subProjectLabelIds=[mobile["id"]]), workspace, owner, db
                ),
            )

            # Deleting removes the label from every issue; moving the issue drops the rest.
            # VI: Xoá gỡ label khỏi mọi issue; chuyển issue sang dự án khác gỡ phần còn lại.
            await remove_sub_project_label(project_a, mobile["id"], workspace, owner, db)
            moved = (
                await update_issue(issue["id"], UpdateIssueInput(projectId=project_b), workspace, owner, db)
            )["data"]
            assert moved["subProjectLabels"] == []
            remaining = await db.execute(
                text("SELECT count(*) FROM issue_sub_project_labels WHERE issue_id=:id"), {"id": issue["id"]}
            )
            assert remaining.scalar_one() == 0
            changes = (
                await db.execute(
                    text(
                        "SELECT data FROM activities WHERE issue_id=:id AND type='issue.updated' ORDER BY created_at DESC LIMIT 1"
                    ),
                    {"id": issue["id"]},
                )
            ).scalar_one()["changes"]
            assert {"field": "Sub projects", "change": "Web → —"} in changes

            # Moving an issue out of its project's team clears the project and its sub projects.
            # VI: Chuyển issue ra khỏi team của dự án thì xoá dự án và sub project của nó.
            traveller = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=team, projectId=project_a,
                        title="Traveller", subProjectLabelIds=[web["id"]],
                    ),
                    owner,
                    db,
                )
            )["data"]
            left = (await move_issue(traveller["id"], MoveIssueInput(workspaceId=workspace), owner, db))["data"]
            assert left["projectId"] is None and left["subProjectLabels"] == []
            await db.rollback()
    finally:
        await engine.dispose()
