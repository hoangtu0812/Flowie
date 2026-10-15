from io import BytesIO
import json
import re
from zipfile import ZipFile, ZIP_DEFLATED

from sqlalchemy import text

from ...core.csv_export import csv_bytes
from ...core.errors import ApiError
from ..access.projects import _workspace_access
from ..work_items.issue_search import issue_scope
from ..work_items.document_repository import _team_access


async def export_issues(db, user, payload):
    await _workspace_access(db, payload.workspaceId, user["id"])
    scope, params = issue_scope(
        payload.workspaceId, user["id"], payload.query.options()
    )
    rows = (
        (
            await db.execute(
                text(
                    """SELECT i.id,i.identifier,i.title,i.description,i.issue_type,i.priority,i.severity,
        i.status_id,s.name AS status_name,i.team_id,i.project_id,i.assignee_id,i.start_date,i.target_date,i.due_date,i.created_at,i.updated_at """
                    + scope
                    + " ORDER BY i.created_at DESC,i.id DESC LIMIT 10001"
                ),
                params,
            )
        )
        .mappings()
        .all()
    )
    if len(rows) > 10000:
        raise ApiError(
            400, "Narrow the filters to at most 10000 issues.", "Bad Request"
        )
    columns = [
        "externalId",
        "identifier",
        "title",
        "description",
        "issueType",
        "priority",
        "severity",
        "statusId",
        "status",
        "teamId",
        "projectId",
        "assigneeId",
        "startDate",
        "targetDate",
        "dueDate",
        "createdAt",
        "updatedAt",
    ]
    fields = [
        "id",
        "identifier",
        "title",
        "description",
        "issue_type",
        "priority",
        "severity",
        "status_id",
        "status_name",
        "team_id",
        "project_id",
        "assignee_id",
        "start_date",
        "target_date",
        "due_date",
        "created_at",
        "updated_at",
    ]
    return csv_bytes(
        columns,
        [
            [
                row[field].isoformat()
                if hasattr(row[field], "isoformat")
                else row[field]
                for field in fields
            ]
            for row in rows
        ],
    )


async def export_documents(db, user, payload, storage):
    await _workspace_access(db, payload.workspaceId, user["id"])
    identifiers = list(dict.fromkeys(payload.documentIds))
    documents = (
        (
            await db.execute(
                text(
                    "SELECT id,title,content,team_id,source_type,source_url FROM documents WHERE workspace_id=:workspace AND id=ANY(CAST(:ids AS text[])) AND archived_at IS NULL ORDER BY id"
                ),
                {"workspace": payload.workspaceId, "ids": identifiers},
            )
        )
        .mappings()
        .all()
    )
    if len(documents) != len(identifiers):
        raise ApiError(404, "One or more documents are unavailable.", "Not Found")
    for document in documents:
        await _team_access(db, payload.workspaceId, document["team_id"], user["id"])
    attachments = []
    if payload.includeAttachments:
        attachments = (
            (
                await db.execute(
                    text(
                        "SELECT id,entity_id,filename,object_key,size FROM attachments WHERE workspace_id=:workspace AND entity_type='document' AND entity_id=ANY(CAST(:ids AS text[])) ORDER BY id LIMIT 201"
                    ),
                    {"workspace": payload.workspaceId, "ids": identifiers},
                )
            )
            .mappings()
            .all()
        )
    size = sum(len((row["content"] or "").encode("utf8")) for row in documents) + sum(
        row["size"] for row in attachments
    )
    if len(attachments) > 200 or size > 25 * 1024 * 1024:
        raise ApiError(
            400, "Export at most 200 attachments and 25 MB uncompressed.", "Bad Request"
        )
    output = BytesIO()
    manifest = {
        "documents": [],
        "attachments": [],
        "attachmentLinks": "Original authenticated links are preserved; packaged files are indexed by attachment ID. External source URLs are never fetched.",
    }
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for row in documents:
            # Paths use server IDs, never document titles or user-supplied filenames.
            path = f"documents/{row['id']}.md"
            archive.writestr(path, row["content"] or "")
            manifest["documents"].append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "path": path,
                    "sourceType": row["source_type"],
                    "sourceUrl": row["source_url"],
                }
            )
        for row in attachments:
            suffix = re.search(r"\.[A-Za-z0-9]{1,10}$", row["filename"])
            path = f"attachments/{row['id']}{suffix[0] if suffix else ''}"
            body = await storage.get(row["object_key"], maximum_bytes=row["size"])
            if len(body) != row["size"]:
                raise ApiError(
                    409, "An attachment changed. Retry the export.", "Conflict"
                )
            archive.writestr(path, body)
            manifest["attachments"].append(
                {
                    "id": row["id"],
                    "documentId": row["entity_id"],
                    "filename": row["filename"],
                    "path": path,
                }
            )
        archive.writestr(
            "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2)
        )
    return output.getvalue()
