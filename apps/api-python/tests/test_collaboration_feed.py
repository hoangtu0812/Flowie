import os
import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.collaboration_feed import activity_page, comment_page
from app.modules.work_items.contracts import CreateIssueInput
from app.modules.work_items.issues import create_issue


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_bounded_feed_batches_relations_and_binds_cursor_to_issue():
    asyncio.run(verify_bounded_feed())


async def verify_bounded_feed():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    statements = []
    event.listen(
        engine.sync_engine,
        "before_cursor_execute",
        lambda *args: statements.append(args[2]),
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now, user = _utcnow(), {"id": _cuid(), "name": "Feed owner"}
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user["id"],
                organization_name="Feed",
                workspace_name=_cuid(),
                now=now,
            )
            issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=seed["workspace_id"],
                        teamId=seed["team_id"],
                        title="Feed fixture",
                    ),
                    user,
                    db,
                )
            )["data"]
            other = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=seed["workspace_id"],
                        teamId=seed["team_id"],
                        title="Other fixture",
                    ),
                    user,
                    db,
                )
            )["data"]
            roots = []
            for index in range(40):
                identifier = _cuid()
                roots.append(identifier)
                await db.execute(
                    text(
                        "INSERT INTO comments(id,issue_id,author_id,content,created_at,updated_at) VALUES (:id,:issue,:user,:content,:now,:now)"
                    ),
                    {
                        "id": identifier,
                        "issue": issue["id"],
                        "user": user["id"],
                        "content": f"Root {index}",
                        "now": now - timedelta(minutes=index),
                    },
                )
            for index in range(7):
                await db.execute(
                    text(
                        "INSERT INTO comments(id,issue_id,author_id,parent_comment_id,content,created_at,updated_at) VALUES (:id,:issue,:user,:parent,:content,:now,:now)"
                    ),
                    {
                        "id": _cuid(),
                        "issue": issue["id"],
                        "user": user["id"],
                        "parent": roots[0],
                        "content": f"Reply {index}",
                        "now": now + timedelta(seconds=index + 1),
                    },
                )
            statements.clear()
            first = await comment_page(
                db,
                seed["workspace_id"],
                issue["id"],
                user["id"],
                "test-secret",
                limit=2,
                threaded=True,
            )
            count = len(statements)
            assert len(first["data"]) == 7
            assert (
                next(item for item in first["data"] if item["id"] == roots[0])[
                    "replyCount"
                ]
                == 7
            )
            statements.clear()
            large = await comment_page(
                db,
                seed["workspace_id"],
                issue["id"],
                user["id"],
                "test-secret",
                limit=30,
                threaded=True,
            )
            assert len(statements) == count and count <= 12
            assert len(large["data"]) == 35
            second = await comment_page(
                db,
                seed["workspace_id"],
                issue["id"],
                user["id"],
                "test-secret",
                limit=2,
                threaded=True,
                cursor=first["meta"]["nextCursor"],
            )
            assert not (
                {item["id"] for item in first["data"]}
                & {item["id"] for item in second["data"]}
            )
            with pytest.raises(ApiError) as error:
                await comment_page(
                    db,
                    seed["workspace_id"],
                    other["id"],
                    user["id"],
                    "test-secret",
                    threaded=True,
                    cursor=first["meta"]["nextCursor"],
                )
            assert error.value.status_code == 400
            thread = await comment_page(
                db,
                seed["workspace_id"],
                issue["id"],
                user["id"],
                "test-secret",
                limit=3,
                parent_id=roots[0],
            )
            assert len(thread["data"]) == 3 and thread["meta"]["nextCursor"]
            activity = await activity_page(
                db,
                seed["workspace_id"],
                user["id"],
                "test-secret",
                issue_id=issue["id"],
                limit=1,
            )
            assert len(activity["data"]) == 1
            await db.rollback()
    finally:
        await engine.dispose()
