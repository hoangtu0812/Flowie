import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.domains.native_asks import (
    AskMessageInput,
    CreateAskInput,
    UpdateAskInput,
    convert_ask,
    create_ask,
    create_ask_message,
    list_asks,
    ticket_for_issue,
    update_ask,
)
from app.domains.native_notifications import list_notifications
from app.modules.identity.auth import create_workspace_bootstrap
from tests.document_review_support import add_member
from tests.test_service_desk_asks import add_project, forbidden


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_assignment_routes_messages_and_follows_the_issue():
    asyncio.run(verify_assignment())


async def types(db, workspace, user):
    return [row["type"] for row in (await list_notifications(workspace, False, user, db))["data"]]


async def verify_assignment():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            now = utcnow()
            owner = {"id": cuid(), "name": "Owner"}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**owner, "email": cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=owner["id"], organization_name="Desk", workspace_name=cuid(), now=now
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            handler = await add_member(db, workspace, team, name="Handler")
            colleague = await add_member(db, workspace, team, name="Colleague")
            requester = await add_member(db, workspace, None, name="Requester")
            other = await add_member(db, workspace, None, name="Other")
            await db.commit()
            project = await add_project(db, workspace, team, enabled=True)
            ticket = CreateAskInput(workspaceId=workspace, teamId=team, projectId=project, title="Cannot sign in")
            ask_id = (await create_ask(ticket, requester, db))["data"]["id"]

            await forbidden(update_ask(ask_id, UpdateAskInput(assigneeId=handler["id"]), workspace, requester, db))
            with pytest.raises(ApiError) as error:
                await update_ask(ask_id, UpdateAskInput(assigneeId=other["id"]), workspace, handler, db)
            assert error.value.status_code == 400

            # Self-assignment needs no notification; being assigned by someone else does.
            # VI: Tự nhận ticket thì không cần báo; được người khác giao thì có báo.
            await update_ask(ask_id, UpdateAskInput(assigneeId=handler["id"]), workspace, handler, db)
            assert "ticket.assigned" not in await types(db, workspace, handler)
            assigned = await update_ask(ask_id, UpdateAskInput(assigneeId=colleague["id"]), workspace, handler, db)
            assert assigned["data"]["assignee"]["name"] == "Colleague"
            assert (await types(db, workspace, colleague))[0] == "ticket.assigned"
            mine = (await list_asks(workspace, "mine", requester, db))["data"][0]
            assert mine["assignee"]["name"] == "Colleague"

            # Once assigned, a requester's message reaches the assignee and not the rest of the team.
            # VI: Sau khi giao, tin nhắn của người yêu cầu tới người được giao, không tới phần còn lại của team.
            await create_ask_message(ask_id, AskMessageInput(content="Any news?"), workspace, requester, db)
            assert (await types(db, workspace, colleague))[0] == "ticket.message"
            assert "ticket.message" not in await types(db, workspace, handler)

            # An assignee who left the team must not swallow the message.
            # VI: Người được giao đã rời team không được làm mất tin nhắn.
            await db.execute(
                text("DELETE FROM team_members WHERE team_id = :team AND user_id = :user"),
                {"team": team, "user": colleague["id"]},
            )
            await db.commit()
            await create_ask_message(ask_id, AskMessageInput(content="Still there?"), workspace, requester, db)
            assert (await types(db, workspace, handler))[0] == "ticket.message"
            await db.execute(
                text("INSERT INTO team_members(team_id,user_id,role) VALUES (:team,:user,'MEMBER')"),
                {"team": team, "user": colleague["id"]},
            )
            await db.commit()

            converted = (await convert_ask(ask_id, workspace, handler, db))["data"]
            issue_id = converted["convertedIssueId"]
            assignee = await db.execute(text("SELECT assignee_id FROM issues WHERE id = :id"), {"id": issue_id})
            assert assignee.scalar_one() == colleague["id"]

            link = await ticket_for_issue(issue_id, workspace, handler, db)
            assert link["data"] == {"id": ask_id, "title": "Cannot sign in"}
            await forbidden(ticket_for_issue(issue_id, workspace, other, db))
            assert (await ticket_for_issue("no-such-issue", workspace, handler, db))["data"] is None

            # A requester keeps seeing who handles the ticket, never the issue.
            # VI: Người yêu cầu vẫn thấy ai xử lý ticket, không bao giờ thấy Issue.
            mine = (await list_asks(workspace, "mine", requester, db))["data"][0]
            assert mine["assignee"]["name"] == "Colleague"
            assert "convertedIssue" not in mine
    finally:
        await engine.dispose()
