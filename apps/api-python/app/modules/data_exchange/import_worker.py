import asyncio
from datetime import timedelta

from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ..operations.heartbeats import progress
from ..work_items.contracts import CreateIssueInput
from ..work_items.issues import create_issue
from ..access.projects import _team_access
from .import_service import duplicate_key


async def process_import_row(factory):
    async with factory() as db:
        await db.execute(
            text(
                "UPDATE issue_import_batches SET state='EXPIRED' WHERE state='PREVIEW' AND expires_at<=:now"
            ),
            {"now": _utcnow()},
        )
        await db.execute(
            text(
                "DELETE FROM issue_import_batches WHERE state NOT IN ('RUNNING','QUEUED') AND created_at<:old"
            ),
            {"old": _utcnow() - timedelta(days=30)},
        )
        batch = (
            (
                await db.execute(
                    text(
                        "SELECT * FROM issue_import_batches WHERE state IN ('QUEUED','RUNNING') ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1"
                    )
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
                    text(
                        "SELECT id,name,avatar_url AS \"avatarUrl\" FROM users WHERE id=:id AND status='ACTIVE'"
                    ),
                    {"id": batch["actor_id"]},
                )
            )
            .mappings()
            .first()
        )
        row = (
            (
                await db.execute(
                    text(
                        "SELECT * FROM issue_import_rows WHERE batch_id=:id AND state='PENDING' ORDER BY row_number LIMIT 1 FOR UPDATE"
                    ),
                    {"id": batch["id"]},
                )
            )
            .mappings()
            .first()
        )
        if not user or not row:
            await db.execute(
                text("UPDATE issue_import_batches SET state=:state WHERE id=:id"),
                {"id": batch["id"], "state": "DONE" if user else "FAILED"},
            )
            await db.commit()
            return True
        state, code, issue = "SUCCEEDED", None, None
        try:
            async with db.begin_nested():
                await _team_access(
                    db, batch["workspace_id"], batch["team_id"], user["id"]
                )
                # Serialize external keys across batches so creation and deduplication commit atomically.
                await db.execute(
                    text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
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
                        text(
                            "INSERT INTO issue_import_keys(workspace_id,source_key,external_id,issue_id) VALUES (:workspace,:source,:external,:issue)"
                        ),
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
            text(
                "UPDATE issue_import_rows SET state=:state,error_code=:code,issue_id=:issue,identifier=:identifier WHERE batch_id=:batch AND row_number=:number"
            ),
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
            text(
                "UPDATE issue_import_batches SET state=CASE WHEN EXISTS(SELECT 1 FROM issue_import_rows WHERE batch_id=:id AND state='PENDING') THEN 'RUNNING' ELSE 'DONE' END WHERE id=:id"
            ),
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
