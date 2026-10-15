import asyncio
import os

import pytest
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.portfolio.projects import project_page
from app.modules.portfolio.initiatives import initiative_page
from app.modules.portfolio.history import history_page


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_portfolio_pages_have_bounded_queries_stable_cursors_and_scoped_history():
    asyncio.run(verify_pages())


async def verify_pages():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    statements = []
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            owner, reader = [
                {"id": _cuid(), "name": "Portfolio test"} for _ in range(2)
            ]
            for user in [owner, reader]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                    ),
                    {**user, "email": _cuid() + "@example.test", "now": now},
                )
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name="Portfolio pages",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, hidden_team = seed["workspace_id"], seed["team_id"]
            await db.execute(
                text(
                    "INSERT INTO workspace_members(id,workspace_id,user_id,status,role,created_at,updated_at) VALUES (:id,:workspace,:user,'ACTIVE','MEMBER',:now,:now)"
                ),
                {
                    "id": _cuid(),
                    "workspace": workspace,
                    "user": reader["id"],
                    "now": now,
                },
            )
            await db.execute(
                text("""INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at)
                SELECT 'c'||md5(:workspace||n::text),:workspace,'Project '||n,'PAGE-'||n,:now,:now FROM generate_series(1,155) n"""),
                {"workspace": workspace, "now": now},
            )
            await db.execute(
                text("""INSERT INTO initiatives(id,workspace_id,name,created_at,updated_at)
                SELECT 'c'||md5(:workspace||'initiative'||n::text),:workspace,'Initiative '||n,:now,:now FROM generate_series(1,125) n"""),
                {"workspace": workspace, "now": now},
            )

            def observe(*args):
                statements.append(args[2])

            event.listen(engine.sync_engine, "before_cursor_execute", observe)
            first = await project_page(db, workspace, reader["id"], "page-secret")
            assert (
                len(statements) <= 5
                and len(first["data"]) == 100
                and first["meta"]["total"] == 155
            )
            statements.clear()
            second = await project_page(
                db,
                workspace,
                reader["id"],
                "page-secret",
                cursor=first["meta"]["nextCursor"],
            )
            assert (
                len(statements) <= 5
                and len(second["data"]) == 55
                and second["meta"]["nextCursor"] is None
            )
            assert not (
                {row["id"] for row in first["data"]}
                & {row["id"] for row in second["data"]}
            )
            with pytest.raises(ApiError):
                await project_page(
                    db,
                    workspace,
                    owner["id"],
                    "page-secret",
                    cursor=first["meta"]["nextCursor"],
                )
            statements.clear()
            initiatives = await initiative_page(
                db, workspace, reader["id"], "page-secret"
            )
            assert (
                len(statements) <= 7
                and len(initiatives["data"]) == 100
                and initiatives["meta"]["total"] == 125
            )
            more = await initiative_page(
                db,
                workspace,
                reader["id"],
                "page-secret",
                cursor=initiatives["meta"]["nextCursor"],
            )
            assert len(more["data"]) == 25
            project = first["data"][0]["id"]
            initiative = initiatives["data"][0]["id"]
            private = _cuid()
            await db.execute(
                text(
                    "INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,'Private','PRIVATE',:now,:now)"
                ),
                {
                    "id": private,
                    "workspace": workspace,
                    "team": hidden_team,
                    "now": now,
                },
            )
            for fixture_project in [project, private]:
                await db.execute(
                    text("""INSERT INTO project_updates(id,workspace_id,project_id,author_id,body,kind,created_at,updated_at)
                    SELECT 'c'||md5(:project||n::text),:workspace,:project,:user,'Update '||n,'update',:now,:now FROM generate_series(1,115) n"""),
                    {
                        "project": fixture_project,
                        "workspace": workspace,
                        "user": owner["id"],
                        "now": now,
                    },
                )
            await db.execute(
                text("""INSERT INTO initiative_updates(id,workspace_id,initiative_id,author_id,body,health,created_at,updated_at)
                SELECT 'c'||md5(:initiative||n::text),:workspace,:initiative,:user,'Update '||n,'on-track',:now,:now FROM generate_series(1,115) n"""),
                {
                    "initiative": initiative,
                    "workspace": workspace,
                    "user": owner["id"],
                    "now": now,
                },
            )
            for kind, identifier in [
                ("project_updates", None),
                ("project_updates", project),
                ("initiative_updates", initiative),
            ]:
                seen = set()
                cursor = None
                while True:
                    page = await history_page(
                        db,
                        workspace,
                        reader["id"],
                        "page-secret",
                        kind,
                        identifier,
                        cursor=cursor,
                    )
                    assert page["meta"]["total"] == 115
                    ids = {row["id"] for row in page["data"]}
                    assert not seen & ids
                    seen |= ids
                    cursor = page["meta"]["nextCursor"]
                    if not cursor:
                        break
                assert len(seen) == 115
            with pytest.raises(ApiError):
                await history_page(
                    db,
                    workspace,
                    reader["id"],
                    "page-secret",
                    "project_updates",
                    private,
                )
            await db.rollback()
    finally:
        await engine.dispose()
