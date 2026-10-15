from typing import Annotated, Literal
from fastapi import Depends, Query, Request
from ...core.downloads import private_download
from sqlalchemy import text
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from ...storage.minio import MinioStorage
from ..access.projects import _team_access, _workspace_access
from ..identity.password_reset import limit_request
from .contracts import CsvInput, ImportPreview, IssueExport, DocumentExport
from .csv_input import parse_csv
from .import_service import import_preview, import_result, import_command
from .exports import export_issues, export_documents
from ..audit.write import record_change

router = UtcAPIRouter(prefix="/api/v1/data-exchange", tags=["data-exchange"])


@router.get("/document-options")
async def document_options(
    workspaceId: str,
    after: Annotated[str, Query(max_length=100)] = "",
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _workspace_access(db, workspaceId, user["id"])
    rows = (
        (
            await db.execute(
                text("""SELECT d.id,d.title FROM documents d WHERE d.workspace_id=:workspace AND d.archived_at IS NULL AND d.id>:after
        AND (d.team_id IS NULL OR EXISTS(SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id
        WHERE t.id=d.team_id AND t.archived_at IS NULL AND tm.user_id=:actor)) ORDER BY d.id LIMIT 101"""),
                {"workspace": workspaceId, "actor": user["id"], "after": after},
            )
        )
        .mappings()
        .all()
    )
    return {
        "data": {
            "documents": [dict(row) for row in rows[:100]],
            "nextAfter": rows[99]["id"] if len(rows) > 100 else None,
        }
    }


@router.post("/csv/inspect")
async def inspect(
    payload: CsvInput, user=Depends(current_user), db=Depends(get_session)
):
    await _team_access(db, payload.workspaceId, payload.teamId, user["id"])
    headers, rows = parse_csv(payload.csv)
    return {"data": {"columns": headers, "rowCount": len(rows)}}


@router.post("/imports/preview")
async def preview(
    payload: ImportPreview,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await limit_request(
        db, request.app.state.settings.auth_jwt_secret, "issue-import", user["id"], 20
    )
    result = await import_preview(db, user, payload)
    await record_change(
        db,
        payload.workspaceId,
        user["id"],
        "issues.import_previewed",
        "workspace",
        payload.workspaceId,
    )
    await db.commit()
    return {"data": result}


@router.get("/imports")
async def history(
    workspaceId: str, user=Depends(current_user), db=Depends(get_session)
):
    await _workspace_access(db, workspaceId, user["id"])
    rows = (
        (
            await db.execute(
                text("""SELECT b.id,b.state,b.created_at AS "createdAt",b.source_key AS "sourceKey" FROM issue_import_batches b
        JOIN team_members tm ON tm.team_id=b.team_id AND tm.user_id=:actor
        JOIN teams t ON t.id=b.team_id AND t.archived_at IS NULL
        WHERE b.workspace_id=:workspace AND b.actor_id=:actor ORDER BY b.created_at DESC,b.id DESC LIMIT 20"""),
                {"actor": user["id"], "workspace": workspaceId},
            )
        )
        .mappings()
        .all()
    )
    return {"data": [dict(row) for row in rows]}


@router.get("/imports/{identifier}")
async def result(
    identifier: str,
    workspaceId: str,
    after: Annotated[int, Query(ge=0, le=1001)] = 0,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return {"data": await import_result(db, user, workspaceId, identifier, after=after)}


@router.post("/imports/{identifier}/{command}")
async def command(
    identifier: str,
    command: Literal["apply", "cancel"],
    workspaceId: str,
    user=Depends(current_user),
    db=Depends(get_session),
):
    result = await import_command(db, user, workspaceId, identifier, command)
    await record_change(
        db,
        workspaceId,
        user["id"],
        "issues.import_" + command,
        "workspace",
        workspaceId,
    )
    await db.commit()
    return {"data": result}


@router.post("/issues/export")
async def issues_export(
    payload: IssueExport,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await limit_request(
        db, request.app.state.settings.auth_jwt_secret, "data-export", user["id"], 20
    )
    content = await export_issues(db, user, payload)
    await record_change(
        db,
        payload.workspaceId,
        user["id"],
        "issues.exported",
        "workspace",
        payload.workspaceId,
    )
    await db.commit()
    return private_download(content, "text/csv", "flowie-issues.csv")


@router.post("/documents/export")
async def documents_export(
    payload: DocumentExport,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await limit_request(
        db, request.app.state.settings.auth_jwt_secret, "data-export", user["id"], 20
    )
    content = await export_documents(
        db, user, payload, MinioStorage(request.app.state.settings)
    )
    await record_change(
        db,
        payload.workspaceId,
        user["id"],
        "documents.exported",
        "workspace",
        payload.workspaceId,
    )
    await db.commit()
    return private_download(content, "application/zip", "flowie-documents.zip")
