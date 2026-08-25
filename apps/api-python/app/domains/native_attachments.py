from __future__ import annotations

from re import sub
from secrets import token_urlsafe
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from ..storage.minio import MinioStorage
from .auth import _cuid, _utcnow, current_user
from .native_projects import _team_access, _workspace_access


router = APIRouter(prefix='/api/v1/_native/attachments', tags=['native-attachments'])
# Storage authorization is entity-aware and already native. Expose this
# contract ahead of the attachment panel adapter without changing its UI.
public_router = APIRouter(prefix='/api/v1/attachments', tags=['attachments'])
EntityType = Literal['issue', 'comment', 'project', 'project-update', 'document']
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


async def _entity_team_id(db: AsyncSession, workspace_id: str, entity_type: EntityType, entity_id: str) -> str | None:
    queries = {
        'issue': 'SELECT team_id FROM issues WHERE id = :entity_id AND workspace_id = :workspace_id AND archived_at IS NULL',
        'comment': 'SELECT i.team_id FROM comments c JOIN issues i ON i.id = c.issue_id WHERE c.id = :entity_id AND i.workspace_id = :workspace_id AND c.deleted_at IS NULL AND i.archived_at IS NULL',
        'project': 'SELECT team_id FROM projects WHERE id = :entity_id AND workspace_id = :workspace_id AND archived_at IS NULL',
        'project-update': 'SELECT p.team_id FROM project_updates pu JOIN projects p ON p.id = pu.project_id WHERE pu.id = :entity_id AND pu.workspace_id = :workspace_id AND p.archived_at IS NULL',
        'document': 'SELECT team_id FROM documents WHERE id = :entity_id AND workspace_id = :workspace_id AND archived_at IS NULL',
    }
    result = await db.execute(text(queries[entity_type]), {'entity_id': entity_id, 'workspace_id': workspace_id})
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Attachment target not found.', 'Not Found')
    return row['team_id']


async def _authorize_entity(db: AsyncSession, workspace_id: str, entity_type: EntityType, entity_id: str, user_id: str) -> None:
    await _workspace_access(db, workspace_id, user_id)
    team_id = await _entity_team_id(db, workspace_id, entity_type, entity_id)
    if team_id:
        await _team_access(db, workspace_id, team_id, user_id)


def _present(row: Any) -> dict[str, Any]:
    return {'id': row['id'], 'workspaceId': row['workspace_id'], 'uploadedById': row['uploaded_by'], 'entityType': row['entity_type'], 'entityId': row['entity_id'], 'objectKey': row['object_key'], 'filename': row['filename'], 'mimeType': row['mime_type'], 'size': row['size'], 'createdAt': row['created_at']}


@router.get('')
@public_router.get('')
async def list_attachments(workspaceId: str = Query(min_length=1), entityType: EntityType = Query(), entityId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _authorize_entity(db, workspaceId, entityType, entityId, user['id'])
    result = await db.execute(text('SELECT * FROM attachments WHERE workspace_id = :workspace_id AND entity_type = :entity_type AND entity_id = :entity_id ORDER BY created_at DESC'), {'workspace_id': workspaceId, 'entity_type': entityType, 'entity_id': entityId})
    return {'data': [_present(row) for row in result.mappings().all()]}


@router.post('')
@public_router.post('')
async def create_attachment(request: Request, workspaceId: str = Form(), entityType: EntityType = Form(), entityId: str = Form(), file: UploadFile = File(), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _authorize_entity(db, workspaceId, entityType, entityId, user['id'])
    body = await file.read(MAX_ATTACHMENT_BYTES + 1)
    if not body:
        raise ApiError(400, 'A file is required.', 'Bad Request')
    if len(body) > MAX_ATTACHMENT_BYTES:
        raise ApiError(400, 'Files may not exceed 10 MB.', 'Bad Request')
    filename = sub(r'[^a-zA-Z0-9._-]', '_', file.filename or 'attachment')[:180] or 'attachment'
    object_key = f'{workspaceId}/{user["id"]}/{token_urlsafe(18)}-{filename}'
    storage = MinioStorage(request.app.state.settings)
    await storage.put(object_key, body, file.content_type or 'application/octet-stream')
    attachment_id = _cuid()
    await db.execute(text('''INSERT INTO attachments (id, workspace_id, uploaded_by, entity_type, entity_id, object_key, filename, mime_type, size, created_at) VALUES (:id, :workspace_id, :uploaded_by, :entity_type, :entity_id, :object_key, :filename, :mime_type, :size, :now)'''), {'id': attachment_id, 'workspace_id': workspaceId, 'uploaded_by': user['id'], 'entity_type': entityType, 'entity_id': entityId, 'object_key': object_key, 'filename': filename, 'mime_type': file.content_type or 'application/octet-stream', 'size': len(body), 'now': _utcnow()})
    await db.commit()
    result = await db.execute(text('SELECT * FROM attachments WHERE id = :id'), {'id': attachment_id})
    return {'data': _present(result.mappings().one())}


@router.get('/{attachment_id}/download')
@public_router.get('/{attachment_id}/download')
async def download_attachment(attachment_id: str, request: Request, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)):
    result = await db.execute(text('SELECT * FROM attachments WHERE id = :attachment_id'), {'attachment_id': attachment_id})
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Attachment not found.', 'Not Found')
    await _authorize_entity(db, row['workspace_id'], row['entity_type'], row['entity_id'], user['id'])
    body = await MinioStorage(request.app.state.settings).get(row['object_key'])
    safe_filename = row['filename'].replace('"', '')
    return Response(body, media_type=row['mime_type'], headers={'content-disposition': f'attachment; filename="{safe_filename}"'})
