import asyncio
import os
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.contracts import CreateIssueInput, CreateDocumentInput
from app.modules.work_items.issues import create_issue
from app.modules.work_items.documents import create_document
from app.modules.search.service import search


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_workspace_search_unicode_scope_and_signed_pages():
    asyncio.run(verify_search())


async def verify_search():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            user = {"id": _cuid(), "name": "Đăng nhập owner"}
            now = _utcnow()
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user["id"],
                organization_name="Search",
                workspace_name=_cuid(),
                now=now,
            )
            issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=seed["workspace_id"],
                        teamId=seed["team_id"],
                        title="Đăng nhập task",
                    ),
                    user,
                    db,
                )
            )["data"]
            document = (
                await create_document(
                    CreateDocumentInput(
                        workspaceId=seed["workspace_id"],
                        title="Đăng nhập guide",
                        content="Content only keyword",
                    ),
                    user,
                    db,
                )
            )["data"]
            project = _cuid()
            await db.execute(
                text(
                    "INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,'Đăng nhập project','SRCH',:now,:now)"
                ),
                {
                    "id": project,
                    "workspace": seed["workspace_id"],
                    "team": seed["team_id"],
                    "now": now,
                },
            )
            first = await search(
                db, seed["workspace_id"], user["id"], "secret", "dang nhap", limit=2
            )
            second = await search(
                db,
                seed["workspace_id"],
                user["id"],
                "secret",
                "dang nhap",
                limit=2,
                cursor=first["meta"]["nextCursor"],
            )
            assert {item["kind"] for item in first["data"] + second["data"]} == {
                "issue",
                "document",
                "project",
                "member",
            }
            assert {item["id"] for item in first["data"] + second["data"]} == {
                issue["id"],
                document["id"],
                project,
                user["id"],
            }
            content = await search(
                db,
                seed["workspace_id"],
                user["id"],
                "secret",
                "Content only",
                kind="document",
            )
            assert content["data"][0]["path"] == "/documents/" + document["id"]
            with pytest.raises(ApiError) as error:
                await search(
                    db,
                    seed["workspace_id"],
                    user["id"],
                    "secret",
                    "different",
                    cursor=first["meta"]["nextCursor"],
                )
            assert error.value.status_code == 400
            hidden = _cuid()
            await db.execute(
                text(
                    "INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Private','PRIV',:now,:now)"
                ),
                {"id": hidden, "workspace": seed["workspace_id"], "now": now},
            )
            await db.execute(
                text(
                    "INSERT INTO documents(id,workspace_id,team_id,title,content,created_by,updated_by,created_at,updated_at) VALUES (:id,:workspace,:team,'Hidden document','Secret word',:user,:user,:now,:now)"
                ),
                {
                    "id": _cuid(),
                    "workspace": seed["workspace_id"],
                    "team": hidden,
                    "user":user["id"],
                    "now": now,
                },
            )
            assert (
                await search(
                    db, seed["workspace_id"], user["id"], "secret", "Secret word"
                )
            )["data"] == []
            assert (await search(db, seed["workspace_id"], user["id"], "secret", "%"))[
                "data"
            ] == []
            await db.rollback()
    finally:
        await engine.dispose()
