import asyncio
import json

from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ..operations.heartbeats import progress
from .issue_search import issue_scope
from .contracts import UpdateIssueInput
from .issues import update_issue


async def process_bulk_item(factory):
    async with factory() as db:
        operation = (
            (
                await db.execute(
                    text("""SELECT * FROM bulk_operations
            WHERE state IN ('QUEUED','RUNNING') ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1""")
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
                    text("""SELECT u.id,u.name,u.avatar_url AS "avatarUrl" FROM users u
            JOIN workspace_members wm ON wm.user_id=u.id WHERE u.id=:user AND wm.workspace_id=:workspace
            AND wm.status='ACTIVE' AND u.status='ACTIVE' """),
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
                text("UPDATE bulk_operations SET state='FAILED' WHERE id=:id"),
                {"id": operation["id"]},
            )
            await db.commit()
            return True
        item = (
            (
                await db.execute(
                    text(
                        "SELECT * FROM bulk_operation_items WHERE operation_id=:id AND state='PENDING' ORDER BY issue_id LIMIT 1 FOR UPDATE"
                    ),
                    {"id": operation["id"]},
                )
            )
            .mappings()
            .first()
        )
        if item is None:
            await db.execute(
                text("UPDATE bulk_operations SET state='DONE' WHERE id=:id"),
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
                            text(
                                "SELECT i.id,i.version,i.team_id "
                                + scope
                                + " AND i.id=:issue FOR UPDATE OF i"
                            ),
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
                                text(
                                    "SELECT 1 FROM cycles WHERE id=:cycle AND workspace_id=:workspace AND team_id=:team"
                                ),
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
                        text("DELETE FROM issue_cycles WHERE issue_id=:id"),
                        {"id": issue["id"]},
                    )
                    if cycle:
                        await db.execute(
                            text(
                                "INSERT INTO issue_cycles(issue_id,cycle_id) VALUES (:id,:cycle)"
                            ),
                            {"id": issue["id"], "cycle": cycle},
                        )
                    if len(changes) == 1:
                        await db.execute(
                            text("UPDATE issues SET updated_at=:now WHERE id=:id"),
                            {"now": _utcnow(), "id": issue["id"]},
                        )
                await db.execute(
                    text("""INSERT INTO activities(id,workspace_id,issue_id,actor_id,type,data,created_at)
                    VALUES (:id,:workspace,:issue,:user,'issue.bulk_changed',CAST(:data AS jsonb),:now)"""),
                    {
                        "id": _cuid(),
                        "workspace": operation["workspace_id"],
                        "issue": issue["id"],
                        "user": user["id"],
                        "data": json.dumps(
                            {"operationId": operation["id"], "fields": list(changes)}
                        ),
                        "now": _utcnow(),
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
            text(
                "UPDATE bulk_operation_items SET state=:state,error_code=:error WHERE operation_id=:operation AND issue_id=:issue"
            ),
            {
                "state": "FAILED" if code else "SUCCEEDED",
                "error": code,
                "operation": operation["id"],
                "issue": item["issue_id"],
            },
        )
        await db.execute(
            text("""UPDATE bulk_operations SET state=CASE WHEN EXISTS(
            SELECT 1 FROM bulk_operation_items WHERE operation_id=:id AND state='PENDING') THEN 'RUNNING' ELSE 'DONE' END WHERE id=:id"""),
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
