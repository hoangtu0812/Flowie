import json
from datetime import timedelta
from hashlib import sha256

from pydantic import ValidationError
from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ..access.projects import _team_access
from ..work_items.contracts import CreateIssueInput
from ..work_items.issue_rules import _validate_references, _validate_schedule_dates
from ...core.dates import _date
from .csv_input import parse_csv, validate_mapping


async def duplicate_key(db, workspace, source, external):
    return (
        await db.execute(
            text(
                "SELECT 1 FROM issue_import_keys WHERE workspace_id=:workspace AND source_key=:source AND external_id=:external"
            ),
            {"workspace": workspace, "source": source, "external": external},
        )
    ).first() is not None


async def import_preview(db, user, payload):
    await _team_access(db, payload.workspaceId, payload.teamId, user["id"])
    headers, rows = parse_csv(payload.csv)
    validate_mapping(headers, payload.mapping)
    fingerprint = sha256(
        json.dumps(payload.model_dump(), sort_keys=True).encode()
    ).hexdigest()
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
        {"key": f"import:{user['id']}:{payload.requestKey}"},
    )
    previous = (
        (
            await db.execute(
                text(
                    "SELECT id,fingerprint FROM issue_import_batches WHERE actor_id=:actor AND request_key=:key"
                ),
                {"actor": user["id"], "key": payload.requestKey},
            )
        )
        .mappings()
        .first()
    )
    if previous:
        if previous["fingerprint"] != fingerprint:
            raise ApiError(
                409,
                "This request key was already used for different input.",
                "Conflict",
            )
        return await import_result(db, user, payload.workspaceId, previous["id"])
    batch, now = _cuid(), _utcnow()
    await db.execute(
        text("""INSERT INTO issue_import_batches(id,workspace_id,actor_id,team_id,source_key,request_key,fingerprint,duplicate_mode,created_at,expires_at)
        VALUES (:id,:workspace,:actor,:team,:source,:key,:fingerprint,:mode,:now,:expires)"""),
        {
            "id": batch,
            "workspace": payload.workspaceId,
            "actor": user["id"],
            "team": payload.teamId,
            "source": payload.sourceKey,
            "key": payload.requestKey,
            "fingerprint": fingerprint,
            "mode": payload.duplicateMode,
            "now": now,
            "expires": now + timedelta(minutes=15),
        },
    )
    seen = set()
    for number, row in enumerate(rows, 2):
        values = {
            field: row[column].strip()
            for field, column in payload.mapping.items()
            if row[column].strip()
        }
        external = values.pop("externalId", "")
        state, code = "PENDING", None
        try:
            if not external or len(external) > 200:
                raise ValueError("external")
            if external in seen or await duplicate_key(
                db, payload.workspaceId, payload.sourceKey, external
            ):
                state, code = (
                    ("SKIPPED", None)
                    if payload.duplicateMode == "skip"
                    else ("INVALID", "DUPLICATE")
                )
            seen.add(external)
            for field in ("priority", "issueType", "severity"):
                if field in values:
                    values[field] = values[field].upper()
            normalized = CreateIssueInput.model_validate(
                {**values, "workspaceId": payload.workspaceId, "teamId": payload.teamId}
            )
            values = normalized.model_dump(mode="json")
            if state == "PENDING":
                await _validate_references(
                    db, payload.workspaceId, payload.teamId, values, creating=True
                )
                _validate_schedule_dates(
                    _date(values.get("startDate")), _date(values.get("targetDate"))
                )
                _date(values.get("dueDate"))
        except ValidationError as error:
            state = "INVALID"
            code = (
                "INVALID_FIELDS:"
                + ",".join(
                    dict.fromkeys(str(item["loc"][0]) for item in error.errors())
                )[:200]
            )
        except (ValueError, ApiError):
            state, code = "INVALID", "INVALID_INPUT_OR_REFERENCE"
        await db.execute(
            text("""INSERT INTO issue_import_rows(batch_id,row_number,external_id,payload,state,error_code)
            VALUES (:batch,:number,:external,CAST(:payload AS jsonb),:state,:code)"""),
            {
                "batch": batch,
                "number": number,
                "external": external[:200] or None,
                "payload": json.dumps(values),
                "state": state,
                "code": code,
            },
        )
    return await import_result(db, user, payload.workspaceId, batch)


async def owned_batch(db, user, workspace, identifier, *, lock=False):
    batch = (
        (
            await db.execute(
                text(
                    "SELECT * FROM issue_import_batches WHERE id=:id AND workspace_id=:workspace AND actor_id=:actor"
                    + (" FOR UPDATE" if lock else "")
                ),
                {"id": identifier, "workspace": workspace, "actor": user["id"]},
            )
        )
        .mappings()
        .first()
    )
    if not batch:
        raise ApiError(404, "Import not found.", "Not Found")
    await _team_access(db, workspace, batch["team_id"], user["id"])
    return batch


async def import_result(db, user, workspace, identifier, *, after=0):
    batch = await owned_batch(db, user, workspace, identifier)
    counts = dict(
        (
            await db.execute(
                text(
                    "SELECT state,COUNT(*) FROM issue_import_rows WHERE batch_id=:id GROUP BY state"
                ),
                {"id": identifier},
            )
        ).all()
    )
    rows = (
        (
            await db.execute(
                text(
                    "SELECT row_number,external_id,payload,state,error_code,issue_id,identifier FROM issue_import_rows WHERE batch_id=:id AND row_number>:after ORDER BY row_number LIMIT 51"
                ),
                {"id": identifier, "after": after},
            )
        )
        .mappings()
        .all()
    )
    # Source content stays private to the importing account; previews expose only a bounded title.
    return {
        "id": identifier,
        "state": batch["state"],
        "expiresAt": batch["expires_at"],
        "counts": counts,
        "rows": [
            {
                "rowNumber": row["row_number"],
                "externalId": row["external_id"],
                "title": str(row["payload"].get("title", ""))[:500],
                "priority": row["payload"].get("priority"),
                "issueType": row["payload"].get("issueType"),
                "state": row["state"],
                "errorCode": row["error_code"],
                "issueId": row["issue_id"],
                "identifier": row["identifier"],
            }
            for row in rows[:50]
        ],
        "nextAfter": rows[49]["row_number"] if len(rows) > 50 else None,
    }


async def import_command(db, user, workspace, identifier, command):
    batch = await owned_batch(db, user, workspace, identifier, lock=True)
    if command == "apply" and batch["state"] == "PREVIEW":
        if batch["expires_at"] <= _utcnow():
            raise ApiError(409, "Preview expired. Create a new preview.", "Conflict")
        await db.execute(
            text("UPDATE issue_import_batches SET state='QUEUED' WHERE id=:id"),
            {"id": identifier},
        )
    elif command == "cancel" and batch["state"] in ("PREVIEW", "QUEUED", "RUNNING"):
        await db.execute(
            text("UPDATE issue_import_batches SET state='CANCELED' WHERE id=:id"),
            {"id": identifier},
        )
    return await import_result(db, user, workspace, identifier)
