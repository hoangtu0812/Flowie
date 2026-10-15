import asyncio
from copy import deepcopy
from datetime import datetime, timedelta
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.sla.contracts import PolicyValues, UpdatePolicy
from app.modules.sla.cycles import transition
from app.modules.sla.policies import create_policy, update_policy
from app.modules.sla.queries import issue_sla, sla_report
from app.modules.sla.commands import apply_current_policy
from app.modules.sla.contracts import IssueSlaCommand
from app.core.errors import ApiError
from app.modules.sla.synchronization import latest_cycle, reapply_policy, sync_issue
from app.modules.work_items.contracts import CreateIssueInput, UpdateIssueInput
from app.modules.work_items.issues import create_issue, update_issue


def test_sla_pause_preserves_fractional_business_budget_and_deadline_boundary():
    start = datetime(2026, 10, 15, 9)
    cycle = {
        "state": "ACTIVE",
        "remaining_seconds": 3600.0,
        "last_started_at": start,
        "due_at": start + timedelta(hours=1),
        "snapshot": PolicyValues(
            name="Clock", deadlineMinutes=60, pauseStatusIds=["waiting"]
        ).model_dump(mode="json"),
        "warning_sent_at": None,
        "warning_at": None,
        "closed_at": None,
        "breached_at": None,
    }
    active = deepcopy(cycle)

    def event(at, status, category="STARTED"):
        return {
            "occurred_at": at,
            "to_status_id": status,
            "to_category": category,
            "to_archived_at": None,
        }

    transition(
        cycle, event(start + timedelta(minutes=30, microseconds=375000), "waiting")
    )
    assert (
        cycle["state"] == "PAUSED"
        and cycle["remaining_seconds"] == 1799.625
        and cycle["due_at"] is None
    )
    resume = start + timedelta(days=1)
    transition(cycle, event(resume, "working"))
    assert cycle["due_at"] == resume + timedelta(seconds=1799.625)
    transition(cycle, event(cycle["due_at"], "done", "COMPLETED"))
    assert cycle["state"] == "COMPLETED" and cycle["breached_at"] is None
    transition(
        active, event(active["due_at"] + timedelta(microseconds=1), "done", "COMPLETED")
    )
    assert active["breached_at"] == start + timedelta(hours=1)


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_shared_issue_sla_lifecycle_revision_isolation_override_restore_and_team_move():
    asyncio.run(verify_cycles())


async def verify_cycles():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            user = {"id": _cuid(), "name": "SLA clock test"}
            now = _utcnow()
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user["id"],
                organization_name="SLA cycles",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            statuses = {
                row["name"]: row["id"]
                for row in (
                    await db.execute(
                        text(
                            "SELECT id,name FROM issue_statuses WHERE workspace_id=:workspace"
                        ),
                        {"workspace": workspace},
                    )
                ).mappings()
            }
            values = PolicyValues(
                name="Accepted clock",
                deadlineMinutes=60,
                pauseStatusIds=[statuses["Paused"]],
                warningMinutes=15,
            )
            policy = await create_policy(db, workspace, user, values)
            issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace,
                        teamId=team,
                        title="Tracked clock",
                        statusId=statuses["Todo"],
                    ),
                    user,
                    db,
                )
            )["data"]
            cycle = await latest_cycle(db, issue["id"])
            assert (
                cycle["state"] == "ACTIVE"
                and cycle["policy_version"] == 1
                and cycle["remaining_seconds"] == 3600
            )
            assert issue["dueDate"] == cycle["due_at"] and issue["version"] == 1
            view = await issue_sla(db, workspace, user, issue["id"])
            assert view["data"]["coverage"] == "TRACKED"
            assert view["data"]["current"]["state"] == "ACTIVE"
            assert (await sla_report(db, workspace, user, {}))["data"]["active"] == 1
            paused = (
                await update_issue(
                    issue["id"],
                    UpdateIssueInput(statusId=statuses["Paused"]),
                    workspace,
                    user,
                    db,
                )
            )["data"]
            cycle = await latest_cycle(db, issue["id"])
            assert (
                cycle["state"] == "PAUSED"
                and paused["dueDate"] is None
                and 3590 < cycle["remaining_seconds"] <= 3600
            )
            assert (await sla_report(db, workspace, user, {}))["data"]["paused"] == 1
            resumed = (
                await update_issue(
                    issue["id"],
                    UpdateIssueInput(statusId=statuses["In Progress"]),
                    workspace,
                    user,
                    db,
                )
            )["data"]
            assert resumed["dueDate"] is not None
            await update_policy(
                db,
                workspace,
                user,
                policy["id"],
                UpdatePolicy(
                    **{**values.model_dump(), "deadlineMinutes": 120}, expectedVersion=1
                ),
            )
            done = (
                await update_issue(
                    issue["id"],
                    UpdateIssueInput(statusId=statuses["Done"]),
                    workspace,
                    user,
                    db,
                )
            )["data"]
            complete = await latest_cycle(db, issue["id"])
            assert complete["state"] == "COMPLETED" and complete["breached_at"] is None
            assert (await sla_report(db, workspace, user, {}))["data"][
                "compliancePercent"
            ] == 100
            repeated = (
                await update_issue(
                    issue["id"],
                    UpdateIssueInput(statusId=statuses["Done"]),
                    workspace,
                    user,
                    db,
                )
            )["data"]
            assert repeated["completedAt"] == done["completedAt"]
            await update_issue(
                issue["id"],
                UpdateIssueInput(statusId=statuses["Todo"]),
                workspace,
                user,
                db,
            )
            reopened = await latest_cycle(db, issue["id"])
            assert (
                reopened["cycle"] == 2
                and reopened["policy_version"] == 1
                and reopened["budget_seconds"] == 3600
            )
            fresh = await reapply_policy(db, issue["id"])
            assert (
                fresh["cycle"] == 3
                and fresh["policy_version"] == 2
                and fresh["budget_seconds"] == 7200
            )
            manual = now + timedelta(days=2)
            changed = (
                await update_issue(
                    issue["id"],
                    UpdateIssueInput(dueDate=manual.isoformat()),
                    workspace,
                    user,
                    db,
                )
            )["data"]
            assert abs((changed["dueDate"] - manual).total_seconds()) < 0.001
            assert (await latest_cycle(db, issue["id"]))["state"] == "OVERRIDDEN"
            await update_issue(
                issue["id"],
                UpdateIssueInput(statusId=statuses["Done"]),
                workspace,
                user,
                db,
            )
            await update_issue(
                issue["id"],
                UpdateIssueInput(statusId=statuses["Todo"]),
                workspace,
                user,
                db,
            )
            assert (await latest_cycle(db, issue["id"]))["cycle"] == 3
            fresh = await reapply_policy(db, issue["id"])
            assert fresh["cycle"] == 4
            cleared = (
                await update_issue(
                    issue["id"], UpdateIssueInput(dueDate=None), workspace, user, db
                )
            )["data"]
            assert (
                cleared["dueDate"] is None
                and (await latest_cycle(db, issue["id"]))["state"] == "OVERRIDDEN"
            )
            await reapply_policy(db, issue["id"])
            await db.execute(
                text("UPDATE issues SET archived_at=:now WHERE id=:id"),
                {"id": issue["id"], "now": _utcnow()},
            )
            await sync_issue(db, issue["id"])
            assert (await latest_cycle(db, issue["id"]))["state"] == "CANCELED"
            await db.execute(
                text("UPDATE issues SET archived_at=NULL WHERE id=:id"),
                {"id": issue["id"]},
            )
            await sync_issue(db, issue["id"])
            restored = await latest_cycle(db, issue["id"])
            assert (
                restored["state"] == "ACTIVE"
                and restored["cycle"] == 6
                and restored["policy_version"] == 2
            )
            destination = _cuid()
            await db.execute(
                text(
                    "INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Destination','DEST',:now,:now)"
                ),
                {"id": destination, "workspace": workspace, "now": _utcnow()},
            )
            await db.execute(
                text(
                    "INSERT INTO team_members(team_id,user_id,created_at) VALUES (:team,:actor,:now)"
                ),
                {"team": destination, "actor": user["id"], "now": _utcnow()},
            )
            destination_policy = await create_policy(
                db,
                workspace,
                user,
                PolicyValues(
                    name="Destination clock", deadlineMinutes=30, teamId=destination
                ),
            )
            await db.execute(
                text("UPDATE issues SET team_id=:team WHERE id=:id"),
                {"id": issue["id"], "team": destination},
            )
            await sync_issue(db, issue["id"])
            moved = await latest_cycle(db, issue["id"])
            assert (
                moved["cycle"] == 7
                and moved["policy_id"] == destination_policy["id"]
                and moved["budget_seconds"] == 1800
            )
            assert (
                await db.execute(
                    text("SELECT state FROM issue_sla_cycles WHERE id=:id"),
                    {"id": restored["id"]},
                )
            ).scalar_one() == "CANCELED"
            assert (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM issue_lifecycle_events WHERE issue_id=:id AND sla_processed_at IS NULL"
                    ),
                    {"id": issue["id"]},
                )
            ).scalar_one() == 0
            explicit = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace,
                        teamId=team,
                        title="Explicit manual deadline",
                        dueDate=manual.isoformat(),
                    ),
                    user,
                    db,
                )
            )["data"]
            assert await latest_cycle(db, explicit["id"]) is None
            command = IssueSlaCommand(
                expectedVersion=explicit["version"], expectedCycle=None
            )
            await apply_current_policy(db, workspace, user, explicit["id"], command)
            with pytest.raises(ApiError) as stale:
                await apply_current_policy(db, workspace, user, explicit["id"], command)
            assert stale.value.status_code == 409
            # Scope aggregates cover all matching rows, including untracked legacy issues.
            await db.execute(
                text("""INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,created_at,updated_at)
                SELECT :prefix||n::text,:workspace,:team,:status,'SLA-TEST-'||n::text,n+1000,'Legacy report issue',:actor,:now,:now FROM generate_series(1,150) n"""),
                {
                    "prefix": _cuid(),
                    "workspace": workspace,
                    "team": team,
                    "status": statuses["Todo"],
                    "actor": user["id"],
                    "now": now,
                },
            )
            report = (await sla_report(db, workspace, user, {}))["data"]
            assert report["total"] == 152 and report["unmanaged"] == 150
            assert (
                await sla_report(db, workspace, user, {"query": "no matching title"})
            )["data"]["total"] == 0
            seen, before = [], None
            while True:
                history = await issue_sla(
                    db, workspace, user, issue["id"], before=before, limit=2
                )
                seen.extend(row["cycle"] for row in history["data"]["history"])
                before = history["meta"]["nextBefore"]
                if before is None:
                    break
            assert seen == list(range(7, 0, -1))
            await db.execute(
                text("DELETE FROM team_members WHERE team_id=:team AND user_id=:user"),
                {"team": team, "user": user["id"]},
            )
            limited = await issue_sla(db, workspace, user, issue["id"])
            assert limited["meta"]["total"] == 1
            assert [row["cycle"] for row in limited["data"]["history"]] == [7]
            assert (await sla_report(db, workspace, user, {}))["data"]["total"] == 1
            await db.rollback()
    finally:
        await engine.dispose()
