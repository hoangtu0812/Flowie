import asyncio
import os
from contextlib import asynccontextmanager
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from fastapi import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import Settings, _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import _cuid
from app.db.session import get_session
from app.domains.auth import _upsert_microsoft_user
from app.domains.workspaces import InviteMemberInput, invitation_candidates, invite
from app.main import create_app
from app.services.microsoft_identity import MicrosoftProfile
from app.modules.identity.security.mfa import login as mfa_login
from app.modules.identity.security.mfa.proofs import first_factor
from app.modules.identity import password_reset


def test_azure_configuration_blocks_every_password_entry_point():
    async def run():
        settings = replace(
            Settings.from_environment(),
            azure_ad_tenant_id="tenant",
            azure_ad_client_id="client",
            azure_ad_client_secret="secret",
            azure_ad_redirect_uri="http://localhost/callback",
        )
        app = create_app(settings)

        async def unused_database():
            yield None

        app.dependency_overrides[get_session] = unused_database
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (await client.get("/api/v1/auth/providers")).json()["data"] == {
                "microsoft": {"enabled": True},
                "password": {"enabled": False},
            }
            for path, payload in [
                (
                    "login",
                    {"email": "local@example.test", "password": "Local password 2026"},
                ),
                (
                    "register",
                    {
                        "name": "Local user",
                        "email": "local@example.test",
                        "password": "Local password 2026",
                    },
                ),
                ("register/verify", {"email": "local@example.test", "code": "123456"}),
                ("password-reset/request", {"email": "local@example.test"}),
                (
                    "password-reset/confirm",
                    {"token": "x" * 32, "password": "Local password 2026"},
                ),
            ]:
                response = await client.post("/api/v1/auth/" + path, json=payload)
                assert response.status_code == 403, (path, response.text)
                assert "Microsoft" in response.json()["message"]
                assert "flowie_access" not in response.cookies
            assert not (
                await client.get("/api/v1/auth/password-reset/configuration")
            ).json()["data"]["enabled"]
            app.state.settings = replace(settings, azure_ad_client_secret="")
            assert (await client.get("/api/v1/auth/providers")).json()["data"] == {
                "microsoft": {"enabled": False},
                "password": {"enabled": True},
            }

    asyncio.run(run())


def test_azure_rejects_pending_password_mfa_and_password_security_proof(monkeypatch):
    async def run():
        settings = SimpleNamespace(
            azure_ad_tenant_id="tenant",
            azure_ad_client_id="client",
            azure_ad_client_secret="secret",
            azure_ad_redirect_uri="callback",
            auth_jwt_secret="test-secret",
        )
        owner, challenge = Mock(), Mock()
        owner.scalar_one_or_none.return_value = "user"
        challenge.mappings.return_value.first.return_value = {"auth_method": "PASSWORD"}
        db = SimpleNamespace(execute=AsyncMock(side_effect=[owner, challenge]))
        monkeypatch.setattr(
            mfa_login, "lock_account", AsyncMock(return_value={"id": "user"})
        )
        monkeypatch.setattr(mfa_login, "factor", AsyncMock(return_value=None))
        monkeypatch.setattr(password_reset, "limit_request", AsyncMock())
        with pytest.raises(ApiError) as error:
            await mfa_login.finish_login(
                db, "pending-token", "123456", "AUTHENTICATOR", None, settings
            )
        assert error.value.status_code == 403
        with pytest.raises(ApiError) as error:
            await first_factor(
                db,
                {"id": "user", "password_hash": "old-password"},
                {},
                "password",
                None,
                settings,
            )
        assert error.value.status_code == 403

    asyncio.run(run())


@asynccontextmanager
async def database():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            async with AsyncSession(
                bind=connection,
                expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            ) as db:
                try:
                    yield db
                finally:
                    await db.rollback()
                    await transaction.rollback()
    finally:
        await engine.dispose()


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_local_account_conversion_preserves_ownership_and_rejects_identity_collisions():
    async def run():
        async with database() as db:
            key = _cuid()
            profile = MicrosoftProfile(
                key, "tenant", key + "@example.test", "Azure user"
            )
            settings = SimpleNamespace(admin_email=profile.email)
            user_id = await _upsert_microsoft_user(
                db, profile, timezone_name="UTC", settings=settings
            )
            membership = (
                (
                    await db.execute(
                        text(
                            "SELECT id, workspace_id, role FROM workspace_members WHERE user_id=:id"
                        ),
                        {"id": user_id},
                    )
                )
                .mappings()
                .one()
            )
            await db.execute(
                text("DELETE FROM user_identities WHERE user_id=:id"), {"id": user_id}
            )
            await db.execute(
                text(
                    "UPDATE users SET password_hash='old-hash', name='Local user', email=upper(email) WHERE id=:id"
                ),
                {"id": user_id},
            )
            await db.execute(
                text(
                    "INSERT INTO user_identities(id,user_id,provider,provider_account_id,email,created_at,updated_at) VALUES (:identity,:id,'LOCAL',:email,:email,now(),now())"
                ),
                {"identity": _cuid(), "id": user_id, "email": profile.email},
            )
            await db.execute(
                text(
                    "INSERT INTO user_ui_preferences(user_id,preferences,version,updated_at) VALUES (:id,CAST(:preferences AS jsonb),1,now())"
                ),
                {
                    "id": user_id,
                    "preferences": '{"timezone":"Asia/Saigon","defaultWorkspaceId":"'
                    + membership["workspace_id"]
                    + '"}',
                },
            )
            session_id = _cuid()
            await db.execute(
                text(
                    "INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at,created_at) VALUES (:session,:id,:hash,now()+interval '1 day',now())"
                ),
                {"session": session_id, "id": user_id, "hash": _cuid()},
            )
            await db.commit()
            assert (
                await _upsert_microsoft_user(
                    db, profile, timezone_name="UTC", settings=settings
                )
                == user_id
            )
            user = (
                (
                    await db.execute(
                        text("SELECT * FROM users WHERE id=:id"), {"id": user_id}
                    )
                )
                .mappings()
                .one()
            )
            assert user["email"] == profile.email and user["name"] == profile.name
            assert user["password_hash"] is None and user["auth_version"] == 1
            assert user["timezone"] == "Asia/Saigon"
            assert user["is_platform_admin"]
            assert (
                await db.execute(
                    text("SELECT revoked_at FROM sessions WHERE id=:id"),
                    {"id": session_id},
                )
            ).scalar_one() is not None
            assert (
                await db.execute(
                    text(
                        "SELECT id, workspace_id, role FROM workspace_members WHERE user_id=:id"
                    ),
                    {"id": user_id},
                )
            ).mappings().one() == membership
            assert (
                await db.execute(
                    text("SELECT provider FROM user_identities WHERE user_id=:id"),
                    {"id": user_id},
                )
            ).scalars().all() == ["MICROSOFT"]
            await db.commit()
            with pytest.raises(ApiError) as conflict:
                await _upsert_microsoft_user(
                    db,
                    replace(profile, object_id="different-object"),
                    timezone_name=None,
                    settings=settings,
                )
            assert conflict.value.status_code == 409
            renamed = replace(
                profile, email="renamed-" + profile.email, name="Renamed Azure user"
            )
            assert (
                await _upsert_microsoft_user(
                    db, renamed, timezone_name=None, settings=settings
                )
                == user_id
            )
            user = (
                (
                    await db.execute(
                        text(
                            "SELECT email, auth_version, is_platform_admin FROM users WHERE id=:id"
                        ),
                        {"id": user_id},
                    )
                )
                .mappings()
                .one()
            )
            assert user["email"] == renamed.email and user["auth_version"] == 1
            assert not user["is_platform_admin"]
            await db.commit()
            other = replace(profile, object_id=_cuid(), email="other-" + profile.email)
            await _upsert_microsoft_user(
                db, other, timezone_name=None, settings=settings
            )
            with pytest.raises(ApiError) as conflict:
                await _upsert_microsoft_user(
                    db,
                    replace(renamed, email=other.email),
                    timezone_name=None,
                    settings=settings,
                )
            assert conflict.value.status_code == 409
            await db.execute(
                text("UPDATE users SET status='SUSPENDED' WHERE id=:id"),
                {"id": user_id},
            )
            await db.commit()
            with pytest.raises(ApiError) as inactive:
                await _upsert_microsoft_user(
                    db, renamed, timezone_name=None, settings=settings
                )
            assert inactive.value.status_code == 403

    asyncio.run(run())


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_invitation_candidates_require_management_and_filter_existing_members():
    async def run():
        async with database() as db:
            key = _cuid()
            profile = MicrosoftProfile(
                key, "tenant", key + "@example.test", "Directory owner"
            )
            owner = await _upsert_microsoft_user(
                db,
                profile,
                timezone_name=None,
                settings=SimpleNamespace(admin_email=""),
            )
            workspace = (
                await db.execute(
                    text(
                        "SELECT workspace_id FROM workspace_members WHERE user_id=:id"
                    ),
                    {"id": owner},
                )
            ).scalar_one()
            ids = [_cuid() for _ in range(29)]
            for index, identifier in enumerate(ids):
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',now(),now())"
                    ),
                    {
                        "id": identifier,
                        "name": f"{key} Person {index:02}",
                        "email": identifier + "@example.test",
                    },
                )
            await db.execute(
                text("UPDATE users SET status='SUSPENDED' WHERE id=:id"),
                {"id": ids[-1]},
            )
            for identifier, status in [(ids[0], "ACTIVE"), (ids[1], "INVITED")]:
                await db.execute(
                    text(
                        "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,'MEMBER',:status,now(),now())"
                    ),
                    {
                        "id": _cuid(),
                        "workspace": workspace,
                        "user": identifier,
                        "status": status,
                    },
                )
            response = Response()
            result = await invitation_candidates(
                workspace, response, key.upper(), {"id": owner}, db
            )
            assert response.headers["Cache-Control"] == "no-store"
            assert len(result["data"]) == 25 and result["meta"]["hasMore"]
            assert not (
                {ids[0], ids[1], ids[-1]} & {item["id"] for item in result["data"]}
            )
            assert set(result["data"][0]) == {"id", "name", "email"}
            result = await invitation_candidates(
                workspace, Response(), ids[4].upper(), {"id": owner}, db
            )
            assert [item["id"] for item in result["data"]] == [ids[4]]
            assert not result["meta"]["hasMore"]
            invitation = await invite(
                workspace,
                InviteMemberInput(email=(ids[4] + "@example.test").upper()),
                {"id": owner},
                db,
            )
            assert invitation["data"]["userId"] == ids[4]
            assert invitation["data"]["status"] == "INVITED"
            result = await invitation_candidates(
                workspace, Response(), ids[4], {"id": owner}, db
            )
            assert result["data"] == []
            with pytest.raises(ApiError) as inactive:
                await invite(
                    workspace,
                    InviteMemberInput(email=ids[-1] + "@example.test"),
                    {"id": owner},
                    db,
                )
            assert inactive.value.status_code == 404
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Duplicate email',:email,'ACTIVE',now(),now())"
                ),
                {"id": _cuid(), "email": (ids[3] + "@example.test").upper()},
            )
            with pytest.raises(ApiError) as ambiguous:
                await invite(
                    workspace,
                    InviteMemberInput(email=ids[3] + "@example.test"),
                    {"id": owner},
                    db,
                )
            assert ambiguous.value.status_code == 409
            for unauthorized in [ids[0], ids[1], ids[2]]:
                with pytest.raises(ApiError) as error:
                    await invitation_candidates(
                        workspace, Response(), "", {"id": unauthorized}, db
                    )
                assert error.value.status_code in (403, 404)

    asyncio.run(run())
