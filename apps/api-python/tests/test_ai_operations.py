import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.clock import _utcnow
from app.core.errors import ApiError
from app.core.identifiers import _cuid
from app.domains.auth import create_workspace_bootstrap
from app.modules.agent_runs.operations import LimitsInput, overview, put_limits
from app.modules.agent_runs.evidence import check_github_evidence, github_pull
from app.modules.agent_runs.evidence import verify_evidence
from app.modules.mcp.quotas import consume_quota, update_limits


def test_budget_validation_and_provider_url_boundary():
    for total, tools in [
        (True, {}),
        (5, {"get_issue": True}),
        (5, {"shell": 1}),
        (5, {"get_issue": 0}),
    ]:
        with pytest.raises(ValidationError):
            LimitsInput(totalPerMinute=total, perTool=tools)
    for url in [
        "https://evil.test/a/b/pull/1",
        "https://github.com@evil.test/a/b/pull/1",
        "https://github.com/a/b/pull/1?token=x",
    ]:
        with pytest.raises(ApiError):
            github_pull(url)


def test_ci_verification_requires_current_head_and_successful_checks():
    async def run():
        sha = "a" * 40
        pull = {"head": {"sha": sha}, "base": {"repo": {"full_name": "owner/repo"}}}
        responses = [
            pull,
            {
                "total_count": 1,
                "check_runs": [
                    {"name": "CI", "status": "completed", "conclusion": "success"}
                ],
            },
            {"statuses": []},
            {"workflow_runs": []},
            pull,
        ]
        provider = AsyncMock()
        provider._request.side_effect = [
            httpx.Response(200, json=value) for value in responses
        ]
        assert (await check_github_evidence(provider, "owner/repo", "1", sha))[
            "status"
        ] == "VERIFIED"
        responses[-1] = {"head": {"sha": "b" * 40}}
        provider._request.side_effect = [
            httpx.Response(200, json=value) for value in responses
        ]
        assert (await check_github_evidence(provider, "owner/repo", "1", sha))[
            "status"
        ] == "MISMATCH"
        responses[1]["check_runs"][0]["conclusion"] = "failure"
        responses[-1] = pull
        provider._request.side_effect = [
            httpx.Response(200, json=value) for value in responses
        ]
        assert (await check_github_evidence(provider, "owner/repo", "1", sha))[
            "status"
        ] == "FAILED"

    asyncio.run(run())


def test_verifier_rechecks_repository_team_before_provider_access():
    async def run():
        rows = [
            {
                "issue_id": "issue",
                "project_id": "project",
                "result": {
                    "pullRequestUrl": "https://github.com/owner/repo/pull/1",
                    "commit": "a" * 40,
                },
            },
            ("registered",),
            {"repository_team_id": "private-team"},
        ]
        results = []
        for row in rows:
            result = MagicMock()
            result.first.return_value = row
            result.mappings.return_value.first.return_value = row
            results.append(result)
        db = AsyncMock()
        db.execute.side_effect = results
        policy = AsyncMock()
        policy.team.side_effect = ApiError(404, "Outside team scope", "Not Found")
        with (
            patch("app.modules.agent_runs.evidence._manager", new=AsyncMock()),
            patch("app.modules.agent_runs.evidence.AccessPolicy", return_value=policy),
            patch("app.modules.agent_runs.evidence.provider_for") as provider,
        ):
            with pytest.raises(ApiError) as error:
                await verify_evidence(
                    "run",
                    SimpleNamespace(
                        app=SimpleNamespace(state=SimpleNamespace(settings=None))
                    ),
                    workspaceId="workspace",
                    user={"id": "manager"},
                    db=db,
                )
            assert error.value.status_code == 404
            policy.team.assert_awaited_once_with("private-team")
            provider.assert_not_called()

    asyncio.run(run())


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_workspace_quota_is_atomic_and_management_is_restricted():
    async def run():
        engine = create_async_engine(
            _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
        )
        factory = async_sessionmaker(engine)
        user, member, seed = _cuid(), _cuid(), None
        try:
            async with factory() as db:
                now = _utcnow()
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
                    workspace_name=_cuid(),
                    now=now,
                )
                await db.execute(
                    text(
                        "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,'MEMBER','ACTIVE',:now,:now)"
                    ),
                    {
                        "id": _cuid(),
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
                data = await overview(
                    workspaceId=seed["workspace_id"], user={"id": user}, db=db
                )
                assert data["data"]["usage"] == 3
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
