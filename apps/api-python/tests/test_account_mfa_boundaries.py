import asyncio
from dataclasses import replace
from datetime import timedelta, timezone
import json
import os
from types import SimpleNamespace

import httpx
import pytest
from argon2 import PasswordHasher
from cryptography.fernet import Fernet
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from starlette.requests import Request

from app.core.clock import _utcnow
from app.core.config import Settings, _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import _cuid, _hash_token
from app.db.session import get_session
from app.domains import auth
from app.main import create_app
from app.modules.identity.password_reset import issue_reset, consume_reset
from app.modules.identity.security.mfa import login
from app.modules.identity.security.mfa.crypto import (
    new_secret,
    encrypt_secret,
    recovery_hash,
    totp,
)
from app.services.microsoft_identity import MicrosoftProfile


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_mfa_attempt_expiry_version_totp_race_atomicity_password_reset_and_microsoft_callback(
    monkeypatch,
):
    asyncio.run(verify_boundaries(monkeypatch))


async def verify_boundaries(monkeypatch):
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    settings = replace(
        Settings.from_environment(),
        auth_jwt_secret="mfa-boundary-at-least-32-characters",
        auth_cookie_secure=False,
        auth_mfa_encryption_keys=Fernet.generate_key().decode(),
    )
    request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 4321)})
    identifier, secret, recovery = _cuid(), new_secret(), "abc123ff" * 4
    email = identifier + "@example.test"
    try:
        async with factory() as db:
            now = _utcnow()
            await db.execute(
                text(
                    "INSERT INTO users(id,email,name,password_hash,status,created_at,updated_at) VALUES (:id,:email,'MFA boundary',:hash,'ACTIVE',:now,:now)"
                ),
                {
                    "id": identifier,
                    "email": email,
                    "hash": PasswordHasher().hash("Initial password 2026"),
                    "now": now,
                },
            )
            await db.execute(
                text(
                    "INSERT INTO account_mfa(user_id,secret_cipher,enabled_at,recovery_hashes) VALUES (:user,:cipher,:now,CAST(:hashes AS jsonb))"
                ),
                {
                    "user": identifier,
                    "cipher": encrypt_secret(settings, identifier, secret),
                    "now": now - timedelta(minutes=1),
                    "hashes": json.dumps([recovery_hash(identifier, recovery)]),
                },
            )
            user = dict(
                (
                    await db.execute(
                        text("SELECT * FROM users WHERE id=:id"), {"id": identifier}
                    )
                )
                .mappings()
                .one()
            )
            raw = await login.begin_login(db, user, request, method="PASSWORD")
            await db.commit()

        async def attempt(raw, value, kind="RECOVERY"):
            async with factory() as db:
                try:
                    result = await login.finish_login(
                        db, raw, value, kind, request, settings
                    )
                    await db.commit()
                    return result
                except ApiError as error:
                    await db.rollback()
                    return error

        for _ in range(5):
            assert isinstance(await attempt(raw, "incorrect"), ApiError)
        assert isinstance(await attempt(raw, recovery), ApiError)
        async with factory() as db:
            assert (
                await db.execute(
                    text("SELECT attempts FROM mfa_challenges WHERE token_hash=:hash"),
                    {"hash": _hash_token(raw)},
                )
            ).scalar_one() == 5
            expired = await login.begin_login(db, user, request, method="PASSWORD")
            await db.execute(
                text(
                    "UPDATE mfa_challenges SET expires_at=:past WHERE token_hash=:hash"
                ),
                {
                    "past": _utcnow() - timedelta(seconds=1),
                    "hash": _hash_token(expired),
                },
            )
            stale = await login.begin_login(db, user, request, method="PASSWORD")
            reset = await issue_reset(db, email)
            await consume_reset(db, reset, "Reset password 2026")
            assert (
                await db.execute(
                    text("SELECT enabled_at FROM account_mfa WHERE user_id=:id"),
                    {"id": identifier},
                )
            ).scalar_one() is not None
            user = dict(
                (
                    await db.execute(
                        text("SELECT * FROM users WHERE id=:id"), {"id": identifier}
                    )
                )
                .mappings()
                .one()
            )
            assert user["auth_version"] == 1
        assert isinstance(await attempt(expired, recovery), ApiError)
        assert isinstance(await attempt(stale, recovery), ApiError)
        async with factory() as db:
            raws = [
                await login.begin_login(db, user, request, method="PASSWORD")
                for _ in range(2)
            ]
            await db.commit()
        counter = int(_utcnow().replace(tzinfo=timezone.utc).timestamp()) // 30
        results = await asyncio.gather(
            *(attempt(raw, totp(secret, counter), "AUTHENTICATOR") for raw in raws)
        )
        assert sum(not isinstance(result, ApiError) for result in results) == 1
        async with factory() as db:
            raw = await login.begin_login(db, user, request, method="PASSWORD")
            await db.commit()
        original = login.create_session

        async def fail_after_session(*args, **kwargs):
            await original(*args, **kwargs)
            raise RuntimeError("Synthetic transaction failure")

        monkeypatch.setattr(login, "create_session", fail_after_session)
        async with factory() as db:
            with pytest.raises(RuntimeError):
                await login.finish_login(
                    db, raw, recovery, "RECOVERY", request, settings
                )
            await db.rollback()
            assert (
                await db.execute(
                    text(
                        "SELECT consumed_at FROM mfa_challenges WHERE token_hash=:hash"
                    ),
                    {"hash": _hash_token(raw)},
                )
            ).scalar_one() is None
            assert (
                recovery_hash(identifier, recovery)
                in (
                    await db.execute(
                        text(
                            "SELECT recovery_hashes FROM account_mfa WHERE user_id=:id"
                        ),
                        {"id": identifier},
                    )
                ).scalar_one()
            )
        monkeypatch.setattr(login, "create_session", original)
        assert not isinstance(await attempt(raw, recovery), ApiError)
        # The provider boundary is mocked; the actual callback/database/session gate runs.
        profile = MicrosoftProfile(_cuid(), "tenant", email, "MFA Microsoft", None)

        async def complete(*args):
            return profile, "synthetic-graph-token"

        async def photo(*args):
            return None

        monkeypatch.setattr(
            auth,
            "_microsoft_client",
            lambda _: SimpleNamespace(complete_flow=complete, download_photo=photo),
        )
        app = create_app(settings)

        async def session_dependency():
            async with factory() as db:
                yield db

        app.dependency_overrides[get_session] = session_dependency
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            client.cookies.set(
                auth.MICROSOFT_FLOW_COOKIE,
                auth._microsoft_flow_token(
                    {}, next_path="/safe/path", timezone_name="UTC", settings=settings
                ),
            )
            result = await client.get("/api/v1/auth/microsoft/callback")
            assert result.status_code == 302 and result.headers["location"].endswith(
                "/auth/mfa"
            )
            assert (
                login.COOKIE in client.cookies
                and "flowie_access" not in client.cookies
                and "flowie_refresh" not in client.cookies
            )
    finally:
        async with factory() as db:
            await db.execute(text("DELETE FROM users WHERE id=:id"), {"id": identifier})
            await db.commit()
        await engine.dispose()
