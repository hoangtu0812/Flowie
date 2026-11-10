import asyncio
import json

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..operations.heartbeats import progress
from .commands import (
    PROCESS_BULK_ITEM_DELETE_ISSUE_CYCLES,
    PROCESS_BULK_ITEM_INSERT_ACTIVITIES,
    PROCESS_BULK_ITEM_INSERT_ISSUE_CYCLES,
    PROCESS_BULK_ITEM_UPDATE_BULK_OPERATION_ITEMS,
    PROCESS_BULK_ITEM_UPDATE_BULK_OPERATIONS,
    PROCESS_BULK_ITEM_UPDATE_BULK_OPERATIONS_2,
    PROCESS_BULK_ITEM_UPDATE_BULK_OPERATIONS_3,
    PROCESS_BULK_ITEM_UPDATE_ISSUES,
)
from .contracts import UpdateIssueInput
from .issue_search import issue_scope
from .issues import update_issue
from .queries import (
    PROCESS_BULK_ITEM_SELECT_BULK_OPERATION_ITEMS,
    PROCESS_BULK_ITEM_SELECT_BULK_OPERATIONS,
    PROCESS_BULK_ITEM_SELECT_CYCLES,
    PROCESS_BULK_ITEM_SELECT_USERS,
    process_bulk_item_select_sql,
)


async def process_bulk_item(factory):
    async with factory() as db:
        operation = (
            (
                await db.execute(
                    PROCESS_BULK_ITEM_SELECT_BULK_OPERATIONS
                )
            )
            .mappings()
            .first()
        )
        if not operation:
            return False
        user = (
            (
                await db.execute(
                    PROCESS_BULK_ITEM_SELECT_USERS,
                    {
                        "user": operation["actor_id"],
                        "workspace": operation["workspace_id"],
                    },
                )
            )
            .mappings()
            .first()
        )
        if not user:
            await db.execute(
                PROCESS_BULK_ITEM_UPDATE_BULK_OPERATIONS_2,
                {"id": operation["id"]},
            )
            await db.commit()
            return True
        item = (
            (
                await db.execute(
                    PROCESS_BULK_ITEM_SELECT_BULK_OPERATION_ITEMS,
                    {"id": operation["id"]},
                )
            )
            .mappings()
            .first()
        )
        if item is None:
            await db.execute(
                PROCESS_BULK_ITEM_UPDATE_BULK_OPERATIONS_3,
                {"id": operation["id"]},
            )
            await db.commit()
            return True
        code = None
        try:
            async with db.begin_nested():
                scope, params = issue_scope(operation["workspace_id"], user["id"], {})
                issue = (
                    (
                        await db.execute(
                            process_bulk_item_select_sql(scope),
                            {**params, "issue": item["issue_id"]},
                        )
                    )
                    .mappings()
                    .first()
                )
                if not issue:
                    raise ApiError(403, "Issue unavailable.", "Forbidden")
                if issue["version"] != item["expected_version"]:
                    raise ApiError(409, "Issue changed since preview.", "Conflict")
                changes = operation["changes"]
                payload = UpdateIssueInput.model_validate(
                    {k: v for k, v in changes.items() if k != "cycleId"}
                )
                await update_issue(
                    issue["id"], payload, operation["workspace_id"], dict(user), db
                )
                if "cycleId" in changes:
                    cycle = changes["cycleId"]
                    if (
                        cycle
                        and not (
                            await db.execute(
                                PROCESS_BULK_ITEM_SELECT_CYCLES,
                                {
                                    "cycle": cycle,
                                    "workspace": operation["workspace_id"],
                                    "team": issue["team_id"],
                                },
                            )
                        ).first()
                    ):
                        raise ApiError(
                            400, "Cycle does not match the issue team.", "Bad Request"
                        )
                    await db.execute(
                        PROCESS_BULK_ITEM_DELETE_ISSUE_CYCLES,
                        {"id": issue["id"]},
                    )
                    if cycle:
                        await db.execute(
                            PROCESS_BULK_ITEM_INSERT_ISSUE_CYCLES,
                            {"id": issue["id"], "cycle": cycle},
                        )
                    if len(changes) == 1:
                        await db.execute(
                            PROCESS_BULK_ITEM_UPDATE_ISSUES,
                            {"now": utcnow(), "id": issue["id"]},
                        )
                await db.execute(
                    PROCESS_BULK_ITEM_INSERT_ACTIVITIES,
                    {
                        "id": cuid(),
                        "workspace": operation["workspace_id"],
                        "issue": issue["id"],
                        "user": user["id"],
                        "data": json.dumps(
                            {"operationId": operation["id"], "fields": list(changes)}
                        ),
                        "now": utcnow(),
                    },
                )
        except ApiError as error:
            code = {
                403: "FORBIDDEN",
                404: "UNAVAILABLE",
                409: "CONFLICT",
                400: "INVALID",
            }.get(error.status_code, "FAILED")
        except Exception:
            code = "FAILED"
        await db.execute(
            PROCESS_BULK_ITEM_UPDATE_BULK_OPERATION_ITEMS,
            {
                "state": "FAILED" if code else "SUCCEEDED",
                "error": code,
                "operation": operation["id"],
                "issue": item["issue_id"],
            },
        )
        await db.execute(
            PROCESS_BULK_ITEM_UPDATE_BULK_OPERATIONS,
            {"id": operation["id"]},
        )
        await db.commit()
        return True


async def bulk_loop(factory, stop):
    while not stop.is_set():
        try:
            if await progress(factory, "bulk-issues", process_bulk_item(factory)):
                continue
        except Exception:
            pass
        try:
            await asyncio.wait_for(stop.wait(), 2)
        except TimeoutError:
            pass
