import json
from datetime import timedelta
from hashlib import sha256

from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ..access.projects import _workspace_access
from .issue_search import issue_scope


async def bulk_preview(db, user, payload):
    await _workspace_access(db, payload.workspaceId, user["id"])
    fingerprint = sha256(
        json.dumps(payload.model_dump(mode="json"), sort_keys=True).encode()
    ).hexdigest()
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
        {"key": f"bulk:{user['id']}:{payload.requestKey}"},
    )
    previous = (
        (
            await db.execute(
                text(
                    "SELECT id,fingerprint FROM bulk_operations WHERE actor_id=:user AND request_key=:key"
                ),
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
                text(
                    "SELECT i.id,i.identifier,i.version "
                    + sql
                    + " ORDER BY i.id LIMIT 1001"
                ),
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
    identifier, now = _cuid(), _utcnow()
    await db.execute(
        text("""INSERT INTO bulk_operations(id,workspace_id,actor_id,request_key,fingerprint,changes,created_at,expires_at)
        VALUES (:id,:workspace,:user,:key,:fingerprint,CAST(:changes AS jsonb),:now,:expires)"""),
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
        text("""INSERT INTO bulk_operation_items(operation_id,issue_id,expected_version,identifier)
        VALUES (:operation,:id,:version,:identifier)"""),
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
    await _workspace_access(db, workspace, user["id"])
    row = (
        (
            await db.execute(
                text(
                    "SELECT * FROM bulk_operations WHERE id=:id AND workspace_id=:workspace AND actor_id=:user"
                    + (" FOR UPDATE" if lock else "")
                ),
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
                text(
                    "SELECT state,COUNT(*) AS count FROM bulk_operation_items WHERE operation_id=:id GROUP BY state"
                ),
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
                text(
                    """SELECT item.issue_id,item.identifier,item.expected_version,item.state,item.error_code,
        (item.state='PENDING' AND i.version<>item.expected_version) AS stale """
                    + scope
                    + """
        AND item.operation_id=:operation ORDER BY item.issue_id LIMIT 1000"""
                ),
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
        if result["expiresAt"] < _utcnow():
            raise ApiError(410, "The preview expired. Create a new preview.", "Gone")
        state = "QUEUED"
    elif command == "cancel" and result["state"] in {"PREVIEW", "QUEUED", "RUNNING"}:
        state = "CANCELLED"
    else:
        return result
    await db.execute(
        text("UPDATE bulk_operations SET state=:state WHERE id=:id"),
        {"state": state, "id": identifier},
    )
    result["state"] = state
    return result
