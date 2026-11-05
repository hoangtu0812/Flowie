import asyncio
import os
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.domains.native_asks as native_asks
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.native_asks import (
    AskTransitionInput,
    CreateAskInput,
    UpdateAskInput,
    archive_ask,
    convert_ask,
    create_ask,
    list_ask_messages,
    list_asks,
    reopen_pending,
    ticket_status,
    transition_ask,
    update_ask,
)
from app.jobs.ticket_status import notify_ticket_status_changes
from tests.document_review_support import add_member
from tests.test_service_desk_asks import add_project, forbidden
from tests.test_ticket_messages import inbox, set_issue_category


NOW = _utcnow()
EARLIER = NOW - timedelta(hours=1)


@pytest.mark.parametrize(
    "ask_status,category,reopened_at,closed_at,expected",
    [
        ("accepted", "COMPLETED", NOW, EARLIER, True),
        ("accepted", "CANCELED", NOW, EARLIER, True),
        ("accepted", "COMPLETED", NOW, None, True),
        ("accepted", "COMPLETED", EARLIER, NOW, False),
        ("accepted", "STARTED", NOW, EARLIER, False),
        ("accepted", "COMPLETED", None, NOW, False),
        ("resolved", "COMPLETED", NOW, EARLIER, False),
    ],
)
def test_reopen_waits_for_the_team_only_while_the_issue_stays_closed(ask_status, category, reopened_at, closed_at, expected):
    assert reopen_pending(ask_status, category, reopened_at, closed_at) is expected


def test_reopened_ticket_ignores_its_closed_issue():
    assert ticket_status("accepted", "COMPLETED", reopened=True) == "received"
    assert ticket_status("accepted", "COMPLETED", reopened=False) == "done"


async def rejected(call, code):
    with pytest.raises(ApiError) as error:
        await call
    assert error.value.status_code == code


def act(action, message=None):
    return AskTransitionInput(action=action, message=message)


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_ticket_lifecycle():
    asyncio.run(verify_lifecycle())


async def set_issue_closed_at(db, issue_id, moment):
    await db.execute(text("UPDATE issues SET completed_at = :moment WHERE id = :id"), {"moment": moment, "id": issue_id})
    await db.commit()


async def verify_lifecycle():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
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
            requester = await add_member(db, workspace, None, name="Requester")
            other = await add_member(db, workspace, None, name="Other")
            await db.commit()
            project = await add_project(db, workspace, team, enabled=True)
            ticket = CreateAskInput(workspaceId=workspace, teamId=team, projectId=project, title="Cannot sign in")
            await notify_ticket_status_changes(factory)

            async def view(ask_id, user=requester):
                rows = (await list_asks(workspace, "mine" if user is requester else "team", user, db))["data"]
                return next(row for row in rows if row["id"] == ask_id)

            # Only the team decides on a ticket, and a decline needs its reason.
            # VI: Chỉ team quyết định trên ticket, và từ chối phải có lý do.
            declined_id = (await create_ask(ticket, requester, db))["data"]["id"]
            await forbidden(transition_ask(declined_id, act("resolve"), workspace, requester, db))
            await forbidden(transition_ask(declined_id, act("decline", "No"), workspace, requester, db))
            await forbidden(transition_ask(declined_id, act("resolve"), workspace, other, db))
            await rejected(transition_ask(declined_id, act("decline", "   "), workspace, handler, db), 400)
            await rejected(transition_ask(declined_id, act("reopen", "Again"), workspace, handler, db), 400)
            declined = (await transition_ask(declined_id, act("decline", "Out of scope"), workspace, handler, db))["data"]
            assert declined["ticketStatus"] == "declined"
            thread = (await list_ask_messages(declined_id, workspace, requester, db))["data"]
            assert [row["content"] for row in thread] == ["Out of scope"]
            note = (await inbox(db, workspace, requester))[0]
            assert note["type"] == "ticket.status_changed" and note["entityId"] == declined_id
            assert await notify_ticket_status_changes(factory) == 0

            # A decline is the team's decision: only the team takes it back.
            # VI: Từ chối là quyết định của team: chỉ team mới rút lại được.
            await forbidden(transition_ask(declined_id, act("reopen", "Please"), workspace, requester, db))
            await forbidden(transition_ask(declined_id, act("reopen", "Please"), workspace, other, db))
            await rejected(transition_ask(declined_id, act("reopen"), workspace, handler, db), 400)
            reopened = (await transition_ask(declined_id, act("reopen", "Looking again"), workspace, handler, db))["data"]
            assert reopened["status"] == "open" and reopened["ticketStatus"] != "declined"

            # Resolving closes an unconverted ticket and freezes it; the requester can reopen.
            # VI: Giải quyết đóng ticket chưa chuyển Issue và khoá nó; người yêu cầu mở lại được.
            resolved_id = (await create_ask(ticket, requester, db))["data"]["id"]
            resolved = (await transition_ask(resolved_id, act("resolve"), workspace, handler, db))["data"]
            assert resolved["status"] == "resolved" and resolved["ticketStatus"] == "done"
            assert await notify_ticket_status_changes(factory) == 0
            await rejected(update_ask(resolved_id, UpdateAskInput(title="Reworded"), workspace, requester, db), 400)
            await rejected(convert_ask(resolved_id, workspace, handler, db), 400)
            await rejected(transition_ask(resolved_id, act("resolve"), workspace, handler, db), 400)
            await rejected(transition_ask(resolved_id, act("reopen"), workspace, requester, db), 400)
            again = (await transition_ask(resolved_id, act("reopen", "Still broken"), workspace, requester, db))["data"]
            assert again["status"] == "open" and again["ticketStatus"] == "received"
            assert "reopenPending" not in again
            assert (await inbox(db, workspace, handler))[0]["entityId"] == resolved_id
            assert all(row["entityId"] != resolved_id or row["data"].get("body") != "Still broken" for row in await inbox(db, workspace, requester))
            assert await notify_ticket_status_changes(factory) == 0

            # Cancelling belongs to the creator; archiving belongs to the team.
            # VI: Huỷ thuộc về người tạo; lưu trữ thuộc về team.
            canceled_id = (await create_ask(ticket, requester, db))["data"]["id"]
            await forbidden(transition_ask(canceled_id, act("cancel"), workspace, handler, db))
            await forbidden(transition_ask(canceled_id, act("cancel"), workspace, other, db))
            await forbidden(archive_ask(canceled_id, workspace, requester, db))
            canceled = (await transition_ask(canceled_id, act("cancel"), workspace, requester, db))["data"]
            assert canceled["ticketStatus"] == "canceled"
            assert (await transition_ask(canceled_id, act("reopen", "Needed after all"), workspace, requester, db))["data"]["status"] == "open"

            # Reopening a converted ticket leaves the issue alone and hands the ticket to the team.
            # VI: Mở lại ticket đã chuyển Issue không đụng tới Issue và giao ticket lại cho team.
            converted_id = (await create_ask(ticket, requester, db))["data"]["id"]
            issue_id = (await convert_ask(converted_id, workspace, handler, db))["data"]["convertedIssueId"]
            await rejected(transition_ask(converted_id, act("cancel"), workspace, requester, db), 400)
            await rejected(transition_ask(converted_id, act("resolve"), workspace, handler, db), 400)
            await rejected(transition_ask(converted_id, act("decline", "No"), workspace, handler, db), 400)
            await forbidden(transition_ask(converted_id, act("reopen", "Early"), workspace, requester, db))
            await set_issue_category(db, workspace, issue_id, "COMPLETED")
            await set_issue_closed_at(db, issue_id, _utcnow())
            assert (await view(converted_id))["ticketStatus"] == "done"
            await notify_ticket_status_changes(factory)

            before = await db.execute(text("SELECT status_id FROM issues WHERE id = :id"), {"id": issue_id})
            status_before = before.scalar_one()
            back = (await transition_ask(converted_id, act("reopen", "Still broken"), workspace, requester, db))["data"]
            assert back["status"] == "accepted" and back["ticketStatus"] == "received"
            assert "convertedIssueId" not in back and "convertedIssue" not in back
            assert (await view(converted_id, handler))["reopenPending"] is True
            after = await db.execute(text("SELECT status_id FROM issues WHERE id = :id"), {"id": issue_id})
            assert after.scalar_one() == status_before
            assert await notify_ticket_status_changes(factory) == 0

            # Closing the issue again puts the ticket back on the issue, and the requester hears it.
            # VI: Đóng lại Issue đưa ticket về theo Issue, và người yêu cầu được báo.
            await set_issue_closed_at(db, issue_id, _utcnow() + timedelta(minutes=1))
            assert (await view(converted_id))["ticketStatus"] == "done"
            assert (await view(converted_id, handler))["reopenPending"] is False
            assert await notify_ticket_status_changes(factory) == 1

            # A pending reopening can also be settled without touching the issue.
            # VI: Yêu cầu mở lại đang chờ cũng có thể kết thúc mà không đụng tới Issue.
            await transition_ask(converted_id, act("reopen", "Once more"), workspace, requester, db)
            await set_issue_closed_at(db, issue_id, _utcnow() - timedelta(minutes=1))
            settled = (await transition_ask(converted_id, act("resolve", "Fixed by a restart"), workspace, handler, db))["data"]
            assert settled["ticketStatus"] == "done" and settled["convertedIssue"]
            assert (await transition_ask(converted_id, act("reopen", "No it is not"), workspace, requester, db))["data"]["status"] == "accepted"

            # A decision made while another was being read loses cleanly.
            # VI: Quyết định đưa ra trong lúc quyết định khác đang được đọc sẽ thua một cách rõ ràng.
            raced_id = (await create_ask(ticket, requester, db))["data"]["id"]
            is_handler = native_asks._is_handler

            async def closed_meanwhile(*args):
                async with factory() as rival:
                    await rival.execute(text("UPDATE asks SET status = 'resolved' WHERE id = :id"), {"id": raced_id})
                    await rival.commit()
                return await is_handler(*args)

            native_asks._is_handler = closed_meanwhile
            try:
                await rejected(transition_ask(raced_id, act("decline", "No"), workspace, handler, db), 409)
            finally:
                native_asks._is_handler = is_handler
            assert (await list_ask_messages(raced_id, workspace, requester, db))["data"] == []
    finally:
        await engine.dispose()
