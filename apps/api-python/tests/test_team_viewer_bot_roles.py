"""Team VIEWER and BOT roles (DTD-918): VIEWER reads but never writes the team's issues,
projects and documents and is never assigned; BOT writes like a member and is flagged in activity.
VI: Vai trò team VIEWER và BOT (DTD-918): VIEWER đọc nhưng không bao giờ ghi issue, dự án, tài liệu
VI: của team và không được giao việc; BOT ghi như member và được đánh dấu trong activity.
"""

import asyncio
import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.teams.api import TeamMemberRoleInput, update_member
from app.modules.work_items.collaboration_feed import activity_page
from app.modules.work_items.comments import create_comment
from app.modules.work_items.contracts import (
    CreateCommentInput,
    CreateDocumentInput,
    CreateIssueInput,
    UpdateIssueInput,
)
from app.modules.work_items.documents import create_document
from app.modules.work_items.issues import create_issue, update_issue
from app.modules.work_items.issues_api import archive_issue, issue_options
from tests.document_review_support import add_member


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_team_viewer_reads_only_and_bot_writes_with_badge():
    asyncio.run(verify_roles())


async def expect_error(status, call):
    with pytest.raises(ApiError) as caught:
        await call
    assert caught.value.status_code == status, caught.value
    return caught.value


async def verify_roles():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
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
                db,
                user_id=owner["id"],
                organization_name="Roles",
                workspace_name=cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            member = await add_member(db, workspace, team, name="Member")
            viewer = await add_member(db, workspace, team, name="Leader")
            bot = await add_member(db, workspace, team, name="Agent")
            await db.commit()

            # Roles change through the team members API; unknown roles are rejected by the contract.
            # VI: Vai trò đổi qua API thành viên team; vai trò lạ bị contract từ chối.
            for person, role in [(viewer, "VIEWER"), (bot, "BOT")]:
                changed = await update_member(
                    team, person["id"], TeamMemberRoleInput(role=role), workspace, owner, db
                )
                assert changed["data"]["role"] == role
            with pytest.raises(ValidationError):
                TeamMemberRoleInput(role="GUEST")

            issue = (
                await create_issue(
                    CreateIssueInput(workspaceId=workspace, teamId=team, title="Owned issue"),
                    member,
                    db,
                )
            )["data"]
            await db.commit()

            # VIEWER: no create, update or archive. VI: VIEWER: không tạo, sửa hay archive.
            error = await expect_error(
                403,
                create_issue(
                    CreateIssueInput(workspaceId=workspace, teamId=team, title="Viewer issue"),
                    viewer,
                    db,
                ),
            )
            assert error.message == "Your role in this team is view-only."
            await db.rollback()
            await expect_error(
                403,
                update_issue(issue["id"], UpdateIssueInput(title="Renamed"), workspace, viewer, db),
            )
            await db.rollback()
            await expect_error(403, archive_issue(issue["id"], workspace, viewer, db, False))
            await db.rollback()
            await expect_error(
                403,
                create_document(
                    CreateDocumentInput(workspaceId=workspace, teamId=team, title="Viewer doc"),
                    viewer,
                    db,
                ),
            )
            await db.rollback()

            # VIEWER may still comment. VI: VIEWER vẫn comment được.
            comment = await create_comment(
                CreateCommentInput(workspaceId=workspace, issueId=issue["id"], content="Seen"),
                viewer,
                db,
            )
            assert comment["data"]["content"] == "Seen"
            await db.commit()

            # VIEWER cannot be assigned; BOT can. VI: Không giao được cho VIEWER; giao được cho BOT.
            await expect_error(
                400,
                update_issue(
                    issue["id"], UpdateIssueInput(assigneeId=viewer["id"]), workspace, member, db
                ),
            )
            await db.rollback()
            await expect_error(
                400,
                create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=team, title="Assigned", assigneeId=viewer["id"]
                    ),
                    member,
                    db,
                ),
            )
            await db.rollback()

            # BOT writes like a member and is flagged as the actor in activity.
            # VI: BOT ghi như member và được đánh dấu là người thực hiện trong activity.
            bot_issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=team, title="Bot issue", assigneeId=bot["id"]
                    ),
                    bot,
                    db,
                )
            )["data"]
            await update_issue(bot_issue["id"], UpdateIssueInput(title="Bot renamed"), workspace, bot, db)
            await db.commit()
            feed = await activity_page(db, workspace, owner["id"], "test-secret", issue_id=bot_issue["id"])
            actors = [item["actor"] for item in feed["data"] if item["actor"]]
            assert actors and all(actor["isBot"] for actor in actors if actor["id"] == bot["id"])
            member_feed = await activity_page(db, workspace, owner["id"], "test-secret", issue_id=issue["id"])
            assert all(
                not item["actor"]["isBot"] for item in member_feed["data"] if item["actor"]
            )

            # Options carry each person's team roles so pickers can hide VIEWERs and mark BOTs.
            # VI: Options mang vai trò team của từng người để picker ẩn VIEWER và đánh dấu BOT.
            options = await issue_options(workspace, team, owner, db, False)
            roles = {person["id"]: person["teamRoles"] for person in options["data"]["members"]}
            assert roles[viewer["id"]] == {team: "VIEWER"}
            assert roles[bot["id"]] == {team: "BOT"}
            assert roles[owner["id"]] == {team: "LEAD"}
    finally:
        await engine.dispose()
