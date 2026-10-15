import asyncio
from dataclasses import replace
from datetime import timedelta
import os
from types import SimpleNamespace

import jwt
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.requests import Request

from app.core.config import Settings, _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import _cuid, _hash_token
from app.core.clock import _utcnow
from app.domains.auth import create_workspace_bootstrap
from app.modules.identity.security.sessions import (
    create_session,
    rotate_session,
    decode_access,
    active_identity,
    revoke_sessions,
    access_token,
)
from app.modules.identity.security.realtime import serve_notifications


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_bound_sessions_revoke_before_jwt_expiry_atomic_refresh_legacy_upgrade_and_idle_socket():
    asyncio.run(verify_sessions())


async def verify_sessions():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine)
    settings = replace(
        Settings.from_environment(),
        auth_jwt_secret="session-binding-test-secret-at-least-32-characters",
    )
    request = Request(
        {
            "type": "http",
            "headers": [(b"user-agent", b"Synthetic session browser")],
            "client": ("127.0.0.1", 50000),
        }
    )
    user = {"id": _cuid(), "auth_version": 0, "name": "Session owner"}
    other = {"id": _cuid(), "auth_version": 0, "name": "Another owner"}
    workspace = None
    try:
        async with factory() as db:
            now = _utcnow()
            for actor in [user, other]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                    ),
                    {**actor, "email": _cuid() + "@example.test", "now": now},
                )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user["id"],
                organization_name="Session security",
                workspace_name=_cuid(),
                now=now,
            )
            workspace = seed["workspace_id"]
            token, refresh = await create_session(db, user, request, settings)
            second, second_refresh = await create_session(db, user, request, settings)
            foreign, _ = await create_session(db, other, request, settings)
            claims = decode_access(token, settings)
            actor = await active_identity(db, claims)
            assert actor["session_id"] == claims["sid"]
            authenticated_at = actor["session_authenticated_at"]
            assert (
                await active_identity(
                    db,
                    decode_access(
                        access_token(
                            user, decode_access(foreign, settings)["sid"], settings
                        ),
                        settings,
                    ),
                )
                is None
            )
            await db.commit()
        legacy = jwt.encode(
            {"sub": user["id"], "ver": 0, "exp": _utcnow() + timedelta(minutes=5)},
            settings.auth_jwt_secret,
            algorithm="HS256",
        )
        with pytest.raises(ApiError):
            decode_access(legacy, settings)

        async def rotate_once():
            async with factory() as db:
                try:
                    result = await rotate_session(db, refresh, request, settings)
                    await db.commit()
                    return result
                except ApiError as error:
                    assert error.status_code == 401
                    return None

        rotated = await asyncio.gather(rotate_once(), rotate_once())
        assert sum(value is not None for value in rotated) == 1
        new_token, new_refresh, _ = next(
            value for value in rotated if value is not None
        )
        assert decode_access(new_token, settings)["sid"] == claims["sid"]
        async with factory() as db:
            active = await active_identity(db, claims)
            assert active["session_authenticated_at"] == authenticated_at
            assert (
                await db.execute(
                    text("SELECT COUNT(*) FROM sessions WHERE user_id=:id"),
                    {"id": user["id"]},
                )
            ).scalar_one() == 2
            with pytest.raises(ApiError):
                await revoke_sessions(
                    db,
                    active,
                    request,
                    identifier=decode_access(foreign, settings)["sid"],
                )
            assert await revoke_sessions(
                db, active, request, identifier=decode_access(second, settings)["sid"]
            )
            assert await active_identity(db, decode_access(second, settings)) is None
            await db.commit()
        async with factory() as db:
            with pytest.raises(ApiError):
                await rotate_session(db, second_refresh, request, settings)
            legacy_id, legacy_refresh = _cuid(), _cuid()
            await db.execute(
                text(
                    "INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at,created_at,last_used_at) VALUES (:id,:user,:hash,:expires,:now,:now)"
                ),
                {
                    "id": legacy_id,
                    "user": user["id"],
                    "hash": _hash_token(legacy_refresh),
                    "expires": _utcnow() + timedelta(days=1),
                    "now": _utcnow(),
                },
            )
            upgraded, _, _ = await rotate_session(db, legacy_refresh, request, settings)
            identity = await active_identity(db, decode_access(upgraded, settings))
            assert (
                identity["session_id"] == legacy_id
                and identity["session_authenticated_at"] is None
            )
            assert identity["session_auth_method"] == "LEGACY"
            await db.commit()

        class Socket:
            def __init__(self):
                self.cookies = {"flowie_access": new_token}
                self.app = SimpleNamespace(
                    state=SimpleNamespace(settings=settings, session_factory=factory)
                )
                self.accepted, self.closed = asyncio.Event(), asyncio.Event()
                self.code = None

            async def accept(self):
                self.accepted.set()

            async def close(self, *, code):
                self.code = code
                self.closed.set()

            async def receive_text(self):
                await asyncio.Future()

            async def send_text(self, _):
                pass

        socket = Socket()
        task = asyncio.create_task(
            serve_notifications(socket, workspace, revalidate_interval=0.05)
        )
        try:
            await asyncio.wait_for(socket.accepted.wait(), 2)
            async with factory() as db:
                await db.execute(
                    text("UPDATE sessions SET revoked_at=:now WHERE id=:id"),
                    {"id": claims["sid"], "now": _utcnow()},
                )
                await db.commit()
            await asyncio.wait_for(socket.closed.wait(), 2)
            assert socket.code == 4401
            await task
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        async with factory() as db:
            assert await active_identity(db, claims) is None
            with pytest.raises(ApiError):
                await rotate_session(db, new_refresh, request, settings)
            assert (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM account_security_events WHERE user_id=:user AND kind='LOGIN_SUCCEEDED'"
                    ),
                    {"user": user["id"]},
                )
            ).scalar_one() == 2
    finally:
        async with factory() as db:
            if workspace:
                await db.execute(
                    text("DELETE FROM workspaces WHERE id=:id"), {"id": workspace}
                )
            await db.execute(
                text("DELETE FROM organizations WHERE owner_id=:id"), {"id": user["id"]}
            )
            await db.execute(
                text("DELETE FROM users WHERE id=ANY(CAST(:ids AS text[]))"),
                {"ids": [user["id"], other["id"]]},
            )
            await db.commit()
        await engine.dispose()
