import asyncio
import json
from datetime import timedelta

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..operations.heartbeats import progress
from ..work_items.contracts import CreateIssueInput
from ..work_items.issues import create_issue
from .calendar import next_occurrence
from .commands import (
    PROCESS_SCHEDULE_INSERT_RECURRING_RUNS,
    PROCESS_SCHEDULE_UPDATE_RECURRING_RUNS,
    PROCESS_SCHEDULE_UPDATE_RECURRING_RUNS_2,
    PROCESS_SCHEDULE_UPDATE_RECURRING_SCHEDULES,
    PROCESS_SCHEDULE_UPDATE_RECURRING_SCHEDULES_2,
)
from .contracts import ScheduleRule
from .queries import (
    PROCESS_SCHEDULE_SELECT_RECURRING_RUNS,
    PROCESS_SCHEDULE_SELECT_RECURRING_SCHEDULES,
    PROCESS_SCHEDULE_SELECT_USERS,
)
from .service import run_snapshot


async def process_schedule(factory, *, now=None):
    now = now or utcnow()
    async with factory() as db:
        schedule = (
            (
                await db.execute(
                    PROCESS_SCHEDULE_SELECT_RECURRING_SCHEDULES,
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
                    PROCESS_SCHEDULE_SELECT_RECURRING_RUNS,
                    {"id": schedule["id"]},
                )
            )
            .mappings()
            .first()
        )
        identifier = manual["id"] if manual else cuid()
        snapshot = manual["snapshot"] if manual else run_snapshot(schedule)
        if not manual:
            inserted = (
                await db.execute(
                    PROCESS_SCHEDULE_INSERT_RECURRING_RUNS,
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
                    PROCESS_SCHEDULE_UPDATE_RECURRING_SCHEDULES_2,
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
                            PROCESS_SCHEDULE_SELECT_USERS,
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
            PROCESS_SCHEDULE_UPDATE_RECURRING_RUNS,
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
            PROCESS_SCHEDULE_UPDATE_RECURRING_SCHEDULES,
            params,
        )
        if failures >= 3:
            await db.execute(
                PROCESS_SCHEDULE_UPDATE_RECURRING_RUNS_2,
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
