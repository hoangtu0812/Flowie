import asyncio
from datetime import timedelta
import json

from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ..operations.heartbeats import progress
from ..work_items.contracts import CreateIssueInput
from ..work_items.issues import create_issue
from .calendar import next_occurrence
from .contracts import ScheduleRule
from .service import run_snapshot


async def process_schedule(factory, *, now=None):
    now = now or _utcnow()
    async with factory() as db:
        schedule = (
            (
                await db.execute(
                    text("""SELECT * FROM recurring_schedules s WHERE active=true AND
            (next_run_at<=:now OR EXISTS(SELECT 1 FROM recurring_runs r WHERE r.schedule_id=s.id AND r.state='QUEUED'))
            ORDER BY next_run_at,id FOR UPDATE SKIP LOCKED LIMIT 1"""),
                    {"now": now},
                )
            )
            .mappings()
            .first()
        )
        if not schedule:
            return False
        manual = (
            (
                await db.execute(
                    text(
                        "SELECT * FROM recurring_runs WHERE schedule_id=:id AND state='QUEUED' ORDER BY created_at,id FOR UPDATE LIMIT 1"
                    ),
                    {"id": schedule["id"]},
                )
            )
            .mappings()
            .first()
        )
        identifier = manual["id"] if manual else _cuid()
        snapshot = manual["snapshot"] if manual else run_snapshot(schedule)
        if not manual:
            inserted = (
                await db.execute(
                    text("""INSERT INTO recurring_runs(id,schedule_id,occurrence_key,scheduled_for,state,snapshot,created_at)
                VALUES (:id,:schedule,:key,:due,'QUEUED',CAST(:snapshot AS jsonb),:now) ON CONFLICT(schedule_id,occurrence_key) DO NOTHING RETURNING id"""),
                    {
                        "id": identifier,
                        "schedule": schedule["id"],
                        "key": "due:" + schedule["next_run_at"].isoformat(),
                        "due": schedule["next_run_at"],
                        "snapshot": json.dumps(snapshot),
                        "now": now,
                    },
                )
            ).scalar_one_or_none()
            if not inserted:
                await db.execute(
                    text(
                        "UPDATE recurring_schedules SET next_run_at=:next WHERE id=:id"
                    ),
                    {
                        "id": schedule["id"],
                        "next": next_occurrence(
                            ScheduleRule.model_validate(schedule["rule"]), now
                        ),
                    },
                )
                await db.commit()
                return True
        state, code, issue = "DONE", None, None
        try:
            async with db.begin_nested():
                user = (
                    (
                        await db.execute(
                            text(
                                "SELECT id,name,avatar_url AS \"avatarUrl\" FROM users WHERE id=:id AND status='ACTIVE'"
                            ),
                            {"id": schedule["created_by"]},
                        )
                    )
                    .mappings()
                    .first()
                )
                if not user:
                    raise ApiError(403, "Schedule creator is unavailable.", "Forbidden")
                values = {
                    **snapshot["template"],
                    "workspaceId": schedule["workspace_id"],
                    "teamId": schedule["team_id"],
                }
                if snapshot["dueAfterMinutes"] is not None:
                    values["dueDate"] = (
                        now + timedelta(minutes=snapshot["dueAfterMinutes"])
                    ).isoformat()
                issue = (
                    await create_issue(
                        CreateIssueInput.model_validate(values), dict(user), db
                    )
                )["data"]
        except ApiError as error:
            state, code = (
                "FAILED",
                {
                    403: "FORBIDDEN",
                    404: "REFERENCE_UNAVAILABLE",
                    400: "INVALID_INPUT",
                }.get(error.status_code, "FAILED"),
            )
        except Exception:
            state, code = "FAILED", "FAILED"
        await db.execute(
            text(
                "UPDATE recurring_runs SET state=:state,error_code=:code,issue_id=:issue WHERE id=:id"
            ),
            {
                "id": identifier,
                "state": state,
                "code": code,
                "issue": issue["id"] if state == "DONE" and issue else None,
            },
        )
        failures = schedule["consecutive_failures"] + 1 if state == "FAILED" else 0
        params = {
            "id": schedule["id"],
            "failures": failures,
            "active": failures < 3,
            "now": now,
            "next": next_occurrence(ScheduleRule.model_validate(schedule["rule"]), now)
            if not manual
            else schedule["next_run_at"],
        }
        await db.execute(
            text("""UPDATE recurring_schedules SET next_run_at=:next,consecutive_failures=:failures,active=:active,
            version=version+CASE WHEN active<>:active THEN 1 ELSE 0 END,updated_at=:now WHERE id=:id"""),
            params,
        )
        if failures >= 3:
            await db.execute(
                text(
                    "UPDATE recurring_runs SET state='CANCELED' WHERE schedule_id=:id AND state='QUEUED'"
                ),
                {"id": schedule["id"]},
            )
        await db.commit()
        return True


async def recurring_loop(factory, stop):
    while not stop.is_set():
        try:
            if await progress(factory, "recurring-issues", process_schedule(factory)):
                continue
        except Exception:
            pass
        try:
            await asyncio.wait_for(stop.wait(), 5)
        except TimeoutError:
            pass
