import asyncio
import os
from datetime import timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.agent_runs.operations import (
    LimitsInput,
    get_limits,
    overview,
    put_limits,
)
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.mcp.quotas import consume_quota, update_limits


def test_budget_validation():
    for total, tools in [
        (True, {}),
        (5, {"get_issue": True}),
        (5, {"shell": 1}),
        (5, {"get_issue": 0}),
    ]:
        with pytest.raises(ValidationError):
            LimitsInput(totalPerMinute=total, perTool=tools)


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_workspace_quota_is_atomic_and_management_is_restricted():
    async def run():
        engine = create_async_engine(
            _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
        )
        factory = async_sessionmaker(engine)
        user, member, seed = cuid(), cuid(), None
        try:
            async with factory() as db:
                now = utcnow()
                for identifier in [user, member]:
                    await db.execute(
                        text(
                            "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Quota fixture',:email,'ACTIVE',:now,:now)"
                        ),
                        {
                            "id": identifier,
                            "email": identifier + "@example.test",
                            "now": now,
                        },
                    )
                seed = await create_workspace_bootstrap(
                    db,
                    user_id=user,
                    organization_name="Quota",
                    workspace_name=cuid(),
                    now=now,
                )
                await db.execute(
                    text(
                        "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,'MEMBER','ACTIVE',:now,:now)"
                    ),
                    {
                        "id": cuid(),
                        "workspace": seed["workspace_id"],
                        "user": member,
                        "now": now,
                    },
                )
                await update_limits(db, seed["workspace_id"], 5, {"get_issue": 3})
                await db.commit()

            async def attempt():
                try:
                    await consume_quota(factory, seed["workspace_id"], "get_issue")
                    return True
                except ApiError as error:
                    assert error.status_code == 429
                    return False

            assert sum(await asyncio.gather(*(attempt() for _ in range(12)))) == 3
            async with factory() as db:
                data = await get_limits(
                    workspaceId=seed["workspace_id"], user={"id": user}, db=db
                )
                assert data["data"]["usage"] == 3
                assert data["data"]["perTool"] == {"get_issue": 3}
                assert "get_issue" in data["data"]["tools"]
                with pytest.raises(ApiError) as hidden:
                    await get_limits(
                        workspaceId=seed["workspace_id"], user={"id": member}, db=db
                    )
                assert hidden.value.status_code == 403
                with pytest.raises(ApiError) as error:
                    await put_limits(
                        LimitsInput(totalPerMinute=100),
                        workspaceId=seed["workspace_id"],
                        user={"id": member},
                        db=db,
                    )
                assert error.value.status_code == 403
        finally:
            async with factory() as db:
                if seed:
                    await db.execute(
                        text("DELETE FROM organizations WHERE id=:id"),
                        {"id": seed["organization_id"]},
                    )
                await db.execute(
                    text("DELETE FROM users WHERE id=ANY(CAST(:ids AS text[]))"),
                    {"ids": [user, member]},
                )
                await db.commit()
            await engine.dispose()

    asyncio.run(run())


def test_overview_sums_provider_calls_by_feature_and_lists_failures():
    async def run():
        engine = create_async_engine(
            _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
        )
        try:
            async with async_sessionmaker(engine)() as db:
                now = utcnow()
                user = cuid()
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Usage fixture',:email,'ACTIVE',:now,:now)"
                    ),
                    {"id": user, "email": user + "@example.test", "now": now},
                )
                workspace = (
                    await create_workspace_bootstrap(
                        db,
                        user_id=user,
                        organization_name="Usage",
                        workspace_name=cuid(),
                        now=now,
                    )
                )["workspace_id"]
                rows = [
                    ("agent.plan", "ok", 200, 100, 20, 0),
                    ("agent.plan", "truncated", 200, 300, 50, 0),
                    ("news.analysis", "error", 429, None, None, 0),
                    ("agent.report", "ok", 200, 999, 999, 8),
                ]
                for feature, outcome, status, tokens_in, tokens_out, days in rows:
                    await db.execute(
                        text(
                            """INSERT INTO ai_provider_calls(id,workspace_id,feature,provider,model,outcome,status_code,
                               input_tokens,output_tokens,attempts,duration_ms,created_at)
                               VALUES (:id,:w,:f,'OPENAI','m',:o,:s,:i,:t,1,100,:at)"""
                        ),
                        {
                            "id": cuid(), "w": workspace, "f": feature, "o": outcome, "s": status,
                            "i": tokens_in, "t": tokens_out, "at": now - timedelta(days=days),
                        },
                    )
                await db.commit()
                data = (await overview(workspaceId=workspace, user={"id": user}, db=db))["data"]
                assert [
                    (row["feature"], row["calls"], row["failed"], row["inputTokens"], row["outputTokens"])
                    for row in data["providerCalls"]
                ] == [("agent.plan", 2, 1, 400, 70), ("news.analysis", 1, 1, 0, 0)]
                assert {row["outcome"] for row in data["recentProviderErrors"]} == {"truncated", "error"}
        finally:
            await engine.dispose()

    asyncio.run(run())
