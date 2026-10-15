import asyncio
import json
import os
from dataclasses import replace
from datetime import timedelta
from unittest.mock import AsyncMock, patch
import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.core.config import Settings, _async_database_url
from app.core.identifiers import _cuid, _hash_token
from app.core.clock import _utcnow
from app.domains.auth import create_workspace_bootstrap
from app.db.session import get_session
from app.main import create_app
from app.modules.notifications.delivery_worker import deliver_one, wake_snoozed
from app.modules.identity.security.sessions import access_token


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_snooze_ownership_wake_and_private_email_retry():
    asyncio.run(verify_delivery())


async def verify_delivery():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine)
    user, other, notification = _cuid(), _cuid(), _cuid()
    sessions = {user: _cuid(), other: _cuid()}
    seed = None
    settings = replace(
        Settings.from_environment(),
        database_url=os.environ["MCP_TEST_DATABASE_URL"],
        auth_jwt_secret="notification-test-secret-at-least-32-characters",
        smtp_host="localhost",
        smtp_from="flowie@example.test",
    )
    try:
        async with factory() as db:
            now = _utcnow()
            for identifier in [user, other]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,email_verified_at,created_at,updated_at) VALUES (:id,'Notification fixture',:email,'ACTIVE',:now,:now,:now)"
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
                organization_name="Delivery",
                workspace_name=_cuid(),
                now=now,
            )
            for identifier in [user, other]:
                await db.execute(
                    text(
                        "INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at,created_at,last_used_at) VALUES (:id,:user,:hash,:expires,:now,:now)"
                    ),
                    {
                        "id": sessions[identifier],
                        "user": identifier,
                        "hash": _hash_token(_cuid()),
                        "expires": now + timedelta(days=1),
                        "now": now,
                    },
                )
            await db.execute(
                text(
                    "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,'MEMBER','ACTIVE',:now,:now)"
                ),
                {
                    "id": _cuid(),
                    "workspace": seed["workspace_id"],
                    "user": other,
                    "now": now,
                },
            )
            await db.execute(
                text(
                    "INSERT INTO notification_preferences(workspace_id,user_id,email_enabled,created_at,updated_at) VALUES (:workspace,:user,true,:now,:now)"
                ),
                {"workspace": seed["workspace_id"], "user": user, "now": now},
            )
            project = _cuid()
            await db.execute(
                text(
                    "INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Notification target',:id,:now,:now)"
                ),
                {"id": project, "workspace": seed["workspace_id"], "now": now},
            )
            await db.execute(
                text(
                    "INSERT INTO notifications(id,workspace_id,user_id,type,entity_type,entity_id,data,created_at) VALUES (:id,:workspace,:user,'test','project',:project,CAST(:data AS jsonb),:now)"
                ),
                {
                    "id": notification,
                    "project": project,
                    "workspace": seed["workspace_id"],
                    "user": user,
                    "data": json.dumps({"title": "Private issue title"}),
                    "now": now,
                },
            )
            await db.commit()
        app = create_app(settings)

        async def session():
            async with factory() as db:
                yield db

        app.dependency_overrides[get_session] = session
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://test"
        ) as client:
            client.cookies.set(
                "flowie_access",
                access_token({"id": user}, sessions[user], settings),
            )
            endpoint = f"/api/v1/notifications/{notification}/snooze?workspaceId={seed['workspace_id']}"
            assert (
                await client.post(endpoint, json={"minutes": 60})
            ).status_code == 200
            assert (
                await client.get(
                    f"/api/v1/notifications?workspaceId={seed['workspace_id']}"
                )
            ).json()["data"] == []
            assert (
                len(
                    (
                        await client.get(
                            f"/api/v1/notifications?workspaceId={seed['workspace_id']}&includeSnoozed=true"
                        )
                    ).json()["data"]
                )
                == 1
            )
            client.cookies.set(
                "flowie_access",
                access_token({"id": other}, sessions[other], settings),
            )
            assert (
                await client.post(endpoint, json={"minutes": None})
            ).status_code == 404
        sent = []

        async def send(_settings, message):
            sent.append(message)

        assert not await deliver_one(factory, settings, send, notification)
        async with factory() as db:
            await db.execute(
                text("UPDATE notifications SET snoozed_until=:past WHERE id=:id"),
                {"past": _utcnow() - timedelta(seconds=1), "id": notification},
            )
            await db.commit()
        with patch(
            "app.modules.notifications.delivery_worker.notification_hub.publish",
            new=AsyncMock(),
        ) as publish:
            assert await wake_snoozed(factory) == 1
            assert publish.await_count == 1

        async def fail(_settings, _message):
            raise RuntimeError("provider detail must stay private")

        assert await deliver_one(factory, settings, fail, notification)
        async with factory() as db:
            row = (
                (
                    await db.execute(
                        text(
                            "SELECT * FROM notification_email_deliveries WHERE notification_id=:id"
                        ),
                        {"id": notification},
                    )
                )
                .mappings()
                .one()
            )
            assert (
                row["attempts"] == 1
                and row["last_error_code"] == "SMTP_ERROR"
                and row["failed_at"] is None
            )
            await db.execute(
                text(
                    "UPDATE notification_email_deliveries SET available_at=:now WHERE notification_id=:id"
                ),
                {"id": notification, "now": _utcnow() - timedelta(seconds=1)},
            )
            await db.commit()
        results = await asyncio.gather(
            deliver_one(factory, settings, send, notification),
            deliver_one(factory, settings, send, notification),
        )
        assert sum(results) == 1 and len(sent) == 1
        assert "Private issue title" not in sent[0].get_content()
        async with factory() as db:
            assert (
                await db.execute(
                    text(
                        "SELECT delivered_at FROM notification_email_deliveries WHERE notification_id=:id"
                    ),
                    {"id": notification},
                )
            ).scalar_one()
    finally:
        async with factory() as db:
            if seed:
                await db.execute(
                    text("DELETE FROM organizations WHERE id=:id"),
                    {"id": seed["organization_id"]},
                )
            await db.execute(
                text("DELETE FROM users WHERE id=ANY(CAST(:ids AS text[]))"),
                {"ids": [user, other]},
            )
            await db.commit()
        await engine.dispose()
