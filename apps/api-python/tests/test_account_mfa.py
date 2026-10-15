import asyncio
import base64
from dataclasses import replace
from datetime import datetime, timedelta, timezone
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
from app.core.identifiers import _cuid
from app.db.session import get_session
from app.main import create_app
from app.modules.identity.security.sessions import (
    create_session,
    active_identity,
    decode_access,
    rotate_session,
)
from app.modules.identity.security.mfa import commands
from app.modules.identity.security.mfa.crypto import (
    totp,
    matching_counter,
    encrypt_secret,
    decrypt_secret,
    recovery_hash,
)
from app.modules.identity.security.mfa.login import begin_login, finish_login, COOKIE
from app.services.microsoft_identity import (
    authentication_instant,
    MicrosoftIdentityClient,
)


def test_rfc6238_sha1_vectors_window_replay_and_encryption_binding():
    secret = base64.b32encode(b"12345678901234567890").decode()
    for seconds, expected in [
        (59, "94287082"),
        (1111111109, "07081804"),
        (1111111111, "14050471"),
        (1234567890, "89005924"),
        (2000000000, "69279037"),
        (20000000000, "65353130"),
    ]:
        assert totp(secret, seconds // 30, 8) == expected
    now = datetime(2026, 10, 15, 12, 0, 15)
    counter = int(now.replace(tzinfo=timezone.utc).timestamp()) // 30
    assert matching_counter(secret, totp(secret, counter), now) == counter
    assert matching_counter(secret, totp(secret, counter), now, counter) is None
    assert matching_counter(secret, totp(secret, counter - 2), now) is None
    assert matching_counter(secret, "12345x", now) is None
    old, new = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    settings = SimpleNamespace(auth_mfa_encryption_keys=old)
    cipher = encrypt_secret(settings, "owner", secret)
    assert secret not in cipher
    assert (
        decrypt_secret(
            SimpleNamespace(auth_mfa_encryption_keys=new + "," + old), "owner", cipher
        )
        == secret
    )
    for keys, owner in [(new, "owner"), (old, "other"), ("", "owner")]:
        with pytest.raises(ApiError):
            decrypt_secret(
                SimpleNamespace(auth_mfa_encryption_keys=keys), owner, cipher
            )
    assert authentication_instant(None) is None
    assert authentication_instant(True) is None
    assert (
        authentication_instant(
            int(_utcnow().replace(tzinfo=timezone.utc).timestamp()) + 120
        )
        is None
    )


def test_microsoft_explicit_reauthentication_requests_auth_time_validation():
    captured = []
    client = MicrosoftIdentityClient(
        tenant_id="tenant",
        client_id="client",
        client_secret="secret",
        redirect_uri="https://example.test/callback",
    )
    client._application = lambda: SimpleNamespace(
        initiate_auth_code_flow=lambda **kwargs: captured.append(kwargs) or {}
    )
    asyncio.run(client.initiate_flow())
    asyncio.run(client.initiate_flow(reauthenticate=True))
    assert "max_age" not in captured[0]
    assert captured[1]["max_age"] == 0 and captured[1]["prompt"] == "login"


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_mfa_enrollment_login_gates_replay_recovery_key_loss_and_session_invalidation():
    asyncio.run(verify_mfa())


async def verify_mfa():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    settings = replace(
        Settings.from_environment(),
        auth_jwt_secret="mfa-test-secret-at-least-32-characters",
        auth_cookie_secure=False,
        auth_mfa_encryption_keys=Fernet.generate_key().decode(),
    )
    request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    identifier, sso_id, password = _cuid(), _cuid(), "Example-MFA-password-2026"
    email = identifier + "@example.test"
    try:
        async with factory() as db:
            now = _utcnow()
            for uid, encoded in [
                (identifier, PasswordHasher().hash(password)),
                (sso_id, None),
            ]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,email,name,password_hash,status,created_at,updated_at) VALUES (:id,:email,'MFA test',:encoded,'ACTIVE',:now,:now)"
                    ),
                    {
                        "id": uid,
                        "email": email if uid == identifier else uid + "@example.test",
                        "encoded": encoded,
                        "now": now,
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
            original, refresh = await create_session(db, user, request, settings)
            actor = await active_identity(db, decode_access(original, settings))
            await db.commit()
            with pytest.raises(ApiError):
                await commands.setup(db, actor, "wrong", request, settings)
            assert (
                await db.execute(
                    text(
                        "SELECT count(*) FROM account_security_events WHERE user_id=:id AND kind='MFA_FAILED'"
                    ),
                    {"id": identifier},
                )
            ).scalar_one() == 1
            setup = await commands.setup(db, actor, password, request, settings)
            assert (
                setup["qr"].startswith("data:image/svg+xml")
                and "otpauth" in setup["uri"]
            )
            counter = int(_utcnow().replace(tzinfo=timezone.utc).timestamp()) // 30
            proof = SimpleNamespace(
                password=password,
                code=totp(setup["secret"], counter),
                kind="AUTHENTICATOR",
            )
            codes, tokens = await commands.enable(db, actor, proof, request, settings)
            assert len(set(codes)) == 10
            assert await active_identity(db, decode_access(original, settings)) is None
            with pytest.raises(ApiError):
                await rotate_session(db, refresh, request, settings)
            await db.rollback()
            verified_actor = await active_identity(
                db, decode_access(tokens[0], settings)
            )
            assert verified_actor
            stored = dict(
                (
                    await db.execute(
                        text("SELECT * FROM account_mfa WHERE user_id=:id"),
                        {"id": identifier},
                    )
                )
                .mappings()
                .one()
            )
            assert stored["enabled_at"] and stored["last_counter"] == counter
            assert codes[0] not in str(stored) and setup["secret"] not in str(stored)
            with pytest.raises(ApiError):
                await create_session(db, user, request, settings)
            await db.rollback()

        app = create_app(settings)

        async def session_dependency():
            async with factory() as db:
                yield db

        app.dependency_overrides[get_session] = session_dependency
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            login = await client.post(
                "/api/v1/auth/login", json={"email": email, "password": password}
            )
            assert login.status_code == 200 and login.json() == {
                "data": {"mfaRequired": True}
            }
            assert (
                COOKIE in client.cookies
                and "flowie_access" not in client.cookies
                and "flowie_refresh" not in client.cookies
            )
            assert "no-store" in login.headers["cache-control"]
            assert (await client.get("/api/v1/users/me")).status_code == 401
            replay = await client.post(
                "/api/v1/auth/mfa/verify", json={"code": proof.code}
            )
            assert replay.status_code == 401
            raw = client.cookies.get(COOKIE)
            async with factory() as db:
                from app.core.identifiers import _hash_token

                assert (
                    await db.execute(
                        text(
                            "SELECT attempts FROM mfa_challenges WHERE token_hash=:hash"
                        ),
                        {"hash": _hash_token(raw)},
                    )
                ).scalar_one() == 1
            result = await client.post(
                "/api/v1/auth/mfa/verify", json={"code": codes[0], "kind": "RECOVERY"}
            )
            assert (
                result.status_code == 200
                and "flowie_access" in client.cookies
                and COOKIE not in client.cookies
            )
            assert (await client.get("/api/v1/users/me")).status_code == 200
            assert (await client.get("/api/v1/account-security/mfa")).json()["data"][
                "recoveryRemaining"
            ] == 9

        async def attempt(raw, value, *, runtime=settings):
            async with factory() as db:
                try:
                    result = await finish_login(
                        db, raw, value, "RECOVERY", request, runtime
                    )
                    await db.commit()
                    return result
                except ApiError as error:
                    await db.rollback()
                    return error

        async with factory() as db:
            challenges = [
                await begin_login(
                    db, user, request, method=method, authenticated_at=None
                )
                for method in ["PASSWORD", "MICROSOFT"]
            ]
            await db.commit()
        results = await asyncio.gather(*(attempt(raw, codes[1]) for raw in challenges))
        assert sum(not isinstance(value, ApiError) for value in results) == 1
        # A missing key never permits password-only sessions; recovery is independent.
        async with factory() as db:
            raw = await begin_login(db, user, request, method="MICROSOFT")
            await db.commit()
            with pytest.raises(ApiError) as unavailable:
                await finish_login(
                    db,
                    raw,
                    "000000",
                    "AUTHENTICATOR",
                    request,
                    replace(settings, auth_mfa_encryption_keys=""),
                )
            assert unavailable.value.status_code == 503
        accepted = await attempt(
            raw, codes[2], runtime=replace(settings, auth_mfa_encryption_keys="")
        )
        assert not isinstance(accepted, ApiError)
        async with factory() as db:
            replacement_actor = await active_identity(
                db, decode_access(accepted[1][0], settings)
            )
            # SSO authentication without auth_time cannot authorize factor management.
            sso = dict(
                (
                    await db.execute(
                        text("SELECT * FROM users WHERE id=:id"), {"id": sso_id}
                    )
                )
                .mappings()
                .one()
            )
            sso_token, _ = await create_session(
                db, sso, request, settings, method="MICROSOFT"
            )
            sso_actor = await active_identity(db, decode_access(sso_token, settings))
            await db.commit()
            with pytest.raises(ApiError) as fresh:
                await commands.setup(db, sso_actor, None, request, settings)
            assert fresh.value.status_code == 403
            await db.rollback()
            sso_token, _ = await create_session(
                db,
                sso,
                request,
                settings,
                method="MICROSOFT",
                authenticated_at=_utcnow(),
            )
            sso_actor = await active_identity(db, decode_access(sso_token, settings))
            assert (await commands.setup(db, sso_actor, None, request, settings))[
                "secret"
            ]
            # Replacing recovery material and disabling require both factors.
            proof.code, proof.kind = codes[3], "RECOVERY"
            newer = await commands.change(
                db, replacement_actor, proof, request, settings
            )
            assert len(newer) == 10
            proof.code = codes[4]
            with pytest.raises(ApiError):
                await commands.change(
                    db, replacement_actor, proof, request, settings, disable=True
                )
            proof.code = newer[0]
            await commands.change(
                db, replacement_actor, proof, request, settings, disable=True
            )
            assert (
                await db.execute(
                    text("SELECT 1 FROM account_mfa WHERE user_id=:id"),
                    {"id": identifier},
                )
            ).scalar_one_or_none() is None
    finally:
        async with factory() as db:
            await db.execute(
                text("DELETE FROM users WHERE id IN (:id,:sso)"),
                {"id": identifier, "sso": sso_id},
            )
            await db.commit()
        await engine.dispose()
