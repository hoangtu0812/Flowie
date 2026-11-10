import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.identifiers import cuid
from app.domains.native_asks import (
    AskMessageInput,
    AskTransitionInput,
    CreateAskInput,
    create_ask,
    create_ask_message,
    transition_ask,
)
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.notifications.outbox import process_one
from tests.document_review_support import add_member
from tests.test_service_desk_asks import add_project

PROJECT_HOOK = "https://prod.westus.logic.azure.com/workflows/project/triggers/manual"
WORKSPACE_HOOK = "https://prod.westus.logic.azure.com/workflows/workspace/triggers/manual"


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_new_tickets_reach_only_the_project_channel():
    asyncio.run(verify_cards())


async def add_channel(db, project, *, enabled=True):
    now = utcnow()
    await db.execute(
        text("INSERT INTO project_teams_channels(id,project_id,webhook_url,enabled,created_at,updated_at) VALUES (:id,:project,:url,:enabled,:now,:now)"),
        {"id": cuid(), "project": project, "url": PROJECT_HOOK, "enabled": enabled, "now": now},
    )
    await db.commit()


async def verify_cards():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
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
            requester = await add_member(db, workspace, None, name="Requester")
            await db.execute(
                text("INSERT INTO teams_webhooks(id,workspace_id,webhook_url,enabled,created_at,updated_at) VALUES (:id,:workspace,:url,true,:now,:now)"),
                {"id": cuid(), "workspace": workspace, "url": WORKSPACE_HOOK, "now": now},
            )
            await db.commit()
            connected = await add_project(db, workspace, team, enabled=True)
            await add_channel(db, connected)
            silent = await add_project(db, workspace, team, enabled=True)
            paused = await add_project(db, workspace, team, enabled=True)
            await add_channel(db, paused, enabled=False)

            def ticket(project):
                return CreateAskInput(workspaceId=workspace, teamId=team, projectId=project, title="Cannot sign in", description="Private details")

            async def pending_cards():
                result = await db.execute(
                    text("SELECT id, payload FROM notification_outbox WHERE workspace_id = :workspace AND delivered_at IS NULL AND failed_at IS NULL AND payload::text LIKE '%teams_cards%'"),
                    {"workspace": workspace},
                )
                await db.commit()
                rows = [(row["id"], json.loads(row["payload"]) if isinstance(row["payload"], str) else row["payload"]) for row in result.mappings()]
                return [(outbox_id, card) for outbox_id, payload in rows for card in payload["teams_cards"]]

            async def clear():
                await db.execute(text("UPDATE notification_outbox SET delivered_at = :now WHERE workspace_id = :workspace"), {"now": utcnow(), "workspace": workspace})
                await db.commit()

            with patch("app.services.notification_events.teams_available", return_value=True):
                ask = (await create_ask(ticket(connected), requester, db))["data"]
                cards = await pending_cards()
                assert [card["url"] for _, card in cards] == [PROJECT_HOOK]
                rendered = json.dumps(cards[0][1]["message"], ensure_ascii=False)
                assert f"{ask['identifier']} · Cannot sign in" in rendered
                assert "Requester raised a ticket" in rendered
                assert "Private details" not in rendered
                await clear()

                # Later events on the ticket stay out of the channel.
                # VI: Các sự kiện sau đó trên ticket không vào kênh.
                await create_ask_message(ask["id"], AskMessageInput(content="Hello"), workspace, handler, db)
                await transition_ask(ask["id"], AskTransitionInput(action="resolve"), workspace, handler, db)
                assert await pending_cards() == []

                # No project channel means no card, whatever the workspace has.
                # VI: Không có kênh dự án thì không có card, dù workspace có kênh.
                await create_ask(ticket(silent), requester, db)
                await create_ask(ticket(paused), requester, db)
                assert await pending_cards() == []

            with patch("app.services.notification_events.teams_available", return_value=False):
                await create_ask(ticket(connected), requester, db)
                assert await pending_cards() == []

            # A Teams failure leaves the card to retry and does not touch the Inbox row's delivery.
            # VI: Lỗi Teams để card được thử lại và không ảnh hưởng việc gửi thông báo Inbox.
            with patch("app.services.notification_events.teams_available", return_value=True):
                failed = (await create_ask(ticket(connected), requester, db))["data"]
            outbox_id = (await pending_cards())[0][0]
            client = MagicMock()
            client.__aenter__ = AsyncMock(return_value=client)
            client.__aexit__ = AsyncMock(return_value=None)
            client.post = AsyncMock(side_effect=OSError("teams down"))
            with patch("app.modules.notifications.outbox.httpx.AsyncClient", return_value=client):
                assert await process_one(factory, outbox_id) is True
            assert (await pending_cards())[0][0] == outbox_id
            stored = await db.execute(text("SELECT count(*) FROM asks WHERE id = :id"), {"id": failed["id"]})
            assert stored.scalar_one() == 1
            inbox = await db.execute(
                text("SELECT count(*) FROM notification_outbox WHERE workspace_id = :workspace AND delivered_at IS NULL AND payload::text LIKE '%ticket.created%' AND id <> :id"),
                {"workspace": workspace, "id": outbox_id},
            )
            assert inbox.scalar_one() >= 1
    finally:
        await engine.dispose()
