import asyncio
from dataclasses import replace
from datetime import timedelta
import os

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.requests import Request

from app.core.config import Settings, _async_database_url
from app.core.clock import _utcnow
from app.core.errors import ApiError
from app.core.identifiers import _cuid, _hash_token
from app.db.session import get_session
from app.domains.auth import create_workspace_bootstrap
from app.main import create_app
from app.modules.identity.security.sessions import (
    create_session,
    decode_access,
    active_identity,
    logout_session,
)
from app.modules.identity.security.queries import (
    session_page,
    event_page,
    credential_page,
)
from app.modules.identity.security.credentials import revoke_credential


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_account_inventory_history_paging_ownership_lost_membership_and_retired_key_issuance():
    asyncio.run(verify_inventory())


async def verify_inventory():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            settings = replace(
                Settings.from_environment(),
                auth_jwt_secret="account-inventory-test-secret-at-least-32-characters",
            )
            request = Request(
                {"type": "http", "headers": [], "client": ("127.0.0.1", 1234)}
            )
            owner, other = (
                {"id": _cuid(), "name": "Inventory owner"},
                {"id": _cuid(), "name": "Private account"},
            )
            now = _utcnow()
            for user in [owner, other]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                    ),
                    {**user, "email": _cuid() + "@example.test", "now": now},
                )
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name="Inventory",
                workspace_name=_cuid(),
                now=now,
            )
            workspace = seed["workspace_id"]
            token, _ = await create_session(db, owner, request, settings)
            actor = await active_identity(db, decode_access(token, settings))
            for user in [owner, other]:
                await db.execute(
                    text("""INSERT INTO account_security_events(id,user_id,kind,method,ip_address,user_agent,created_at)
                    SELECT :prefix||n::text,:user,'LOGIN_FAILED','PASSWORD','127.0.0.1',:agent,:now FROM generate_series(1,107) n"""),
                    {
                        "prefix": _cuid(),
                        "user": user["id"],
                        "now": now,
                        "agent": user["name"],
                    },
                )
                await db.execute(
                    text("""INSERT INTO mcp_connections(id,workspace_id,user_id,name,prefix,token_hash,scopes,expires_at,created_at)
                    SELECT :prefix||n::text,:workspace,:user,:label||' connection '||n::text,'flowie_mcp_fixture',:hash||n::text,ARRAY['issues:read']::text[],:expires,:now FROM generate_series(1,107) n"""),
                    {
                        "prefix": _cuid(),
                        "workspace": workspace,
                        "user": user["id"],
                        "label": user["name"],
                        "hash": _hash_token(_cuid()),
                        "expires": now + timedelta(days=1),
                        "now": now,
                    },
                )
                await db.execute(
                    text(
                        "INSERT INTO personal_api_keys(id,user_id,name,prefix,token_hash,created_at) VALUES (:id,:user,'Legacy fixture key','flowie_pat_fixture',:hash,:now)"
                    ),
                    {
                        "id": _cuid(),
                        "user": user["id"],
                        "hash": _hash_token(_cuid()),
                        "now": now,
                    },
                )
            history = await event_page(
                db, actor, "inventory-secret", kind="LOGIN_FAILED"
            )
            assert history["meta"]["total"] == 107 and len(history["data"]) == 50
            history2 = await event_page(
                db,
                actor,
                "inventory-secret",
                kind="LOGIN_FAILED",
                cursor=history["meta"]["nextCursor"],
                limit=100,
            )
            assert len(history2["data"]) == 57
            assert all(
                row["userAgent"] == owner["name"]
                for row in history["data"] + history2["data"]
            )
            with pytest.raises(ApiError):
                await event_page(
                    db,
                    actor,
                    "inventory-secret",
                    kind="LOGIN_SUCCEEDED",
                    cursor=history["meta"]["nextCursor"],
                )
            credentials = await credential_page(db, actor, "inventory-secret")
            assert (
                credentials["meta"]["total"] == 108 and len(credentials["data"]) == 50
            )
            rest = await credential_page(
                db,
                actor,
                "inventory-secret",
                cursor=credentials["meta"]["nextCursor"],
                limit=100,
            )
            all_rows = credentials["data"] + rest["data"]
            assert all(
                row["name"].startswith(owner["name"])
                for row in all_rows
                if row["kind"] == "MCP"
            )
            assert len(all_rows) == 108 and len({row["id"] for row in all_rows}) == 108
            assert not any(
                "hash" in key.lower() or key.lower() == "token"
                for row in all_rows
                for key in row
            )
            foreign = (
                await db.execute(
                    text("SELECT id FROM mcp_connections WHERE user_id=:user LIMIT 1"),
                    {"user": other["id"]},
                )
            ).scalar_one()
            with pytest.raises(ApiError) as missing:
                await revoke_credential(db, actor, request, "MCP", foreign)
            assert missing.value.status_code == 404
            await db.execute(
                text(
                    "DELETE FROM workspace_members WHERE workspace_id=:workspace AND user_id=:user"
                ),
                {"workspace": workspace, "user": owner["id"]},
            )
            own_mcp = next(row for row in all_rows if row["kind"] == "MCP")
            hidden = await credential_page(db, actor, "inventory-secret", limit=100)
            assert all(
                row["workspaceName"] is None and row["workspaceId"] is None
                for row in hidden["data"]
            )
            await revoke_credential(db, actor, request, "MCP", own_mcp["credentialId"])
            assert (await credential_page(db, actor, "inventory-secret"))["meta"][
                "total"
            ] == 107
            assert (
                await credential_page(
                    db, actor, "inventory-secret", include_revoked=True
                )
            )["meta"]["total"] == 108
            device = await session_page(db, actor, "inventory-secret")
            assert device["meta"]["total"] == 1 and device["data"][0]["current"] is True
            app = create_app(settings)

            async def session():
                yield db

            app.dependency_overrides[get_session] = session
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app), base_url="http://test"
            ) as client:
                client.cookies.set("flowie_access", token)
                response = await client.get("/api/v1/account-security/credentials")
                assert (
                    response.status_code == 200
                    and response.headers["cache-control"] == "private, no-store"
                )
                assert (
                    await client.post(
                        "/api/v1/auth/api-keys", json={"name": "No broad token"}
                    )
                ).status_code == 410
            logout = Request(
                {
                    "type": "http",
                    "headers": [(b"cookie", f"flowie_access={token}".encode())],
                    "client": ("127.0.0.1", 1234),
                }
            )
            assert await logout_session(db, logout, settings) == owner["id"]
            assert await active_identity(db, decode_access(token, settings)) is None
            await db.rollback()
    finally:
        await engine.dispose()
