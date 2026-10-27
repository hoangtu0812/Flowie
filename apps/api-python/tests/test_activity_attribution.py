import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.audit_context import audit_agent, audit_source
from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.collaboration_feed import comment_rows
from app.modules.work_items.comments import create_comment
from app.modules.work_items.contracts import (
    CreateCommentInput,
    CreateIssueInput,
    UpdateIssueInput,
)
from app.modules.work_items.issues import create_issue, update_issue


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_agent_writes_record_changes_and_connection():
    asyncio.run(verify_attribution())


async def verify_attribution():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            user = {"id": _cuid(), "name": "Attribution test"}
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user["id"],
                organization_name="Attribution",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            statuses = dict(
                (
                    await db.execute(
                        text(
                            "SELECT category::text,id FROM issue_statuses WHERE workspace_id=:workspace"
                        ),
                        {"workspace": workspace},
                    )
                ).all()
            )
            issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace,
                        teamId=team,
                        title="Attribution",
                        statusId=statuses["UNSTARTED"],
                    ),
                    user,
                    db,
                )
            )["data"]
            agent = {"connectionId": "connection-1", "name": "Claude Code laptop"}
            source_token, agent_token = audit_source.set("AI"), audit_agent.set(agent)
            try:
                await update_issue(
                    issue["id"],
                    UpdateIssueInput(statusId=statuses["STARTED"], title="Renamed"),
                    workspace,
                    user,
                    db,
                )
                comment = (
                    await create_comment(
                        CreateCommentInput(
                            workspaceId=workspace, issueId=issue["id"], content="Done"
                        ),
                        user,
                        db,
                    )
                )["data"]
            finally:
                audit_agent.reset(agent_token)
                audit_source.reset(source_token)
            updated = (
                await db.execute(
                    text(
                        "SELECT data FROM activities WHERE issue_id=:id AND type='issue.updated'"
                    ),
                    {"id": issue["id"]},
                )
            ).scalar_one()
            assert updated["source"] == "AI"
            assert updated["agent"] == agent
            assert {"field": "Title", "change": "Attribution → Renamed"} in updated[
                "changes"
            ]
            assert any(change["field"] == "Status" for change in updated["changes"])
            assert comment["agent"] == agent
            [listed] = await comment_rows(db, [comment["id"]], workspace, user["id"])
            assert listed["agent"] == agent
            created = (
                await db.execute(
                    text(
                        "SELECT data FROM activities WHERE issue_id=:id AND type='issue.created'"
                    ),
                    {"id": issue["id"]},
                )
            ).scalar_one()
            assert "agent" not in created
            web_token = audit_source.set("WEB")
            try:
                human = (
                    await create_comment(
                        CreateCommentInput(
                            workspaceId=workspace, issueId=issue["id"], content="Human"
                        ),
                        user,
                        db,
                    )
                )["data"]
            finally:
                audit_source.reset(web_token)
            assert human["agent"] is None
            # Agent comments written before connection names were stored still read as agent.
            # VI: Comment của agent ghi trước khi lưu tên connection vẫn được nhận là của agent.
            legacy_token = audit_source.set("AI")
            try:
                legacy = (
                    await create_comment(
                        CreateCommentInput(
                            workspaceId=workspace, issueId=issue["id"], content="Legacy"
                        ),
                        user,
                        db,
                    )
                )["data"]
            finally:
                audit_source.reset(legacy_token)
            assert legacy["agent"] == {}
            await db.rollback()
    finally:
        await engine.dispose()
