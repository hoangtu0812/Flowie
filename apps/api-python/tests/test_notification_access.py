import asyncio
import os
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.native_notifications import list_notifications
from app.modules.notifications.access import readable_records
from app.modules.notifications.outbox import stage_notifications, process_one
from app.services.notification_events import create_notification_batch


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_inbox_producers_and_queued_realtime_delivery_follow_current_entity_access():
    asyncio.run(verify_access())


async def verify_access():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine)
    owner, reader = [{"id": _cuid(), "name": "Notification access"} for _ in range(2)]
    workspace = None
    try:
        async with factory() as db:
            now = _utcnow()
            for user in [owner, reader]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                    ),
                    {**user, "email": _cuid() + "@example.test", "now": now},
                )
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name="Notification access",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.execute(
                text(
                    "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,'ADMIN','ACTIVE',:now,:now)"
                ),
                {
                    "id": _cuid(),
                    "workspace": workspace,
                    "user": reader["id"],
                    "now": now,
                },
            )
            project = _cuid()
            await db.execute(
                text(
                    "INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,'Private project',:id,:now,:now)"
                ),
                {"id": project, "workspace": workspace, "team": team, "now": now},
            )

            async def batch():
                return await create_notification_batch(
                    db,
                    workspace_id=workspace,
                    recipient_ids=[reader["id"]],
                    actor=owner,
                    event_type="project.updated",
                    entity_type="project",
                    entity_id=project,
                    title="Private title",
                    message="changed project",
                    entity_path="/project/" + project,
                    discord=False,
                )

            assert (await batch()).records == []
            await db.execute(
                text(
                    "INSERT INTO team_members(team_id,user_id,created_at) VALUES (:team,:user,:now)"
                ),
                {"team": team, "user": reader["id"], "now": now},
            )
            authorized = await batch()
            assert len(authorized.records) == 1
            assert (
                len((await list_notifications(workspace, False, reader, db))["data"])
                == 1
            )
            assert await readable_records(db, authorized.records) == authorized.records
            await stage_notifications(db, authorized, workspace_id=workspace)
            outbox = (
                await db.execute(
                    text(
                        "SELECT id FROM notification_outbox WHERE workspace_id=:workspace"
                    ),
                    {"workspace": workspace},
                )
            ).scalar_one()
            await db.execute(
                text("DELETE FROM team_members WHERE team_id=:team AND user_id=:user"),
                {"team": team, "user": reader["id"]},
            )
            assert (await list_notifications(workspace, False, reader, db))[
                "data"
            ] == []
            assert await readable_records(db, authorized.records) == []
            await db.commit()
        with patch("app.modules.notifications.outbox.deliver", AsyncMock()) as delivery:
            assert await process_one(factory, outbox)
            assert delivery.await_args.args[0]["records"] == []
    finally:
        async with factory() as db:
            if workspace:
                await db.execute(
                    text("DELETE FROM workspaces WHERE id=:id"), {"id": workspace}
                )
            await db.execute(
                text("DELETE FROM organizations WHERE owner_id=:id"),
                {"id": owner["id"]},
            )
            await db.execute(
                text("DELETE FROM users WHERE id=ANY(CAST(:ids AS text[]))"),
                {"ids": [owner["id"], reader["id"]]},
            )
            await db.commit()
        await engine.dispose()
