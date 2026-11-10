import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.audit_context import audit_agent
from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.identifiers import cuid
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.work_items.contracts import CreateIssueInput
from app.modules.work_items.issues import create_issue
from app.services.notification_events import actor_payload, create_notification_batch


def test_actor_payload_keeps_the_avatar_of_an_mcp_principal():
    # MCP principals spell the key `avatarUrl`; session users spell it `avatar_url`.
    # VI: Principal MCP dùng khoá `avatarUrl`; user phiên đăng nhập dùng `avatar_url`.
    mcp_user = {"id": "u1", "name": "A", "avatarUrl": "avatars/u1/a.jpg"}
    session_user = {"id": "u1", "name": "A", "avatar_url": "avatars/u1/a.jpg"}
    assert actor_payload(mcp_user)["avatarUrl"] == "avatars/u1/a.jpg"
    assert actor_payload(session_user)["avatarUrl"] == "avatars/u1/a.jpg"


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_agent_actions_reach_the_inbox_of_the_person_whose_token_they_used():
    asyncio.run(verify_agent_notifications())


async def verify_agent_notifications():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = utcnow()
            owner = {"id": cuid(), "name": "Agent owner", "avatar_url": None}
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {"id": owner["id"], "name": owner["name"], "email": cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name="Agent inbox",
                workspace_name=cuid(),
                now=now,
            )
            workspace = seed["workspace_id"]
            issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=seed["team_id"], title="Agent work"
                    ),
                    owner,
                    db,
                )
            )["data"]

            async def notify():
                return await create_notification_batch(
                    db,
                    workspace_id=workspace,
                    recipient_ids=[owner["id"]],
                    actor=owner,
                    event_type="issue.comment",
                    entity_type="issue",
                    entity_id=issue["id"],
                    title="Agent work",
                    message="commented",
                    entity_path="/issue/" + issue["identifier"],
                    discord=False,
                )

            # A person acting directly is not told about their own action.
            assert (await notify()).records == []
            token = audit_agent.set({"connectionId": "connection", "name": "Desktop agent"})
            try:
                (record,) = (await notify()).records
            finally:
                audit_agent.reset(token)
            assert record["userId"] == owner["id"]
            assert record["data"]["agent"]["name"] == "Desktop agent"
            await db.rollback()
    finally:
        await engine.dispose()
