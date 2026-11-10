import asyncio
import os
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.identifiers import cuid
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.service_desk.api import (
    CreateAskInput,
    archive_ask,
    create_ask,
    list_asks,
    record_ticket_file,
)
from tests.document_review_support import add_member
from tests.test_service_desk_asks import add_project
from tests.test_ticket_messages import inbox


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_ticket_numbers_and_file_notices():
    asyncio.run(verify_numbers())


async def add_workspace(db):
    now = utcnow()
    owner = {"id": cuid(), "name": "Owner"}
    await db.execute(
        text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
        {**owner, "email": cuid() + "@example.test", "now": now},
    )
    seed = await create_workspace_bootstrap(db, user_id=owner["id"], organization_name="Desk", workspace_name=cuid(), now=now)
    return owner, seed["workspace_id"], seed["team_id"]


async def verify_numbers():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as db:
            owner, workspace, team = await add_workspace(db)
            handler = await add_member(db, workspace, team, name="Handler")
            requester = await add_member(db, workspace, None, name="Requester")
            await db.commit()
            project = await add_project(db, workspace, team, enabled=True)
            ticket = CreateAskInput(workspaceId=workspace, teamId=team, projectId=project, title="Cannot sign in")

            first = (await create_ask(ticket, requester, db))["data"]
            second = (await create_ask(ticket, requester, db))["data"]
            assert (first["number"], first["identifier"]) == (1, "SD-1")
            assert second["identifier"] == "SD-2"

            # Numbers run per workspace, so another workspace starts again.
            # VI: Số chạy theo từng workspace, nên workspace khác bắt đầu lại.
            other_owner, other_workspace, other_team = await add_workspace(db)
            await db.commit()
            elsewhere = CreateAskInput(workspaceId=other_workspace, teamId=other_team, title="Elsewhere")
            assert (await create_ask(elsewhere, other_owner, db))["data"]["identifier"] == "SD-1"

            # An archived ticket keeps its number, so the next ticket cannot take it over.
            # VI: Ticket đã lưu trữ giữ số của nó, nên ticket sau không thể dùng lại.
            await archive_ask(second["id"], workspace, handler, db)
            assert (await create_ask(ticket, requester, db))["data"]["identifier"] == "SD-3"

            async def raise_ticket(_):
                async with factory() as session:
                    return (await create_ask(ticket, requester, session))["data"]["number"]

            numbers = await asyncio.gather(*(raise_ticket(index) for index in range(8)))
            assert sorted(numbers) == list(range(4, 12))
            rows = (await list_asks(workspace, "mine", requester, db))["data"]
            assert len({row["identifier"] for row in rows}) == len(rows)

            # The team hears the code with the new ticket.
            # VI: Team nhận được mã cùng với ticket mới.
            created = next(row for row in await inbox(db, workspace, handler) if row["entityId"] == first["id"])
            assert created["data"]["entityLabel"] == "SD-1"

            # A file reaches the other side once, and the person adding it hears nothing.
            # VI: File được báo cho bên còn lại một lần, và người thêm không nhận thông báo.
            await db.execute(text("UPDATE audit_logs SET created_at = created_at - interval '5 minutes' WHERE entity_id = :id"), {"id": first["id"]})
            await db.execute(text("UPDATE asks SET updated_at = updated_at - interval '5 minutes' WHERE id = :id"), {"id": first["id"]})
            await record_ticket_file(db, first["id"], workspace, handler, "steps.txt")
            await db.commit()

            async def files(user):
                notes = await inbox(db, workspace, user)
                return [row for row in notes if row["type"] == "ticket.attachment" and row["entityId"] == first["id"]]

            notes = await files(requester)
            assert len(notes) == 1 and notes[0]["data"]["body"] == "steps.txt"
            assert notes[0]["data"]["entityLabel"] == "SD-1"
            assert await files(handler) == []
            moved = await db.execute(text("SELECT updated_at > now() - interval '1 minute' FROM asks WHERE id = :id"), {"id": first["id"]})
            assert moved.scalar_one() is True

            await record_ticket_file(db, first["id"], workspace, handler, "more.txt")
            await db.commit()
            assert len(await files(requester)) == 1

            # A later file is news again.
            # VI: File thêm sau đó lại là tin mới.
            await db.execute(text("UPDATE audit_logs SET created_at = :old WHERE entity_id = :id"), {"old": utcnow() - timedelta(minutes=2), "id": first["id"]})
            await record_ticket_file(db, first["id"], workspace, handler, "later.txt")
            await db.commit()
            assert len(await files(requester)) == 2

            # Files sent with a new ticket travel with its own notification.
            # VI: File gửi kèm ticket mới đi cùng thông báo của chính ticket đó.
            fresh = (await create_ask(ticket, requester, db))["data"]["id"]
            await record_ticket_file(db, fresh, workspace, requester, "screenshot.png")
            await db.commit()
            kinds = [row["type"] for row in await inbox(db, workspace, handler) if row["entityId"] == fresh]
            assert kinds == ["ticket.created"]
    finally:
        await engine.dispose()
