import asyncio
from datetime import timedelta

from ...core.clock import utcnow
from ...core.errors import ApiError
from ..access.projects import team_access
from ..operations.heartbeats import progress
from ..work_items.contracts import CreateIssueInput
from ..work_items.issues import create_issue
from .commands import (
    PROCESS_IMPORT_ROW_DELETE_ISSUE_IMPORT_BATCHES,
    PROCESS_IMPORT_ROW_INSERT_ISSUE_IMPORT_KEYS,
    PROCESS_IMPORT_ROW_LOCK,
    PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_BATCHES,
    PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_BATCHES_2,
    PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_BATCHES_3,
    PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_ROWS,
)
from .import_service import duplicate_key
from .queries import (
    PROCESS_IMPORT_ROW_SELECT_ISSUE_IMPORT_BATCHES,
    PROCESS_IMPORT_ROW_SELECT_ISSUE_IMPORT_ROWS,
    PROCESS_IMPORT_ROW_SELECT_USERS,
)


async def process_import_row(factory):
    async with factory() as db:
        await db.execute(
            PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_BATCHES,
            {"now": utcnow()},
        )
        await db.execute(
            PROCESS_IMPORT_ROW_DELETE_ISSUE_IMPORT_BATCHES,
            {"old": utcnow() - timedelta(days=30)},
        )
        batch = (
            (
                await db.execute(
                    PROCESS_IMPORT_ROW_SELECT_ISSUE_IMPORT_BATCHES
                )
            )
            .mappings()
            .first()
        )
        if not batch:
            await db.commit()
            return False
        user = (
            (
                await db.execute(
                    PROCESS_IMPORT_ROW_SELECT_USERS,
                    {"id": batch["actor_id"]},
                )
            )
            .mappings()
            .first()
        )
        row = (
            (
                await db.execute(
                    PROCESS_IMPORT_ROW_SELECT_ISSUE_IMPORT_ROWS,
                    {"id": batch["id"]},
                )
            )
            .mappings()
            .first()
        )
        if not user or not row:
            await db.execute(
                PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_BATCHES_3,
                {"id": batch["id"], "state": "DONE" if user else "FAILED"},
            )
            await db.commit()
            return True
        state, code, issue = "SUCCEEDED", None, None
        try:
            async with db.begin_nested():
                await team_access(
                    db, batch["workspace_id"], batch["team_id"], user["id"]
                )
                # Serialize external keys across batches so creation and deduplication commit atomically.
                await db.execute(
                    PROCESS_IMPORT_ROW_LOCK,
                    {
                        "key": f"import-key:{batch['workspace_id']}:{batch['source_key']}:{row['external_id']}"
                    },
                )
                if await duplicate_key(
                    db, batch["workspace_id"], batch["source_key"], row["external_id"]
                ):
                    state, code = (
                        ("SKIPPED", None)
                        if batch["duplicate_mode"] == "skip"
                        else ("FAILED", "DUPLICATE")
                    )
                else:
                    result = await create_issue(
                        CreateIssueInput.model_validate(row["payload"]), dict(user), db
                    )
                    issue = result["data"]
                    await db.execute(
                        PROCESS_IMPORT_ROW_INSERT_ISSUE_IMPORT_KEYS,
                        {
                            "workspace": batch["workspace_id"],
                            "source": batch["source_key"],
                            "external": row["external_id"],
                            "issue": issue["id"],
                        },
                    )
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
            PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_ROWS,
            {
                "state": state,
                "code": code,
                "issue": issue["id"] if state == "SUCCEEDED" and issue else None,
                "identifier": issue["identifier"]
                if state == "SUCCEEDED" and issue
                else None,
                "batch": batch["id"],
                "number": row["row_number"],
            },
        )
        await db.execute(
            PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_BATCHES_2,
            {"id": batch["id"]},
        )
        await db.commit()
        return True


async def import_loop(factory, stop):
    while not stop.is_set():
        try:
            if await progress(factory, "issue-import", process_import_row(factory)):
                continue
        except Exception:
            pass
        try:
            await asyncio.wait_for(stop.wait(), 2)
        except TimeoutError:
            pass
