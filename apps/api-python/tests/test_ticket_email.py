import asyncio
import os
from dataclasses import replace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import Settings, _async_database_url
from app.core.identifiers import cuid
from app.domains.native_asks import (
    AskMessageInput,
    AskTransitionInput,
    CreateAskInput,
    archive_ask,
    create_ask,
    create_ask_message,
    transition_ask,
)
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.notifications.delivery_worker import deliver_one
from app.modules.notifications.ticket_email import ticket_email
from tests.document_review_support import add_member
from tests.test_service_desk_asks import add_project


def target(**changes):
    return {
        "data": {
            "title": "Cannot\nsign in",
            "message": "resolved the ticket",
            "entityLabel": "SD-7",
            "actor": {"name": "Handler"},
            "body": "The secret reason",
        },
        "workspace_slug": "desk",
        "entity_id": "ticket-1",
        "ticket_owner": "requester",
        "user_id": "requester",
    } | changes


def test_ticket_email_keeps_headers_safe_and_content_private():
    subject, body = ticket_email(target(), "https://poc.test/flowie")
    assert subject == "[SD-7] Cannot sign in"
    assert "Handler đã giải quyết ticket SD-7: Cannot sign in" in body
    assert "https://poc.test/flowie/desk/service-desk/ticket-1" in body
    assert "https://poc.test/flowie/servicedesk?workspace=desk" in body
    assert "secret" not in body


def test_team_members_are_sent_to_their_settings():
    _, body = ticket_email(target(user_id="handler"), "https://poc.test")
    assert "Settings > Notifications" in body
    assert "/servicedesk?" not in body


def test_status_changes_show_the_new_status():
    data = target()["data"] | {
        "message": "Your ticket status changed",
        "actor": {"name": "Flowie"},
        "details": [{"name": "Status", "value": "In progress → Done"}],
    }
    _, body = ticket_email(target(data=data), "https://poc.test")
    assert "Flowie đã cập nhật ticket SD-7" in body
    assert "In progress → Done" in body


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_ticket_email_delivery():
    asyncio.run(verify_delivery())


async def verify_delivery():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    settings = replace(
        Settings.from_environment(),
        database_url=os.environ["MCP_TEST_DATABASE_URL"],
        smtp_host="localhost",
        smtp_from="flowie@example.test",
        app_url="https://poc.test/flowie",
    )
    try:
        async with factory() as db:
            now = utcnow()
            owner = {"id": cuid(), "name": "Owner"}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**owner, "email": cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(db, user_id=owner["id"], organization_name="Desk", workspace_name=cuid(), now=now)
            workspace, team = seed["workspace_id"], seed["team_id"]
            handler = await add_member(db, workspace, team, name="Handler")
            colleague = await add_member(db, workspace, team, name="Colleague")
            requester = await add_member(db, workspace, None, name="Requester")
            await db.execute(text("UPDATE users SET email_verified_at = :now WHERE id = ANY(:ids)"), {"now": now, "ids": [handler["id"], colleague["id"], requester["id"]]})
            await db.commit()
            project = await add_project(db, workspace, team, enabled=True)
            ticket = CreateAskInput(workspaceId=workspace, teamId=team, projectId=project, title="Cannot sign in")

            async def queued(ask_id, user):
                result = await db.execute(
                    text(
                        """SELECT n.id FROM notifications n JOIN notification_email_deliveries e ON e.notification_id = n.id
                        WHERE n.entity_id = :ask_id AND n.user_id = :user_id AND e.delivered_at IS NULL AND e.failed_at IS NULL"""
                    ),
                    {"ask_id": ask_id, "user_id": user["id"]},
                )
                await db.commit()
                return list(result.scalars().all())

            async def deliver(notification_id, send):
                await deliver_one(factory, settings, send, notification_id)

            async def outcome(notification_id):
                result = await db.execute(
                    text("SELECT delivered_at IS NOT NULL, failed_at IS NOT NULL, last_error_code FROM notification_email_deliveries WHERE notification_id = :id"),
                    {"id": notification_id},
                )
                await db.commit()
                return tuple(result.one())

            # The creator gets email without opening any setting; the team does not.
            # VI: Người tạo nhận email mà không cần bật gì; team thì không.
            ask_id = (await create_ask(ticket, requester, db))["data"]["id"]
            assert await queued(ask_id, handler) == []
            await create_ask_message(ask_id, AskMessageInput(content="Private answer"), workspace, handler, db)
            ids = await queued(ask_id, requester)
            assert len(ids) == 1
            send = AsyncMock()
            await deliver(ids[0], send)
            email = send.await_args.args[1]
            assert email["Subject"].endswith("Cannot sign in") and email["Subject"].startswith("[SD-")
            content = email.get_content()
            assert f"/service-desk/{ask_id}" in content
            assert "Private answer" not in content
            assert (await outcome(ids[0]))[0] is True

            # A failed send retries in the background and leaves the ticket as it was.
            # VI: Gửi lỗi được thử lại ở nền và không ảnh hưởng ticket.
            await transition_ask(ask_id, AskTransitionInput(action="resolve"), workspace, handler, db)
            ids = await queued(ask_id, requester)
            await deliver(ids[0], AsyncMock(side_effect=OSError("smtp down")))
            assert await outcome(ids[0]) == (False, False, "SMTP_ERROR")

            # Switching off also stops what is already queued, and nothing new is queued.
            # VI: Tắt email cũng dừng các dòng đang chờ, và không xếp thêm dòng mới.
            await db.execute(
                text("INSERT INTO notification_preferences(workspace_id,user_id,ticket_email_enabled,created_at,updated_at) VALUES (:w,:u,false,:now,:now)"),
                {"w": workspace, "u": requester["id"], "now": utcnow()},
            )
            await db.execute(text("UPDATE notification_email_deliveries SET available_at = :now, lease_until = NULL WHERE notification_id = :id"), {"now": utcnow(), "id": ids[0]})
            await db.commit()
            send = AsyncMock()
            await deliver(ids[0], send)
            send.assert_not_awaited()
            assert await outcome(ids[0]) == (False, True, "RECIPIENT_DISABLED")
            second = (await create_ask(ticket, requester, db))["data"]["id"]
            await create_ask_message(second, AskMessageInput(content="Hello"), workspace, handler, db)
            assert await queued(second, requester) == []
            await db.execute(text("DELETE FROM notification_preferences WHERE user_id = :u"), {"u": requester["id"]})
            await db.commit()

            # Old rows and archived tickets are dropped rather than sent late.
            # VI: Dòng cũ và ticket đã lưu trữ bị bỏ thay vì gửi muộn.
            await create_ask_message(second, AskMessageInput(content="Again"), workspace, handler, db)
            ids = await queued(second, requester)
            await db.execute(text("UPDATE notifications SET created_at = created_at - interval '2 days' WHERE id = :id"), {"id": ids[0]})
            await db.commit()
            send = AsyncMock()
            await deliver(ids[0], send)
            send.assert_not_awaited()
            await create_ask_message(second, AskMessageInput(content="More"), workspace, handler, db)
            ids = await queued(second, requester)
            await archive_ask(second, workspace, handler, db)
            await deliver(ids[0], send)
            send.assert_not_awaited()

            # A team member who chose email gets the ticket wording too.
            # VI: Thành viên team đã bật email cũng nhận nội dung email ticket.
            await db.execute(
                text("INSERT INTO notification_preferences(workspace_id,user_id,email_enabled,created_at,updated_at) VALUES (:w,:u,true,:now,:now)"),
                {"w": workspace, "u": colleague["id"], "now": utcnow()},
            )
            await db.commit()
            third = (await create_ask(ticket, requester, db))["data"]["id"]
            ids = await queued(third, colleague)
            send = AsyncMock()
            await deliver(ids[0], send)
            assert "Settings > Notifications" in send.await_args.args[1].get_content()
    finally:
        await engine.dispose()
