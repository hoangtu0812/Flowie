import asyncio
from datetime import timedelta
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.audit_context import audit_source
from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.contracts import CreateIssueInput, UpdateIssueInput
from app.modules.work_items.issues import create_issue, update_issue
from app.modules.work_items.lifecycle import actor_context, managed_due


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_lifecycle_captures_real_transitions_and_preserves_terminal_timestamps():
    asyncio.run(verify_history())


async def verify_history():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            user = {"id": _cuid(), "name": "Lifecycle test"}
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user["id"],
                organization_name="Lifecycle",
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
            token = audit_source.set("WEB")
            try:
                issue = (
                    await create_issue(
                        CreateIssueInput(
                            workspaceId=workspace,
                            teamId=team,
                            title="Actual lifecycle",
                            statusId=statuses["UNSTARTED"],
                        ),
                        user,
                        db,
                    )
                )["data"]
                await update_issue(
                    issue["id"],
                    UpdateIssueInput(statusId=statuses["STARTED"]),
                    workspace,
                    user,
                    db,
                )
                done = (
                    await update_issue(
                        issue["id"],
                        UpdateIssueInput(statusId=statuses["COMPLETED"]),
                        workspace,
                        user,
                        db,
                    )
                )["data"]
                unchanged = (
                    await update_issue(
                        issue["id"],
                        UpdateIssueInput(
                            statusId=statuses["COMPLETED"],
                            title="Edited completed task",
                        ),
                        workspace,
                        user,
                        db,
                    )
                )["data"]
                assert unchanged["completedAt"] == done["completedAt"]
                rows = (
                    (
                        await db.execute(
                            text(
                                "SELECT * FROM issue_lifecycle_events WHERE issue_id=:id ORDER BY issue_version"
                            ),
                            {"id": issue["id"]},
                        )
                    )
                    .mappings()
                    .all()
                )
                assert len(rows) == 3
                assert [row["kind"] for row in rows] == [
                    "CREATED",
                    "CHANGED",
                    "CHANGED",
                ]
                assert [row["to_category"] for row in rows] == [
                    "UNSTARTED",
                    "STARTED",
                    "COMPLETED",
                ]
                assert all(
                    row["source"] == "WEB" and row["actor_id"] == user["id"]
                    for row in rows
                )
                assert all(
                    rows[n]["occurred_at"] <= rows[n + 1]["occurred_at"]
                    for n in range(2)
                )
                await actor_context(db, user["id"], source="AI")
                # Database capture also covers status writers outside the shared Python update service.
                await db.execute(
                    text(
                        "UPDATE issues SET status_id=:status,completed_at=NULL WHERE id=:id"
                    ),
                    {"id": issue["id"], "status": statuses["UNSTARTED"]},
                )
                latest = (
                    (
                        await db.execute(
                            text(
                                "SELECT * FROM issue_lifecycle_events WHERE issue_id=:id ORDER BY issue_version DESC LIMIT 1"
                            ),
                            {"id": issue["id"]},
                        )
                    )
                    .mappings()
                    .one()
                )
                assert (
                    latest["from_category"] == "COMPLETED"
                    and latest["to_category"] == "UNSTARTED"
                    and latest["source"] == "AI"
                )
                await managed_due(db, issue["id"], now + timedelta(hours=1))
                assert (
                    await db.execute(
                        text(
                            "SELECT managed_due FROM issue_lifecycle_events WHERE issue_id=:id ORDER BY issue_version DESC LIMIT 1"
                        ),
                        {"id": issue["id"]},
                    )
                ).scalar_one() is True
                await db.execute(
                    text("UPDATE issues SET archived_at=:now WHERE id=:id"),
                    {"id": issue["id"], "now": now},
                )
                assert (
                    await db.execute(
                        text(
                            "SELECT managed_due FROM issue_lifecycle_events WHERE issue_id=:id ORDER BY issue_version DESC LIMIT 1"
                        ),
                        {"id": issue["id"]},
                    )
                ).scalar_one() is False
                # Failed mutations do not leave status evidence outside their transaction.
                count = (
                    await db.execute(
                        text(
                            "SELECT COUNT(*) FROM issue_lifecycle_events WHERE issue_id=:id"
                        ),
                        {"id": issue["id"]},
                    )
                ).scalar_one()
                try:
                    async with db.begin_nested():
                        await db.execute(
                            text(
                                "UPDATE issues SET archived_at=NULL,status_id=:status WHERE id=:id"
                            ),
                            {"id": issue["id"], "status": statuses["STARTED"]},
                        )
                        raise RuntimeError("synthetic rollback")
                except RuntimeError:
                    pass
                assert (
                    await db.execute(
                        text(
                            "SELECT COUNT(*) FROM issue_lifecycle_events WHERE issue_id=:id"
                        ),
                        {"id": issue["id"]},
                    )
                ).scalar_one() == count
            finally:
                audit_source.reset(token)
            await db.rollback()
    finally:
        await engine.dispose()
