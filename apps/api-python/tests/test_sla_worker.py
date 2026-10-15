import asyncio
from datetime import timedelta
import os
from unittest.mock import patch

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.sla.contracts import PolicyValues
from app.modules.sla.contracts import RetrySlaJob
from app.modules.sla.commands import retry_job
from app.modules.sla.jobs import record_failure
from app.modules.sla.policies import create_policy
from app.modules.sla.synchronization import latest_cycle, sync_issue
from app.modules.sla.worker import process_sla_job
from app.modules.work_items.contracts import CreateIssueInput
from app.modules.work_items.issues import create_issue


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_sla_durable_alerts_escalation_concurrency_revocation_and_failure_recovery():
    asyncio.run(verify_worker())


async def verify_worker():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine)
    owner = {"id": _cuid(), "name": "SLA worker owner"}
    target = {"id": _cuid(), "name": "Escalation target"}
    workspace = None
    try:
        async with factory() as db:
            now = _utcnow()
            for user in (owner, target):
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                    ),
                    {**user, "email": _cuid() + "@example.test", "now": now},
                )
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name="SLA worker",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.execute(
                text(
                    "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,'MEMBER','ACTIVE',:now,:now)"
                ),
                {
                    "id": _cuid(),
                    "workspace": workspace,
                    "user": target["id"],
                    "now": now,
                },
            )
            await db.execute(
                text(
                    "INSERT INTO team_members(team_id,user_id,created_at) VALUES (:team,:user,:now)"
                ),
                {"team": team, "user": target["id"], "now": now},
            )
            await create_policy(
                db,
                workspace,
                owner,
                PolicyValues(
                    name="Escalating clock",
                    deadlineMinutes=15,
                    warningMinutes=5,
                    escalateToId=target["id"],
                ),
            )
            issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=team, title="Sensitive SLA issue"
                    ),
                    owner,
                    db,
                )
            )["data"]
            cycle = await latest_cycle(db, issue["id"])
            await db.commit()
        warning = cycle["warning_at"] + timedelta(seconds=1)
        results = await asyncio.gather(
            *(
                process_sla_job(factory, now=warning, issue_id=issue["id"])
                for _ in range(2)
            )
        )
        assert results.count(True) == 1
        assert not await process_sla_job(factory, now=warning, issue_id=issue["id"])
        async with factory() as db:
            current = await latest_cycle(db, issue["id"])
            assert current["warning_sent_at"] == warning
            assert current["alert_results"]["warning"] == {
                "outcome": "QUEUED",
                "recipients": 1,
            }
            assert (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM notifications WHERE entity_id=:id AND type='issue.sla_warning'"
                    ),
                    {"id": issue["id"]},
                )
            ).scalar_one() == 1
        breach = cycle["due_at"] + timedelta(seconds=1)
        assert await process_sla_job(factory, now=breach, issue_id=issue["id"])
        async with factory() as db:
            current = await latest_cycle(db, issue["id"])
            assert current["breached_at"] == cycle["due_at"]
            assert (
                current["escalation_code"] == "APPLIED"
                and current["escalated_at"] == breach
            )
            assert current["alert_results"]["breach"]["recipients"] == 2
            assert (
                await db.execute(
                    text("SELECT assignee_id FROM issues WHERE id=:id"),
                    {"id": issue["id"]},
                )
            ).scalar_one() == target["id"]
            assert (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM notification_outbox WHERE workspace_id=:id"
                    ),
                    {"id": workspace},
                )
            ).scalar_one() >= 2
        assert not await process_sla_job(factory, now=breach, issue_id=issue["id"])

        async with factory() as db:
            second = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=team, title="Revoked escalation"
                    ),
                    owner,
                    db,
                )
            )["data"]
            clock = await latest_cycle(db, second["id"])
            await db.execute(
                text("DELETE FROM team_members WHERE team_id=:team AND user_id=:user"),
                {"team": team, "user": target["id"]},
            )
            await db.commit()
        late = clock["due_at"] + timedelta(seconds=1)
        assert await process_sla_job(factory, now=late, issue_id=second["id"])
        async with factory() as db:
            current = await latest_cycle(db, second["id"])
            assert current["escalation_code"] == "SKIPPED_NO_ACCESS"
            assert current["warning_sent_at"] is None
            assert current["alert_results"]["breach"]["recipients"] == 1
            third = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=team, title="Retry clock"
                    ),
                    owner,
                    db,
                )
            )["data"]
            clock = await latest_cycle(db, third["id"])
            await db.commit()
        attempt = clock["warning_at"] + timedelta(seconds=1)
        with patch(
            "app.modules.sla.alerts.stage_notifications",
            side_effect=RuntimeError("secret must not persist"),
        ):
            with pytest.raises(RuntimeError):
                await process_sla_job(factory, now=attempt, issue_id=third["id"])
        async with factory() as db:
            job = (
                (
                    await db.execute(
                        text("SELECT * FROM issue_sla_jobs WHERE issue_id=:id"),
                        {"id": third["id"]},
                    )
                )
                .mappings()
                .one()
            )
            assert job["attempts"] == 1 and job["last_error_code"] == "RuntimeError"
            assert (await latest_cycle(db, third["id"]))["warning_sent_at"] is None
            assert (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM notifications WHERE entity_id=:id AND type='issue.sla_warning'"
                    ),
                    {"id": third["id"]},
                )
            ).scalar_one() == 0
            generation = job["generation"]
            await sync_issue(db, third["id"])
            await db.commit()
        await record_failure(
            factory, third["id"], generation, ValueError("stale"), now=attempt
        )
        async with factory() as db:
            job = (
                (
                    await db.execute(
                        text("SELECT * FROM issue_sla_jobs WHERE issue_id=:id"),
                        {"id": third["id"]},
                    )
                )
                .mappings()
                .one()
            )
            assert job["attempts"] == 0 and job["generation"] > generation
            generation = job["generation"]
        for count in range(8):
            await record_failure(
                factory, third["id"], generation, RuntimeError("private"), now=attempt
            )
        assert not await process_sla_job(
            factory, now=attempt + timedelta(days=1), issue_id=third["id"]
        )
        async with factory() as db:
            job = (
                (
                    await db.execute(
                        text("SELECT * FROM issue_sla_jobs WHERE issue_id=:id"),
                        {"id": third["id"]},
                    )
                )
                .mappings()
                .one()
            )
            assert job["attempts"] == 8 and job["failed_at"] == attempt
            await retry_job(
                db,
                workspace,
                owner,
                third["id"],
                RetrySlaJob(expectedGeneration=generation),
            )
            await db.commit()
        await record_failure(
            factory, third["id"], generation, RuntimeError("stale retry"), now=attempt
        )
        assert await process_sla_job(factory, now=attempt, issue_id=third["id"])
        async with factory() as db:
            assert (await latest_cycle(db, third["id"]))["warning_sent_at"] == attempt
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
                {"ids": [owner["id"], target["id"]]},
            )
            await db.commit()
        await engine.dispose()
