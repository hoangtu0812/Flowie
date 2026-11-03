import asyncio
import json
import os
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.issue_search import search_page
from app.modules.work_items.issue_sort import parse_sort, SORT_COLUMNS


def test_invalid_sort_is_rejected():
    for value in [
        "bad",
        "{}",
        '[{"key":"title; DROP TABLE issues","direction":"asc"}]',
        '[{"key":"title","direction":"ASC"}]',
        '[{"key":"title","direction":"asc"},{"key":"title","direction":"desc"}]',
        json.dumps(
            [{"key": key, "direction": "asc"} for key in list(SORT_COLUMNS)[:6]]
        ),
    ]:
        with pytest.raises(ApiError) as error:
            parse_sort(value)
        assert error.value.status_code == 400


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_sorted_pages_cover_scope_and_validate_cursors():
    asyncio.run(verify_sort())


async def verify_sort():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now, user = _utcnow(), _cuid()
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Sort owner',:email,'ACTIVE',:now,:now)"
                ),
                {"id": user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user,
                organization_name="Sorting",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            status = (
                await db.execute(
                    text(
                        "SELECT id FROM issue_statuses WHERE workspace_id=:w ORDER BY position LIMIT 1"
                    ),
                    {"w": workspace},
                )
            ).scalar_one()
            fixtures = [
                {
                    "id": _cuid(),
                    "number": n + 1,
                    "title": f"Title {n % 7:02}",
                    "effort": None if n % 11 == 0 else n % 5,
                }
                for n in range(123)
            ]
            for row in fixtures:
                await db.execute(
                    text("""INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,estimated_effort,creator_id,created_at,updated_at)
                VALUES (:id,:w,:t,:s,:identifier,:number,:title,:effort,:u,:now,:now)"""),
                    {
                        **row,
                        "w": workspace,
                        "t": team,
                        "s": status,
                        "identifier": f"SORT-{row['number']}",
                        "u": user,
                        "now": now,
                    },
                )
            sorts = [
                {"key": "title", "direction": "asc"},
                {"key": "estimatedEffort", "direction": "desc"},
            ]
            options = {"sort": json.dumps(sorts), "limit": 100}
            first = await search_page(db, workspace, user, "secret", options)
            assert first["meta"]["total"] == 123 and first["meta"]["nextCursor"]
            second = await search_page(
                db,
                workspace,
                user,
                "secret",
                {**options, "cursor": first["meta"]["nextCursor"]},
            )
            expected = sorted(
                fixtures,
                key=lambda r: (
                    r["title"],
                    r["effort"] is None,
                    -(r["effort"] or 0),
                    r["id"],
                ),
            )
            assert [r["id"] for r in first["data"] + second["data"]] == [
                r["id"] for r in expected
            ]
            assert second["meta"]["nextCursor"] is None
            for key in SORT_COLUMNS:
                result = await search_page(
                    db,
                    workspace,
                    user,
                    "secret",
                    {
                        "sort": json.dumps([{"key": key, "direction": "desc"}]),
                        "limit": 1,
                    },
                )
                assert result["meta"]["total"] == 123
            with pytest.raises(ApiError) as error:
                await search_page(
                    db,
                    workspace,
                    user,
                    "secret",
                    {
                        **options,
                        "sort": '[{"key":"title","direction":"desc"}]',
                        "cursor": first["meta"]["nextCursor"],
                    },
                )
            assert error.value.status_code == 400
            with pytest.raises(ApiError) as error:
                await search_page(
                    db, workspace, user, "secret", {**options, "ordering": "manual"}
                )
            assert error.value.status_code == 400
            anchor = first["data"][-1]["id"]
            await db.execute(
                text("UPDATE issues SET title='000 first' WHERE id=:id"), {"id": anchor}
            )
            with pytest.raises(ApiError) as error:
                await search_page(
                    db,
                    workspace,
                    user,
                    "secret",
                    {**options, "cursor": first["meta"]["nextCursor"]},
                )
            assert error.value.status_code == 409
            await db.rollback()
    finally:
        await engine.dispose()
