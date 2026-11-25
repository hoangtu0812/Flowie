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
    CategoryInput,
    CreateAskInput,
    UpdateAskInput,
    UpdateCategoryInput,
    create_ask,
    create_category,
    list_categories,
    update_ask,
    update_category,
)
from tests.document_review_support import add_member
from tests.test_service_desk_asks import add_project


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_ticket_categories():
    asyncio.run(verify_categories())


async def status_of(call) -> int:
    with pytest.raises(ApiError) as error:
        await call
    return error.value.status_code


async def verify_categories():
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
            workspace, team = seed["workspace_id"], seed["team_id"]
            handler = await add_member(db, workspace, team, name="Handler")
            requester = await add_member(db, workspace, None, name="Requester")
            await db.commit()
            intake = await add_project(db, workspace, team, enabled=True)
            internal = await add_project(db, workspace, team, enabled=False)
            ticket = CreateAskInput(workspaceId=workspace, teamId=team, projectId=intake, title="Printer jams")

            # Without categories, tickets are raised as before.
            # VI: Chưa có phân loại thì ticket được tạo như trước.
            assert (await create_ask(ticket, requester, db))["data"]["category"] is None

            # Only administrators manage the list; names are unique regardless of case.
            # VI: Chỉ quản trị viên quản lý danh sách; tên không trùng, không phân biệt hoa thường.
            assert await status_of(create_category(CategoryInput(workspaceId=workspace, name="Hardware"), handler, db)) == 403
            hardware = (await create_category(CategoryInput(workspaceId=workspace, name=" Hardware "), owner, db))["data"]
            assert hardware == {"id": hardware["id"], "name": "Hardware", "archived": False}
            software = (await create_category(CategoryInput(workspaceId=workspace, name="Software"), owner, db))["data"]
            assert await status_of(create_category(CategoryInput(workspaceId=workspace, name="hardware"), owner, db)) == 409
            assert [row["name"] for row in (await list_categories(workspace, False, requester, db))["data"]] == ["Hardware", "Software"]

            # Intake now needs a live category; a team's own Ask does not.
            # VI: Ticket tiếp nhận giờ phải có phân loại còn hiệu lực; Ask team tự tạo thì không cần.
            assert await status_of(create_ask(ticket, requester, db)) == 400
            created = (await create_ask(ticket.model_copy(update={"categoryId": hardware["id"]}), requester, db))["data"]
            assert created["category"] == {"id": hardware["id"], "name": "Hardware"}
            own = CreateAskInput(workspaceId=workspace, teamId=team, projectId=internal, title="Internal follow-up")
            assert (await create_ask(own, handler, db))["data"]["category"] is None

            moved = await update_ask(created["id"], UpdateAskInput(categoryId=software["id"]), workspace, handler, db)
            assert moved["data"]["category"]["name"] == "Software"
            assert await status_of(update_ask(created["id"], UpdateAskInput(categoryId=None), workspace, handler, db)) == 400

            # Archiving hides a category from new tickets but keeps it on old ones.
            # VI: Lưu trữ ẩn phân loại khỏi ticket mới nhưng vẫn giữ trên ticket cũ.
            archived = await update_category(software["id"], UpdateCategoryInput(archived=True), workspace, owner, db)
            assert archived["data"]["archived"] is True
            assert [row["name"] for row in (await list_categories(workspace, False, requester, db))["data"]] == ["Hardware"]
            assert await status_of(list_categories(workspace, True, requester, db)) == 403
            assert len((await list_categories(workspace, True, owner, db))["data"]) == 2
            assert await status_of(create_ask(ticket.model_copy(update={"categoryId": software["id"]}), requester, db)) == 400
            kept = await update_ask(created["id"], UpdateAskInput(title="Printer jams again"), workspace, handler, db)
            assert kept["data"]["category"]["name"] == "Software"
    finally:
        await engine.dispose()
