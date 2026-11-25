import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.service_desk.api import (
    CreateAskInput,
    UpdateAskInput,
    create_ask,
    list_asks,
    update_ask,
)
from app.modules.teams.api import UpdateTeamInput, update_team
from tests.document_review_support import add_member
from tests.test_service_desk_asks import add_project


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_tickets_move_between_support_tiers():
    asyncio.run(verify_tiers())


async def status_of(call) -> int:
    with pytest.raises(ApiError) as error:
        await call
    return error.value.status_code


async def verify_tiers():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            now = utcnow()
            owner = {"id": cuid(), "name": "Owner"}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**owner, "email": cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(db, user_id=owner["id"], organization_name="Desk", workspace_name=cuid(), now=now)
            workspace, first_line = seed["workspace_id"], seed["team_id"]
            second_line = cuid()
            await db.execute(
                text("INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Network','NET',:now,:now)"),
                {"id": second_line, "workspace": workspace, "now": now},
            )
            dispatcher = await add_member(db, workspace, first_line, name="Dispatcher")
            engineer = await add_member(db, workspace, second_line, name="Engineer")
            requester = await add_member(db, workspace, None, name="Requester")
            await db.commit()
            project = await add_project(db, workspace, first_line, enabled=True)
            ticket = (await create_ask(CreateAskInput(workspaceId=workspace, teamId=first_line, projectId=project, title="VPN drops"), requester, db))["data"]
            move = UpdateAskInput(teamId=second_line, assigneeId=engineer["id"])

            # A team without a tier cannot receive tickets.
            # VI: Team chưa có cấp thì không nhận ticket.
            assert await status_of(update_ask(ticket["id"], move, workspace, dispatcher, db)) == 400
            await update_team(first_line, UpdateTeamInput(supportTier=1), workspace, owner, db)
            await update_team(second_line, UpdateTeamInput(supportTier=2), workspace, owner, db)

            # Only the team holding the ticket moves it, and the project stays as it was.
            # VI: Chỉ team đang giữ ticket mới chuyển được, và dự án giữ nguyên.
            assert await status_of(update_ask(ticket["id"], move, workspace, requester, db)) == 403
            assert await status_of(update_ask(ticket["id"], move, workspace, engineer, db)) == 403
            assert await status_of(update_ask(ticket["id"], move.model_copy(update={"projectId": None}), workspace, dispatcher, db)) == 400
            moved = (await update_ask(ticket["id"], move, workspace, dispatcher, db))["data"]
            assert (moved["teamId"], moved["assigneeId"], moved["projectId"]) == (second_line, engineer["id"], project)
            assert moved["team"]["supportTier"] == 2

            assert [row["id"] for row in (await list_asks(workspace, "team", engineer, db))["data"]] == [ticket["id"]]
            assert (await list_asks(workspace, "team", dispatcher, db))["data"] == []
            assert await status_of(update_ask(ticket["id"], UpdateAskInput(priority="HIGH"), workspace, dispatcher, db)) == 403
            notified = await db.execute(
                text("SELECT count(*) FROM notifications WHERE user_id = :user AND type = 'ticket.transferred'"),
                {"user": engineer["id"]},
            )
            assert notified.scalar_one() == 1

            # Moving back without an assignee clears it and leaves the ticket to the whole team.
            # VI: Chuyển lại mà không chỉ định người thì bỏ người được giao, để cả team nhận.
            back = (await update_ask(ticket["id"], UpdateAskInput(teamId=first_line), workspace, engineer, db))["data"]
            assert (back["teamId"], back["assigneeId"]) == (first_line, None)
    finally:
        await engine.dispose()
