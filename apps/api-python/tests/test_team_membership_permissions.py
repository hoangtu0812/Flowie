import asyncio
import os

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError, api_error_handler
from app.db.session import get_session
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap, current_user
from app.domains.teams import router


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_only_active_workspace_owner_can_grant_team_membership():
    asyncio.run(verify_membership_permissions())


async def verify_membership_permissions():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            owner, admin, member, lead, outsider, target = [
                {"id": _cuid(), "name": role}
                for role in [
                    "Owner",
                    "Admin",
                    "Member",
                    "Lead",
                    "Other owner",
                    "Target",
                ]
            ]
            for user in [owner, admin, member, lead, outsider, target]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                    ),
                    {**user, "email": _cuid() + "@example.test", "now": now},
                )
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name="Team access",
                workspace_name=_cuid(),
                now=now,
            )
            other = await create_workspace_bootstrap(
                db,
                user_id=outsider["id"],
                organization_name="Other workspace",
                workspace_name=_cuid(),
                now=now,
            )
            workspace = seed["workspace_id"]
            for user, role in [
                (admin, "ADMIN"),
                (member, "MEMBER"),
                (lead, "MEMBER"),
                (target, "MEMBER"),
            ]:
                await db.execute(
                    text(
                        "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,:role,'ACTIVE',:now,:now)"
                    ),
                    {
                        "id": _cuid(),
                        "workspace": workspace,
                        "user": user["id"],
                        "role": role,
                        "now": now,
                    },
                )
            await db.commit()
            app = FastAPI()
            app.include_router(router)
            app.add_exception_handler(ApiError, api_error_handler)

            async def session():
                yield db

            app.dependency_overrides[get_session] = session
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                for policy in ["OPEN", "INVITE_ONLY"]:
                    # Creating a team as an admin must not silently grant membership.
                    app.dependency_overrides[current_user] = lambda: admin
                    response = await client.post(
                        "/api/v1/teams",
                        json={
                            "workspaceId": workspace,
                            "name": policy,
                            "identifier": policy.replace("_", ""),
                        },
                    )
                    assert response.status_code == 200, response.text
                    team = response.json()["data"]["id"]
                    assert response.json()["data"]["members"] == []
                    await db.execute(
                        text("UPDATE teams SET join_policy=:policy WHERE id=:team"),
                        {"team": team, "policy": policy},
                    )
                    await db.execute(
                        text(
                            "INSERT INTO team_members(team_id,user_id,role) VALUES (:team,:user,'LEAD')"
                        ),
                        {"team": team, "user": lead["id"]},
                    )
                    await db.commit()
                    endpoint = f"/api/v1/teams/{team}"
                    for user in [admin, member, lead, outsider]:
                        app.dependency_overrides[current_user] = lambda: user
                        response = await client.post(
                            endpoint + "/join", params={"workspaceId": workspace}
                        )
                        assert response.status_code == 403, response.text
                        await db.rollback()
                        for recipient in [user, target]:
                            response = await client.post(
                                endpoint + "/members",
                                json={
                                    "workspaceId": workspace,
                                    "userId": recipient["id"],
                                    "role": "LEAD",
                                },
                            )
                            assert response.status_code == 403, response.text
                            await db.rollback()
                    assert (
                        await db.execute(
                            text(
                                "SELECT count(*) FROM team_members WHERE team_id=:team"
                            ),
                            {"team": team},
                        )
                    ).scalar_one() == 1
                    app.dependency_overrides[current_user] = lambda: owner
                    response = await client.post(
                        endpoint + "/members",
                        json={
                            "workspaceId": other["workspace_id"],
                            "userId": target["id"],
                            "role": "MEMBER",
                        },
                    )
                    assert response.status_code == 403
                    await db.rollback()
                    response = await client.post(
                        endpoint + "/members",
                        json={
                            "workspaceId": workspace,
                            "userId": outsider["id"],
                            "role": "MEMBER",
                        },
                    )
                    assert response.status_code == 404
                    await db.rollback()
                    await db.execute(
                        text(
                            "UPDATE workspace_members SET status='INVITED' WHERE workspace_id=:workspace AND user_id=:user"
                        ),
                        {"workspace": workspace, "user": owner["id"]},
                    )
                    response = await client.post(
                        endpoint + "/join", params={"workspaceId": workspace}
                    )
                    assert response.status_code == 403
                    await db.rollback()
                    await db.execute(
                        text(
                            "UPDATE workspace_members SET status='INVITED' WHERE workspace_id=:workspace AND user_id=:user"
                        ),
                        {"workspace": workspace, "user": target["id"]},
                    )
                    response = await client.post(
                        endpoint + "/members",
                        json={
                            "workspaceId": workspace,
                            "userId": target["id"],
                            "role": "MEMBER",
                        },
                    )
                    assert response.status_code == 404
                    await db.rollback()
                    response = await client.post(
                        endpoint + "/members",
                        json={
                            "workspaceId": workspace,
                            "userId": target["id"],
                            "role": "MEMBER",
                        },
                    )
                    assert response.status_code == 200, response.text
                    for _ in range(2):
                        response = await client.post(
                            endpoint + "/join", params={"workspaceId": workspace}
                        )
                        assert response.status_code == 200, response.text
                    assert (
                        await db.execute(
                            text(
                                "SELECT count(*) FROM team_members WHERE team_id=:team"
                            ),
                            {"team": team},
                        )
                    ).scalar_one() == 3
                    assert (
                        await db.execute(
                            text(
                                "SELECT role FROM team_members WHERE team_id=:team AND user_id=:user"
                            ),
                            {"team": team, "user": lead["id"]},
                        )
                    ).scalar_one() == "LEAD"
                    response = await client.patch(
                        endpoint,
                        params={"workspaceId": workspace},
                        json={"joinPolicy": "OPEN"},
                    )
                    assert response.status_code == 422
                    response = await client.get(
                        "/api/v1/teams", params={"workspaceId": workspace}
                    )
                    assert all(
                        row["joinPolicy"] == "INVITE_ONLY"
                        for row in response.json()["data"]
                    )
                response = await client.post(
                    f"/api/v1/teams/{other['team_id']}/members",
                    json={
                        "workspaceId": workspace,
                        "userId": target["id"],
                        "role": "MEMBER",
                    },
                )
                assert response.status_code == 404
    finally:
        await engine.dispose()
