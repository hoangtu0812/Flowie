import json
from datetime import timedelta
from hashlib import sha256

from pydantic import ValidationError

from ...core.clock import utcnow
from ...core.dates import parse_date
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..access.projects import team_access
from ..work_items.contracts import CreateIssueInput
from ..work_items.issue_rules import validate_references, validate_schedule_dates
from .commands import (
    IMPORT_COMMAND_UPDATE_ISSUE_IMPORT_BATCHES,
    IMPORT_COMMAND_UPDATE_ISSUE_IMPORT_BATCHES_2,
    IMPORT_PREVIEW_INSERT_ISSUE_IMPORT_BATCHES,
    IMPORT_PREVIEW_INSERT_ISSUE_IMPORT_ROWS,
    IMPORT_PREVIEW_LOCK,
)
from .csv_input import parse_csv, validate_mapping
from .queries import (
    DUPLICATE_KEY_SELECT_ISSUE_IMPORT_KEYS,
    IMPORT_PREVIEW_SELECT_ISSUE_IMPORT_BATCHES,
    IMPORT_RESULT_SELECT_ISSUE_IMPORT_ROWS,
    IMPORT_RESULT_SELECT_ISSUE_IMPORT_ROWS_2,
    owned_batch_select_issue_import_batches_sql,
)


async def duplicate_key(db, workspace, source, external):
    return (
        await db.execute(
            DUPLICATE_KEY_SELECT_ISSUE_IMPORT_KEYS,
            {"workspace": workspace, "source": source, "external": external},
        )
    ).first() is not None


async def import_preview(db, user, payload):
    await team_access(db, payload.workspaceId, payload.teamId, user["id"])
    headers, rows = parse_csv(payload.csv)
    validate_mapping(headers, payload.mapping)
    fingerprint = sha256(
        json.dumps(payload.model_dump(), sort_keys=True).encode()
    ).hexdigest()
    await db.execute(
        IMPORT_PREVIEW_LOCK,
        {"key": f"import:{user['id']}:{payload.requestKey}"},
    )
    previous = (
        (
            await db.execute(
                IMPORT_PREVIEW_SELECT_ISSUE_IMPORT_BATCHES,
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
    batch, now = cuid(), utcnow()
    await db.execute(
        IMPORT_PREVIEW_INSERT_ISSUE_IMPORT_BATCHES,
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
                await validate_references(
                    db, payload.workspaceId, payload.teamId, values, creating=True
                )
                validate_schedule_dates(
                    parse_date(values.get("startDate")), parse_date(values.get("targetDate"))
                )
                parse_date(values.get("dueDate"))
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
            IMPORT_PREVIEW_INSERT_ISSUE_IMPORT_ROWS,
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
                owned_batch_select_issue_import_batches_sql(lock),
                {"id": identifier, "workspace": workspace, "actor": user["id"]},
            )
        )
        .mappings()
        .first()
    )
    if not batch:
        raise ApiError(404, "Import not found.", "Not Found")
    await team_access(db, workspace, batch["team_id"], user["id"])
    return batch


async def import_result(db, user, workspace, identifier, *, after=0):
    batch = await owned_batch(db, user, workspace, identifier)
    counts = dict(
        (
            await db.execute(
                IMPORT_RESULT_SELECT_ISSUE_IMPORT_ROWS,
                {"id": identifier},
            )
        ).all()
    )
    rows = (
        (
            await db.execute(
                IMPORT_RESULT_SELECT_ISSUE_IMPORT_ROWS_2,
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
        if batch["expires_at"] <= utcnow():
            raise ApiError(409, "Preview expired. Create a new preview.", "Conflict")
        await db.execute(
            IMPORT_COMMAND_UPDATE_ISSUE_IMPORT_BATCHES,
            {"id": identifier},
        )
    elif command == "cancel" and batch["state"] in ("PREVIEW", "QUEUED", "RUNNING"):
        await db.execute(
            IMPORT_COMMAND_UPDATE_ISSUE_IMPORT_BATCHES_2,
            {"id": identifier},
        )
    return await import_result(db, user, workspace, identifier)
