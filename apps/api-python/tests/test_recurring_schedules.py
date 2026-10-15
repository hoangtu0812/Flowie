import asyncio
from datetime import datetime, timedelta
import os
from unittest.mock import patch

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.timezones import local_instant, time_zone
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.recurring.calendar import next_occurrence, upcoming
from app.modules.recurring.contracts import (
    ScheduleRule,
    CreateSchedule,
    UpdateSchedule,
    ScheduleCommand,
)
from app.modules.recurring.repository import schedules, run_history
from app.modules.recurring.service import (
    create_schedule,
    update_schedule,
    schedule_command,
)
from app.modules.recurring.worker import process_schedule


def test_schedule_calendar_handles_dst_month_ends_intervals_and_invalid_rules():
    assert local_instant(
        datetime(2011, 12, 30, 12), time_zone("Pacific/Apia")
    ) == datetime(2011, 12, 30, 10)
    daily = ScheduleRule(
        timezone="America/New_York",
        startDate="2026-03-01",
        time="02:30",
        frequency="DAILY",
    )
    assert next_occurrence(daily, datetime(2026, 3, 8, 0)) == datetime(2026, 3, 8, 7)
    overlap = daily.model_copy(
        update={"startDate": datetime(2026, 10, 1).date(), "time": "01:30"}
    )
    assert upcoming(overlap, datetime(2026, 11, 1), 2) == [
        datetime(2026, 11, 1, 5, 30),
        datetime(2026, 11, 2, 6, 30),
    ]
    monthly = ScheduleRule(
        timezone="Asia/Ho_Chi_Minh",
        startDate="2028-01-01",
        time="09:00",
        frequency="MONTHLY",
        monthDay=31,
    )
    assert upcoming(monthly, datetime(2028, 1, 31, 2), 2) == [
        datetime(2028, 2, 29, 2),
        datetime(2028, 3, 31, 2),
    ]
    weekly = ScheduleRule(
        timezone="UTC",
        startDate="2026-01-07",
        time="09:00",
        frequency="WEEKLY",
        interval=2,
        weekdays=[0],
    )
    assert next_occurrence(weekly, datetime(2026, 1, 7)) == datetime(2026, 1, 19, 9)
    for values in [
        {"timezone": "Unknown/Zone"},
        {"time": "25:99"},
        {"weekdays": []},
        {"weekdays": [0, 0]},
        {"frequency": "MONTHLY", "interval": 13},
        {"startDate": "2019-01-01"},
    ]:
        with pytest.raises(ValidationError):
            ScheduleRule.model_validate(
                {"startDate": "2026-01-01", "time": "09:00", **values}
            )


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_recurring_atomic_runs_idempotency_pause_references_and_current_permissions():
    asyncio.run(verify_recurring())


async def verify_recurring():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine)
    user = {"id": _cuid(), "name": "Recurring owner"}
    workspace = None
    try:
        async with factory() as db:
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
                organization_name="Recurring tests",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.commit()
        payload = CreateSchedule(
            workspaceId=workspace,
            teamId=team,
            requestKey=_cuid(),
            name="Daily support",
            rule={
                "timezone": "Asia/Ho_Chi_Minh",
                "startDate": "2026-01-01",
                "time": "09:00",
                "frequency": "DAILY",
            },
            template={
                "title": "Recurring engineering bug",
                "issueType": "BUG",
                "severity": "HIGH",
            },
            dueAfterMinutes=60,
        )
        async with factory() as db:
            schedule = await create_schedule(db, user, payload)
            assert (await create_schedule(db, user, payload))["id"] == schedule["id"]
            with pytest.raises(ApiError):
                await create_schedule(
                    db, user, payload.model_copy(update={"name": "Changed key"})
                )
            await db.commit()

        async def command(name, **extra):
            async with factory() as db:
                result = await schedule_command(
                    db,
                    user,
                    workspace,
                    schedule["id"],
                    name,
                    ScheduleCommand(
                        expectedVersion=extra.pop("version", schedule["version"]),
                        **extra,
                    ),
                )
                await db.commit()
                return result

        manual_key = _cuid()
        await command("run-now", requestKey=manual_key)
        await command("run-now", requestKey=manual_key)
        assert (
            sum(
                await asyncio.gather(
                    process_schedule(factory), process_schedule(factory)
                )
            )
            == 1
        )
        async with factory() as db:
            history = await run_history(db, workspace, user, "secret", schedule["id"])
            assert (
                history["meta"]["total"] == 1 and history["data"][0]["state"] == "DONE"
            )
            issue = (
                (
                    await db.execute(
                        text("SELECT * FROM issues WHERE workspace_id=:workspace"),
                        {"workspace": workspace},
                    )
                )
                .mappings()
                .one()
            )
            assert issue["issue_type"] == "BUG" and issue["severity"] == "HIGH"
            assert (
                abs((issue["due_date"] - issue["created_at"]).total_seconds() - 3600)
                < 5
            )
        # Replaying a successful manual request cannot create another task.
        await command("run-now", requestKey=manual_key)
        assert not await process_schedule(factory)
        async with factory() as db:
            project, private_team = _cuid(), _cuid()
            await db.execute(
                text(
                    "INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Recurring project',:id,:now,:now)"
                ),
                {"id": project, "workspace": workspace, "now": _utcnow()},
            )
            private_schedule = await create_schedule(
                db,
                user,
                payload.model_copy(
                    update={
                        "requestKey": _cuid(),
                        "name": "Changed reference",
                        "template": payload.template.model_copy(
                            update={"projectId": project}
                        ),
                    }
                ),
            )
            await db.execute(
                text(
                    "INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Private team','PRIVATE',:now,:now)"
                ),
                {"id": private_team, "workspace": workspace, "now": _utcnow()},
            )
            await db.execute(
                text("UPDATE projects SET team_id=:team WHERE id=:id"),
                {"id": project, "team": private_team},
            )
            visible = await schedules(db, workspace, user, "secret", limit=1)
            assert (
                visible["meta"]["total"] == 2
                and len(visible["data"]) == 1
                and visible["meta"]["nextCursor"]
            )
            models = await schedules(db, workspace, user, "secret")
            redacted = next(
                row for row in models["data"] if row["id"] == private_schedule["id"]
            )
            assert (
                redacted["template"]["projectId"] is None
                and redacted["unavailableProject"]
            )
            await schedule_command(
                db,
                user,
                workspace,
                private_schedule["id"],
                "run-now",
                ScheduleCommand(expectedVersion=1, requestKey=_cuid()),
            )
            await db.commit()
        assert await process_schedule(factory)
        async with factory() as db:
            failed = await run_history(
                db, workspace, user, "secret", private_schedule["id"]
            )
            assert (
                failed["data"][0]["state"] == "FAILED"
                and failed["data"][0]["errorCode"] == "REFERENCE_UNAVAILABLE"
            )
            await schedule_command(
                db,
                user,
                workspace,
                private_schedule["id"],
                "pause",
                ScheduleCommand(expectedVersion=1),
            )
            await db.commit()
        paused = await command("pause")
        assert not paused["active"]
        with pytest.raises(ApiError):
            await command("run-now", version=paused["version"], requestKey=_cuid())
        with pytest.raises(ApiError):
            await command("resume")
        schedule = await command("resume", version=paused["version"])
        past = _utcnow() - timedelta(days=40)
        async with factory() as db:
            await db.execute(
                text("UPDATE recurring_schedules SET next_run_at=:due WHERE id=:id"),
                {"id": schedule["id"], "due": past},
            )
            await db.commit()
        assert await process_schedule(factory)
        async with factory() as db:
            assert (
                await db.execute(
                    text("SELECT COUNT(*) FROM recurring_runs WHERE schedule_id=:id"),
                    {"id": schedule["id"]},
                )
            ).scalar_one() == 2
            assert (
                await db.execute(
                    text("SELECT next_run_at FROM recurring_schedules WHERE id=:id"),
                    {"id": schedule["id"]},
                )
            ).scalar_one() > _utcnow()
            # Simulate a stale due value after a committed run: occurrence uniqueness still prevents replay.
            await db.execute(
                text(
                    "UPDATE recurring_schedules SET next_run_at=(SELECT scheduled_for FROM recurring_runs WHERE schedule_id=:id AND occurrence_key LIKE 'due:%' LIMIT 1) WHERE id=:id"
                ),
                {"id": schedule["id"]},
            )
            await db.commit()
        assert await process_schedule(factory)
        async with factory() as db:
            assert (
                await db.execute(
                    text("SELECT COUNT(*) FROM issues WHERE workspace_id=:workspace"),
                    {"workspace": workspace},
                )
            ).scalar_one() == 2
            # History remains navigable beyond the initial page.
            await db.execute(
                text("""INSERT INTO recurring_runs(id,schedule_id,occurrence_key,scheduled_for,state,snapshot,created_at)
                SELECT 'c'||md5(:id||n::text),:id,'history:'||n,:now,'DONE',jsonb_build_object('version',1),:now FROM generate_series(1,105) n"""),
                {"id": schedule["id"], "now": _utcnow()},
            )
            await db.commit()
            page = await run_history(db, workspace, user, "secret", schedule["id"])
            seen = {row["id"] for row in page["data"]}
            while page["meta"]["nextCursor"]:
                page = await run_history(
                    db,
                    workspace,
                    user,
                    "secret",
                    schedule["id"],
                    page["meta"]["nextCursor"],
                )
                ids = {row["id"] for row in page["data"]}
                assert not ids & seen
                seen |= ids
            assert len(seen) == 107
            with pytest.raises(ApiError):
                await update_schedule(
                    db,
                    user,
                    workspace,
                    schedule["id"],
                    UpdateSchedule(
                        **payload.model_dump(
                            include={"name", "rule", "template", "dueAfterMinutes"}
                        ),
                        expectedVersion=1,
                    ),
                )
        # A domain failure after creating a task rolls its task and side effects back.
        await command("run-now", requestKey=_cuid())

        async def fail_after_create(payload, user, db):
            from app.modules.work_items.issues import create_issue

            await create_issue(payload, user, db)
            raise RuntimeError("synthetic failure")

        with patch("app.modules.recurring.worker.create_issue", fail_after_create):
            assert await process_schedule(factory)
        async with factory() as db:
            assert (
                await db.execute(
                    text("SELECT COUNT(*) FROM issues WHERE workspace_id=:workspace"),
                    {"workspace": workspace},
                )
            ).scalar_one() == 2
        async with factory() as db:
            await db.execute(
                text(
                    "UPDATE workspace_members SET role='MEMBER' WHERE workspace_id=:workspace AND user_id=:actor"
                ),
                {"workspace": workspace, "actor": user["id"]},
            )
            assert (await schedules(db, workspace, user, "secret"))["meta"][
                "total"
            ] == 2
            with pytest.raises(ApiError) as denied:
                await create_schedule(
                    db, user, payload.model_copy(update={"requestKey": _cuid()})
                )
            assert denied.value.status_code == 403
            with pytest.raises(ApiError):
                await schedule_command(
                    db,
                    user,
                    workspace,
                    schedule["id"],
                    "run-now",
                    ScheduleCommand(
                        expectedVersion=schedule["version"], requestKey=_cuid()
                    ),
                )
            await db.rollback()
        # Loss of team membership prevents queued creation, and repeated failures pause the schedule.
        async with factory() as db:
            await db.execute(
                text("DELETE FROM team_members WHERE team_id=:team AND user_id=:actor"),
                {"team": team, "actor": user["id"]},
            )
            await db.execute(
                text("UPDATE recurring_schedules SET next_run_at=:due WHERE id=:id"),
                {"id": schedule["id"], "due": _utcnow() - timedelta(minutes=1)},
            )
            await db.commit()
        assert await process_schedule(factory)
        async with factory() as db:
            await db.execute(
                text("UPDATE recurring_schedules SET next_run_at=:due WHERE id=:id"),
                {"id": schedule["id"], "due": _utcnow() - timedelta(minutes=2)},
            )
            await db.commit()
        assert await process_schedule(factory)
        async with factory() as db:
            row = (
                (
                    await db.execute(
                        text(
                            "SELECT active,consecutive_failures FROM recurring_schedules WHERE id=:id"
                        ),
                        {"id": schedule["id"]},
                    )
                )
                .mappings()
                .one()
            )
            assert row["active"] is False and row["consecutive_failures"] == 3
            assert (await schedules(db, workspace, user, "secret"))["data"] == []
            with pytest.raises(ApiError):
                await run_history(db, workspace, user, "secret", schedule["id"])
    finally:
        async with factory() as db:
            if workspace:
                await db.execute(
                    text("DELETE FROM workspaces WHERE id=:id"), {"id": workspace}
                )
            await db.execute(
                text("DELETE FROM organizations WHERE owner_id=:id"), {"id": user["id"]}
            )
            await db.execute(text("DELETE FROM users WHERE id=:id"), {"id": user["id"]})
            await db.commit()
        await engine.dispose()
