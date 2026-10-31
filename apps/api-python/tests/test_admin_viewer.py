import asyncio
import os
from dataclasses import replace
from types import SimpleNamespace

import httpx
import pytest
from argon2 import PasswordHasher
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import _utcnow
from app.core.config import Settings, _async_database_url
from app.core.identifiers import _cuid
from app.db.session import get_session
from app.domains.auth import create_workspace_bootstrap
from app.main import create_app
from app.modules.mcp.application import ToolApplication


@pytest.mark.skipif(not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured")
def test_admin_viewer_reads_admin_pages_and_cannot_write():
    asyncio.run(verify_admin_viewer())


async def verify_admin_viewer():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    settings = replace(
        Settings.from_environment(),
        auth_jwt_secret="viewer-test-secret-at-least-32-characters",
        auth_cookie_secure=False,
    )
    password = "Viewer-test-password-2026"
    owner, viewer = _cuid(), _cuid()
    try:
        async with factory() as db:
            now = _utcnow()
            for user_id in (owner, viewer):
                await db.execute(
                    text("INSERT INTO users(id,email,name,password_hash,status,created_at,updated_at) VALUES (:id,:email,'Viewer test',:hash,'ACTIVE',:now,:now)"),
                    {"id": user_id, "email": user_id + "@example.test", "hash": PasswordHasher().hash(password), "now": now},
                )
            seed = await create_workspace_bootstrap(db, user_id=owner, organization_name="Viewer", workspace_name=_cuid(), now=now)
            workspace, team = seed["workspace_id"], seed["team_id"]
            member = _cuid()
            await db.execute(
                text("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,'MEMBER','ACTIVE',:now,:now)"),
                {"id": member, "workspace": workspace, "user": viewer, "now": now},
            )
            await db.execute(text("INSERT INTO team_members(team_id,user_id) VALUES (:team,:user)"), {"team": team, "user": viewer})
            await db.commit()

        app = create_app(settings)

        async def session_dependency():
            async with factory() as db:
                yield db

        app.dependency_overrides[get_session] = session_dependency

        async def client_for(user_id):
            client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
            response = await client.post("/api/v1/auth/login", json={"email": user_id + "@example.test", "password": password})
            assert response.status_code == 200, response.text
            return client

        owner_client, viewer_client = await client_for(owner), await client_for(viewer)
        try:
            # The owner grants the read-only admin role. VI: Owner gán role quản trị chỉ đọc.
            granted = await owner_client.patch(f"/api/v1/workspaces/{workspace}/members/{member}", json={"role": "ADMIN_VIEWER"})
            assert granted.status_code == 200, granted.text

            # Admin-only reads work. VI: Đọc trang chỉ dành cho admin được phép.
            candidates = await viewer_client.get(f"/api/v1/workspaces/{workspace}/invitation-candidates")
            assert candidates.status_code == 200, candidates.text

            # Every write aimed at the workspace is refused, whatever the route.
            # VI: Mọi thao tác ghi nhắm vào workspace đều bị từ chối, bất kể route nào.
            writes = [
                viewer_client.patch(f"/api/v1/workspaces/{workspace}", json={"icon": "🚫"}),
                viewer_client.post("/api/v1/issues", json={"workspaceId": workspace, "teamId": team, "title": "Not allowed"}),
                viewer_client.post(f"/api/v1/labels?workspaceId={workspace}", json={"name": "nope", "color": "#000000"}),
                viewer_client.post("/api/v1/comments", json={"issueId": "unknown", "content": "no workspace given"}),
            ]
            for response in await asyncio.gather(*writes):
                assert response.status_code == 403, response.text
                assert "read-only" in response.json()["message"]

            # The caller's own account stays editable. VI: Tài khoản của chính người dùng vẫn sửa được.
            personal = await viewer_client.patch("/api/v1/users/me", json={"name": "Viewer renamed"})
            assert personal.status_code == 200, personal.text

            # The owner is not affected. VI: Owner không bị ảnh hưởng.
            assert (await owner_client.patch(f"/api/v1/workspaces/{workspace}", json={"icon": "✅"})).status_code == 200
        finally:
            await owner_client.aclose()
            await viewer_client.aclose()

        # MCP tool calls carry no cookie and are checked by role. VI: Lời gọi MCP không có cookie nên kiểm tra theo role.
        tools = ToolApplication(factory, settings)
        assert await tools.read_only(SimpleNamespace(workspace_id=workspace, user={"id": viewer})) is True
        assert await tools.read_only(SimpleNamespace(workspace_id=workspace, user={"id": owner})) is False
    finally:
        await engine.dispose()
