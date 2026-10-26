import asyncio
import json
import os
import unicodedata

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError, api_error_handler
from app.db.session import get_session
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap, current_user
from app.domains.workspaces import router
from app.modules.work_items.contracts import CreateIssueInput
from app.modules.work_items.issues import create_issue


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_workspace_deletion_requires_active_owner_and_exact_name_and_is_scoped():
    asyncio.run(verify_deletion())


async def verify_deletion():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            owner, admin, member, outsider = [
                {"id": _cuid(), "name": role}
                for role in ["Owner", "Admin", "Member", "Outsider"]
            ]
            for user in [owner, admin, member, outsider]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                    ),
                    {**user, "email": _cuid() + "@example.test", "now": now},
                )
            name = "Phòng Chuyển đổi số " + _cuid()
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name=name,
                workspace_name=name,
                now=now,
            )
            other = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name="Other",
                workspace_name=_cuid(),
                now=now,
            )
            workspace = seed["workspace_id"]
            for user, role in [(admin, "ADMIN"), (member, "MEMBER")]:
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
            # A platform administrator without ownership must not bypass the owner gate.
            await db.execute(
                text("UPDATE users SET is_platform_admin=true WHERE id=:id"),
                {"id": outsider["id"]},
            )
            for team in [None, seed["team_id"]]:
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=team, title="Deleted issue"
                    ),
                    owner,
                    db,
                )
            preserved = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=other["workspace_id"], title="Preserved issue"
                    ),
                    owner,
                    db,
                )
            )["data"]
            project = _cuid()
            await db.execute(
                text(
                    "INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,'Deleted project','DEL',:now,:now)"
                ),
                {
                    "id": project,
                    "workspace": workspace,
                    "team": seed["team_id"],
                    "now": now,
                },
            )
            await db.execute(
                text(
                    "INSERT INTO documents(id,workspace_id,team_id,title,content,created_by,updated_by,created_at,updated_at) VALUES (:id,:workspace,:team,'Deleted document','content',:user,:user,:now,:now)"
                ),
                {
                    "id": _cuid(),
                    "workspace": workspace,
                    "team": seed["team_id"],
                    "user": owner["id"],
                    "now": now,
                },
            )
            for user, target in [(owner, workspace), (admin, other["workspace_id"])]:
                await db.execute(
                    text(
                        "INSERT INTO user_ui_preferences(user_id,preferences,updated_at) VALUES (:user,CAST(:preferences AS jsonb),:now)"
                    ),
                    {
                        "user": user["id"],
                        "preferences": json.dumps(
                            {"defaultWorkspaceId": target, "language": "vi"}
                        ),
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
                endpoint = f"/api/v1/workspaces/{workspace}"
                for user, status in [(outsider, 404), (admin, 403), (member, 403)]:
                    app.dependency_overrides[current_user] = lambda: user
                    response = await client.request(
                        "DELETE", endpoint, json={"confirmationName": name}
                    )
                    assert response.status_code == status, response.text
                    await db.rollback()
                app.dependency_overrides[current_user] = lambda: owner
                for invalid in [name.lower(), name + " ", seed["slug"], workspace, ""]:
                    response = await client.request(
                        "DELETE", endpoint, json={"confirmationName": invalid}
                    )
                    assert response.status_code in {400, 422}, response.text
                    await db.rollback()
                response = await client.delete(endpoint)
                assert response.status_code == 422
                assert (
                    await db.execute(
                        text("SELECT count(*) FROM issues WHERE workspace_id=:id"),
                        {"id": workspace},
                    )
                ).scalar_one() == 2
                await db.execute(
                    text(
                        "UPDATE workspace_members SET status='INVITED' WHERE workspace_id=:workspace AND user_id=:user"
                    ),
                    {"workspace": workspace, "user": owner["id"]},
                )
                response = await client.request(
                    "DELETE", endpoint, json={"confirmationName": name}
                )
                assert response.status_code == 404
                await db.rollback()
                response = await client.request(
                    "DELETE",
                    endpoint,
                    json={"confirmationName": unicodedata.normalize("NFD", name)},
                )
                assert response.status_code == 200, response.text
                assert response.json() == {"data": {"deleted": True}}
                for table in [
                    "workspace_members",
                    "teams",
                    "issue_statuses",
                    "issues",
                    "projects",
                    "documents",
                    "issue_lifecycle_events",
                ]:
                    assert (
                        await db.execute(
                            text(
                                f"SELECT count(*) FROM {table} WHERE workspace_id=:id"
                            ),
                            {"id": workspace},
                        )
                    ).scalar_one() == 0
                assert (
                    await db.execute(
                        text("SELECT count(*) FROM issues WHERE id=:id"),
                        {"id": preserved["id"]},
                    )
                ).scalar_one() == 1
                assert (
                    await db.execute(
                        text("SELECT count(*) FROM users WHERE id=:id"),
                        {"id": owner["id"]},
                    )
                ).scalar_one() == 1
                preferences = (
                    await db.execute(
                        text(
                            "SELECT preferences FROM user_ui_preferences WHERE user_id=:id"
                        ),
                        {"id": owner["id"]},
                    )
                ).scalar_one()
                assert preferences == {"language": "vi"}
                assert (
                    await db.execute(
                        text(
                            "SELECT preferences->>'defaultWorkspaceId' FROM user_ui_preferences WHERE user_id=:id"
                        ),
                        {"id": admin["id"]},
                    )
                ).scalar_one() == other["workspace_id"]
                response = await client.request(
                    "DELETE", endpoint, json={"confirmationName": name}
                )
                assert response.status_code == 404
    finally:
        await engine.dispose()
