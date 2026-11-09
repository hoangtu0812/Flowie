import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.native_asks import (
    AskMessageInput,
    AskTransitionInput,
    CreateAskInput,
    UpdateAskInput,
    archive_ask,
    convert_ask,
    create_ask,
    create_ask_message,
    list_ask_messages,
    list_asks,
    ticket_status,
    transition_ask,
    update_ask,
)
from app.domains.native_attachments import _authorize_entity
from app.domains.native_notifications import list_notifications
from app.jobs.ticket_status import notify_ticket_status_changes
from app.modules.work_items.comments import create_comment
from app.modules.work_items.contracts import CreateCommentInput
from tests.document_review_support import add_member
from tests.test_service_desk_asks import add_project, forbidden


@pytest.mark.parametrize(
    "ask_status,category,expected",
    [
        ("open", None, "waiting_for_you"),
        ("accepted", "STARTED", "waiting_for_you"),
        ("accepted", "COMPLETED", "done"),
        ("accepted", "CANCELED", "canceled"),
        ("declined", None, "declined"),
    ],
)
def test_waiting_for_you_only_applies_to_open_work(ask_status, category, expected):
    assert ticket_status(ask_status, category, True) == expected


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_ticket_conversation_and_notifications():
    asyncio.run(verify_conversation())


async def inbox(db, workspace, user):
    return (await list_notifications(workspace, False, user, db))["data"]


async def set_issue_category(db, workspace, issue_id, category):
    await db.execute(
        text(
            """UPDATE issues SET status_id = (SELECT id FROM issue_statuses WHERE workspace_id = :workspace
            AND category = CAST(:category AS "IssueStatusCategory") ORDER BY position LIMIT 1) WHERE id = :id"""
        ),
        {"workspace": workspace, "category": category, "id": issue_id},
    )
    await db.commit()


async def verify_conversation():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as db:
            now = _utcnow()
            owner = {"id": _cuid(), "name": "Owner"}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**owner, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=owner["id"], organization_name="Desk", workspace_name=_cuid(), now=now
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            handler = await add_member(db, workspace, team, name="Handler")
            colleague = await add_member(db, workspace, team, name="Colleague")
            requester = await add_member(db, workspace, None, name="Requester")
            other = await add_member(db, workspace, None, name="Other")
            stranger = {"id": _cuid(), "name": "Stranger"}
            await db.commit()
            project = await add_project(db, workspace, team, enabled=True)
            ticket = CreateAskInput(workspaceId=workspace, teamId=team, projectId=project, title="Cannot sign in")
            ask_id = (await create_ask(ticket, requester, db))["data"]["id"]

            # A new ticket reaches the team, not the requester or anyone else.
            # VI: Ticket mới báo cho team, không báo cho người yêu cầu hay người khác.
            assert [row["type"] for row in await inbox(db, workspace, handler)] == ["ticket.created"]
            assert [row["type"] for row in await inbox(db, workspace, colleague)] == ["ticket.created"]
            assert await inbox(db, workspace, requester) == []
            assert await inbox(db, workspace, other) == []

            # An Ask the team files outside Service Desk stays quiet.
            # VI: Ask do team tạo ngoài Service Desk không tạo thông báo.
            closed = await add_project(db, workspace, team, enabled=False)
            await create_ask(ticket.model_copy(update={"projectId": closed}), handler, db)
            await create_ask(ticket.model_copy(update={"projectId": None}), handler, db)
            assert len(await inbox(db, workspace, colleague)) == 1

            # Only the requester and the people handling the ticket join the conversation.
            # VI: Chỉ người yêu cầu và người xử lý ticket tham gia trao đổi.
            sent = await create_ask_message(ask_id, AskMessageInput(content="  It fails on mobile  "), workspace, requester, db)
            assert sent["data"]["content"] == "It fails on mobile"
            assert sent["data"]["author"]["name"] == "Requester"
            for outsider in (other, stranger):
                await forbidden(list_ask_messages(ask_id, workspace, outsider, db))
                await forbidden(create_ask_message(ask_id, AskMessageInput(content="Hi"), workspace, outsider, db))
            with pytest.raises(ApiError) as error:
                await create_ask_message(ask_id, AskMessageInput(content="   "), workspace, requester, db)
            assert error.value.status_code == 400

            assert await inbox(db, workspace, requester) == []
            assert (await inbox(db, workspace, handler))[0]["type"] == "ticket.message"
            assert (await inbox(db, workspace, colleague))[0]["type"] == "ticket.message"
            assert await inbox(db, workspace, other) == []
            mine = (await list_asks(workspace, "mine", requester, db))["data"][0]
            assert mine["ticketStatus"] == "received"

            await create_ask_message(ask_id, AskMessageInput(content="Which browser?"), workspace, handler, db)
            mine = (await list_asks(workspace, "mine", requester, db))["data"][0]
            assert mine["ticketStatus"] == "waiting_for_you"
            notes = await inbox(db, workspace, requester)
            assert [row["entityType"] for row in notes] == ["ticket"]
            assert notes[0]["data"]["body"] == "Which browser?"
            assert notes[0]["data"]["entityPath"] == f"/service-desk/{ask_id}"
            await create_ask_message(ask_id, AskMessageInput(content="Safari"), workspace, requester, db)
            mine = (await list_asks(workspace, "mine", requester, db))["data"][0]
            assert mine["ticketStatus"] == "received"
            messages = (await list_ask_messages(ask_id, workspace, colleague, db))["data"]
            assert [row["content"] for row in messages] == ["It fails on mobile", "Which browser?", "Safari"]

            # The job scans the whole database, so tickets left by other tests are cleared first.
            # VI: Job quét toàn bộ database nên ticket do test khác để lại được xử lý trước.
            await notify_ticket_status_changes(factory)

            # A new ticket has nothing to report, and a converted one reports only real changes.
            # VI: Ticket mới chưa có gì để báo, và ticket đã chuyển chỉ báo khi có thay đổi thật.
            await create_ask(ticket, requester, db)
            assert await notify_ticket_status_changes(factory) == 0
            converted = (await convert_ask(ask_id, workspace, handler, db))["data"]
            issue_id = converted["convertedIssueId"]
            assert await notify_ticket_status_changes(factory) == 0

            await create_comment(
                CreateCommentInput(workspaceId=workspace, issueId=issue_id, content="Internal: looks like a session bug"),
                handler,
                db,
            )
            await db.commit()
            messages = (await list_ask_messages(ask_id, workspace, requester, db))["data"]
            assert "Internal" not in " ".join(row["content"] for row in messages)
            requester_notes = await inbox(db, workspace, requester)
            assert all(row["entityType"] == "ticket" for row in requester_notes)
            assert "Internal" not in str(requester_notes)

            before = len(requester_notes)
            await set_issue_category(db, workspace, issue_id, "STARTED")
            assert await notify_ticket_status_changes(factory) == 1
            assert await notify_ticket_status_changes(factory) == 0
            notes = await inbox(db, workspace, requester)
            assert len(notes) == before + 1
            assert notes[0]["type"] == "ticket.status_changed"
            assert notes[0]["data"]["details"] == [{"name": "Status", "value": "Received → In progress"}]
            assert issue_id not in str(notes)

            await set_issue_category(db, workspace, issue_id, "COMPLETED")
            assert await notify_ticket_status_changes(factory) == 1
            note = (await inbox(db, workspace, requester))[0]
            assert note["data"]["details"][0]["value"] == "In progress → Done"
            assert await inbox(db, workspace, other) == []

            # A decision on the ticket notifies at once, so the job must not repeat it.
            # VI: Quyết định trên ticket báo ngay, nên job không được báo lại.
            second = (await create_ask(ticket, requester, db))["data"]["id"]
            await transition_ask(second, AskTransitionInput(action="decline", message="Out of scope"), workspace, handler, db)
            assert await notify_ticket_status_changes(factory) == 0

            # An Ask from before this job gets a baseline, not a notification.
            # VI: Ask có trước job này được đặt mốc, không tạo thông báo.
            legacy = (await create_ask(ticket, requester, db))["data"]["id"]
            await db.execute(text("UPDATE asks SET notified_ticket_status = NULL WHERE id = :id"), {"id": legacy})
            await db.commit()
            assert await notify_ticket_status_changes(factory) == 0
            stored = await db.execute(text("SELECT notified_ticket_status FROM asks WHERE id = :id"), {"id": legacy})
            assert stored.scalar_one() == "received"

            # Leaving the workspace ends access, even to a ticket the person wrote.
            # VI: Rời workspace là mất quyền, kể cả với ticket do chính người đó tạo.
            await db.execute(
                text("UPDATE workspace_members SET status = 'SUSPENDED' WHERE workspace_id = :workspace AND user_id = :user"),
                {"workspace": workspace, "user": requester["id"]},
            )
            await db.commit()
            await forbidden(list_ask_messages(second, workspace, requester, db))
            await forbidden(update_ask(second, UpdateAskInput(title="Reworded"), workspace, requester, db))
            await db.execute(
                text("UPDATE workspace_members SET status = 'ACTIVE' WHERE workspace_id = :workspace AND user_id = :user"),
                {"workspace": workspace, "user": requester["id"]},
            )
            await db.commit()

            # Ticket files follow ticket access, not team membership.
            # VI: Tệp của ticket đi theo quyền trên ticket, không theo thành viên team.
            await _authorize_entity(db, workspace, "ticket", ask_id, requester["id"], writing=True)
            await _authorize_entity(db, workspace, "ticket", ask_id, handler["id"], writing=True)
            await forbidden(_authorize_entity(db, workspace, "ticket", ask_id, other["id"]))
            await forbidden(_authorize_entity(db, workspace, "ticket", ask_id, stranger["id"]))

            # Archiving a ticket removes its notifications from every Inbox.
            # VI: Lưu trữ ticket sẽ gỡ thông báo của ticket khỏi mọi Inbox.
            await archive_ask(ask_id, workspace, handler, db)
            assert all(row["entityId"] != ask_id for row in await inbox(db, workspace, requester))
            assert all(row["entityId"] != ask_id for row in await inbox(db, workspace, handler))
    finally:
        await engine.dispose()
