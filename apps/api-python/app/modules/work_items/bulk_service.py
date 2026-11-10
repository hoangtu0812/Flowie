import json
from datetime import timedelta
from hashlib import sha256

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..access.projects import workspace_access
from .commands import (
    BULK_COMMAND_UPDATE_BULK_OPERATIONS,
    BULK_PREVIEW_INSERT_BULK_OPERATION_ITEMS,
    BULK_PREVIEW_INSERT_BULK_OPERATIONS,
    BULK_PREVIEW_LOCK,
)
from .issue_search import issue_scope
from .queries import (
    BULK_PREVIEW_SELECT_BULK_OPERATIONS,
    BULK_RESULT_SELECT_BULK_OPERATION_ITEMS,
    bulk_preview_select_sql,
    bulk_result_select_bulk_operations_sql,
    bulk_result_select_sql,
)


async def bulk_preview(db, user, payload):
    await workspace_access(db, payload.workspaceId, user["id"])
    fingerprint = sha256(
        json.dumps(payload.model_dump(mode="json"), sort_keys=True).encode()
    ).hexdigest()
    await db.execute(
        BULK_PREVIEW_LOCK,
        {"key": f"bulk:{user['id']}:{payload.requestKey}"},
    )
    previous = (
        (
            await db.execute(
                BULK_PREVIEW_SELECT_BULK_OPERATIONS,
                {"user": user["id"], "key": payload.requestKey},
            )
        )
        .mappings()
        .first()
    )
    if previous:
        if previous["fingerprint"] != fingerprint:
            raise ApiError(
                409, "This request key was used for different changes.", "Conflict"
            )
        return await bulk_result(db, user, payload.workspaceId, previous["id"])
    sql, params = issue_scope(payload.workspaceId, user["id"], payload.query.options())
    expected = (
        {item.id: item.version for item in payload.items}
        if payload.selection == "selected"
        else {}
    )
    if payload.selection == "selected":
        sql += " AND i.id=ANY(CAST(:ids AS text[]))"
        params["ids"] = list(expected)
    rows = (
        (
            await db.execute(
                bulk_preview_select_sql(sql),
                params,
            )
        )
        .mappings()
        .all()
    )
    if not rows:
        raise ApiError(400, "No accessible issues match this selection.", "Bad Request")
    if len(rows) > 1000:
        raise ApiError(
            400,
            "Narrow the filters to at most 1000 issues per operation.",
            "Bad Request",
        )
    identifier, now = cuid(), utcnow()
    await db.execute(
        BULK_PREVIEW_INSERT_BULK_OPERATIONS,
        {
            "id": identifier,
            "workspace": payload.workspaceId,
            "user": user["id"],
            "key": payload.requestKey,
            "fingerprint": fingerprint,
            "changes": json.dumps(payload.changes.model_dump(exclude_unset=True)),
            "now": now,
            "expires": now + timedelta(minutes=15),
        },
    )
    await db.execute(
        BULK_PREVIEW_INSERT_BULK_OPERATION_ITEMS,
        [
            {
                "operation": identifier,
                "id": r["id"],
                "version": expected.get(r["id"], r["version"]),
                "identifier": r["identifier"],
            }
            for r in rows
        ],
    )
    result = await bulk_result(db, user, payload.workspaceId, identifier)
    result["unavailableSelected"] = (
        len(expected) - len(rows) if payload.selection == "selected" else 0
    )
    return result


async def bulk_result(db, user, workspace, identifier, *, lock=False):
    await workspace_access(db, workspace, user["id"])
    row = (
        (
            await db.execute(
                bulk_result_select_bulk_operations_sql(lock),
                {"id": identifier, "workspace": workspace, "user": user["id"]},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(404, "Bulk operation not found.", "Not Found")
    counts = (
        (
            await db.execute(
                BULK_RESULT_SELECT_BULK_OPERATION_ITEMS,
                {"id": identifier},
            )
        )
        .mappings()
        .all()
    )
    scope, params = issue_scope(workspace, user["id"], {})
    scope = scope.replace(
        " WHERE ", " JOIN bulk_operation_items item ON item.issue_id=i.id WHERE ", 1
    )
    visible = (
        (
            await db.execute(
                bulk_result_select_sql(scope),
                {**params, "operation": identifier},
            )
        )
        .mappings()
        .all()
    )
    return {
        "id": row["id"],
        "state": row["state"],
        "expiresAt": row["expires_at"],
        "changes": row["changes"],
        "counts": {r["state"]: r["count"] for r in counts},
        "items": [dict(r) for r in visible],
    }


async def bulk_command(db, user, workspace, identifier, command):
    result = await bulk_result(db, user, workspace, identifier, lock=True)
    if command == "execute" and result["state"] == "PREVIEW":
        if result["expiresAt"] < utcnow():
            raise ApiError(410, "The preview expired. Create a new preview.", "Gone")
        state = "QUEUED"
    elif command == "cancel" and result["state"] in {"PREVIEW", "QUEUED", "RUNNING"}:
        state = "CANCELLED"
    else:
        return result
    await db.execute(
        BULK_COMMAND_UPDATE_BULK_OPERATIONS,
        {"state": state, "id": identifier},
    )
    result["state"] = state
    return result
