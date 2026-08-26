from __future__ import annotations

from typing import Any, Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .teams import _workspace_role


router = APIRouter(prefix='/api/v1/documents', tags=['documents'])


class CreateFolderInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    teamId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=100)
    icon: str | None = Field(default=None, min_length=1, max_length=32)


class UpdateFolderInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    icon: str | None = Field(default=None, min_length=1, max_length=32)
    position: int | None = Field(default=None, ge=0)


class CreateDocumentInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    teamId: str | None = None
    folderId: str | None = None
    title: str = Field(min_length=2, max_length=250)
    content: str = Field(default='', max_length=100000)
    icon: str | None = Field(default=None, min_length=1, max_length=32)
    sourceType: Literal['flowie', 'upload', 'link'] = 'flowie'
    sourceUrl: str | None = Field(default=None, max_length=2048)
    pinned: bool = False
    position: int | None = Field(default=None, ge=0)


class UpdateDocumentInput(BaseModel):
    folderId: str | None = None
    title: str | None = Field(default=None, min_length=2, max_length=250)
    content: str | None = Field(default=None, max_length=100000)
    icon: str | None = Field(default=None, min_length=1, max_length=32)
    sourceType: Literal['flowie', 'upload', 'link'] | None = None
    sourceUrl: str | None = Field(default=None, max_length=2048)
    pinned: bool | None = None
    position: int | None = Field(default=None, ge=0)


async def _team_access(db: AsyncSession, workspace_id: str, team_id: str | None, user_id: str) -> None:
    await _workspace_role(db, workspace_id, user_id)
    if not team_id:
        return
    member = await db.execute(
        text('''SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id
                WHERE t.id = :team_id AND t.workspace_id = :workspace_id
                  AND t.archived_at IS NULL AND tm.user_id = :user_id'''),
        {'team_id': team_id, 'workspace_id': workspace_id, 'user_id': user_id},
    )
    if member.scalar_one_or_none() is None:
        raise ApiError(403, 'You do not have access to this team.', 'Forbidden')


def _document(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'teamId': row['team_id'],
        'folderId': row['folder_id'], 'title': row['title'], 'content': row['content'],
        'icon': row['icon'], 'sourceType': row['source_type'], 'sourceUrl': row['source_url'],
        'sourceAttachment': ({
            'id': row['source_attachment_id'], 'filename': row['source_attachment_filename'],
            'mimeType': row['source_attachment_mime_type'], 'size': row['source_attachment_size'],
        } if row['source_attachment_id'] else None),
        'pinned': row['pinned'], 'position': row['position'],
        'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'createdBy': {'id': row['created_by_id'], 'name': row['created_by_name'], 'avatarUrl': row['created_by_avatar_url']},
        'updatedBy': {'id': row['updated_by_id'], 'name': row['updated_by_name'], 'avatarUrl': row['updated_by_avatar_url']},
    }


async def _documents(db: AsyncSession, workspace_id: str, team_id: str | None = None, folder_id: str | None = None) -> list[dict[str, Any]]:
    filters = ['d.workspace_id = :workspace_id', 'd.archived_at IS NULL']
    params: dict[str, Any] = {'workspace_id': workspace_id}
    if team_id:
        filters.append('d.team_id = :team_id')
        params['team_id'] = team_id
    if folder_id:
        filters.append('d.folder_id = :folder_id')
        params['folder_id'] = folder_id
    result = await db.execute(
        text(f'''SELECT d.*, creator.id AS created_by_id, creator.name AS created_by_name,
                        creator.avatar_url AS created_by_avatar_url, updater.id AS updated_by_id,
                        updater.name AS updated_by_name, updater.avatar_url AS updated_by_avatar_url,
                        source_attachment.id AS source_attachment_id,
                        source_attachment.filename AS source_attachment_filename,
                        source_attachment.mime_type AS source_attachment_mime_type,
                        source_attachment.size AS source_attachment_size
                 FROM documents d
                 JOIN users creator ON creator.id = d.created_by
                 JOIN users updater ON updater.id = d.updated_by
                 LEFT JOIN LATERAL (
                    SELECT id, filename, mime_type, size FROM attachments
                    WHERE workspace_id = d.workspace_id AND entity_type = 'document' AND entity_id = d.id
                    ORDER BY created_at ASC LIMIT 1
                 ) source_attachment ON TRUE
                 WHERE {' AND '.join(filters)}
                 ORDER BY d.position ASC, d.created_at ASC, d.id ASC'''),
        params,
    )
    return [_document(row) for row in result.mappings().all()]


async def _document_by_id(db: AsyncSession, document_id: str, workspace_id: str) -> dict[str, Any] | None:
    rows = await _documents(db, workspace_id)
    return next((document for document in rows if document['id'] == document_id), None)


async def _folder(db: AsyncSession, folder_id: str, workspace_id: str) -> Any:
    result = await db.execute(
        text('SELECT * FROM document_folders WHERE id = :id AND workspace_id = :workspace_id'),
        {'id': folder_id, 'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Document folder not found.', 'Not Found')
    return row


async def _resolve_folder(db: AsyncSession, workspace_id: str, team_id: str | None, folder_id: str | None) -> Any | None:
    if not team_id:
        if folder_id:
            raise ApiError(400, 'Workspace documents cannot use a team folder.', 'Bad Request')
        return None
    if folder_id:
        folder = await _folder(db, folder_id, workspace_id)
        if folder['team_id'] != team_id:
            raise ApiError(400, 'Document folder belongs to another team.', 'Bad Request')
        return folder
    result = await db.execute(
        text('''SELECT * FROM document_folders WHERE workspace_id = :workspace_id AND team_id = :team_id
                ORDER BY position ASC, created_at ASC, id ASC LIMIT 1'''),
        {'workspace_id': workspace_id, 'team_id': team_id},
    )
    folder = result.mappings().first()
    if not folder:
        raise ApiError(404, 'Document folder not found.', 'Not Found')
    return folder


def _source_url(source_type: str, source_url: str | None) -> str | None:
    value = source_url.strip() if source_url else None
    if source_type == 'link':
        if not value or urlparse(value).scheme not in {'http', 'https'}:
            raise ApiError(400, 'A valid HTTP(S) link is required.', 'Bad Request')
    elif value:
        raise ApiError(400, 'Only linked documents may include a source URL.', 'Bad Request')
    return value


@router.get('')
async def list_documents(workspaceId: str = Query(min_length=1), teamId: str | None = None, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _team_access(db, workspaceId, teamId, user['id'])
    return {'data': await _documents(db, workspaceId, teamId)}


@router.get('/folders')
async def list_folders(workspaceId: str = Query(min_length=1), teamId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _team_access(db, workspaceId, teamId, user['id'])
    result = await db.execute(
        text('''SELECT * FROM document_folders WHERE workspace_id = :workspace_id AND team_id = :team_id
                ORDER BY position ASC, name ASC, id ASC'''),
        {'workspace_id': workspaceId, 'team_id': teamId},
    )
    return {'data': [
        {'id': row['id'], 'name': row['name'], 'icon': row['icon'], 'position': row['position'],
         'documents': await _documents(db, workspaceId, teamId, row['id'])}
        for row in result.mappings().all()
    ]}


@router.post('/folders')
async def create_folder(payload: CreateFolderInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _team_access(db, payload.workspaceId, payload.teamId, user['id'])
    position = (await db.execute(text('SELECT COALESCE(MAX(position), -1) + 1 FROM document_folders WHERE workspace_id = :workspace_id AND team_id = :team_id'), {'workspace_id': payload.workspaceId, 'team_id': payload.teamId})).scalar_one()
    now, folder_id = _utcnow(), _cuid()
    try:
        await db.execute(text('''INSERT INTO document_folders (id, workspace_id, team_id, name, icon, position, created_at, updated_at)
                                VALUES (:id, :workspace_id, :team_id, :name, :icon, :position, :now, :now)'''), {'id': folder_id, 'workspace_id': payload.workspaceId, 'team_id': payload.teamId, 'name': payload.name.strip(), 'icon': payload.icon or '📁', 'position': position, 'now': now})
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A document folder with this name already exists.', 'Conflict') from error
    return {'data': {'id': folder_id, 'name': payload.name.strip(), 'icon': payload.icon or '📁', 'position': position, 'documents': []}}


@router.patch('/folders/{folder_id}')
async def update_folder(folder_id: str, payload: UpdateFolderInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    folder = await _folder(db, folder_id, workspaceId)
    await _team_access(db, workspaceId, folder['team_id'], user['id'])
    values = payload.model_dump(exclude_unset=True)
    if values:
        values['now'] = _utcnow()
        values['id'] = folder_id
        sets = ', '.join(f"{('name' if key == 'name' else key)} = :{key}" for key in values if key not in {'id', 'now'})
        await db.execute(text(f'UPDATE document_folders SET {sets}, updated_at = :now WHERE id = :id'), {**values, 'name': values.get('name', '').strip() if 'name' in values else None})
        await db.commit()
    updated = await _folder(db, folder_id, workspaceId)
    return {'data': {'id': updated['id'], 'name': updated['name'], 'icon': updated['icon'], 'position': updated['position']}}


@router.post('')
async def create_document(payload: CreateDocumentInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _team_access(db, payload.workspaceId, payload.teamId, user['id'])
    folder = await _resolve_folder(db, payload.workspaceId, payload.teamId, payload.folderId)
    position = payload.position
    if position is None and folder:
        position = (await db.execute(text('SELECT COALESCE(MAX(position), -1) + 1 FROM documents WHERE folder_id = :folder_id'), {'folder_id': folder['id']})).scalar_one()
    document_id, now = _cuid(), _utcnow()
    await db.execute(text('''INSERT INTO documents (id, workspace_id, team_id, folder_id, title, content, icon, source_type, source_url, pinned, position, created_by, updated_by, created_at, updated_at)
                            VALUES (:id, :workspace_id, :team_id, :folder_id, :title, :content, :icon, :source_type, :source_url, :pinned, :position, :user_id, :user_id, :now, :now)'''), {'id': document_id, 'workspace_id': payload.workspaceId, 'team_id': payload.teamId, 'folder_id': folder['id'] if folder else None, 'title': payload.title.strip(), 'content': payload.content, 'icon': payload.icon or '📄', 'source_type': payload.sourceType, 'source_url': _source_url(payload.sourceType, payload.sourceUrl), 'pinned': payload.pinned, 'position': position or 0, 'user_id': user['id'], 'now': now})
    await db.commit()
    document = await _document_by_id(db, document_id, payload.workspaceId)
    if not document:
        raise ApiError(500, 'Document could not be loaded after creation.', 'Internal Server Error')
    return {'data': document}


@router.patch('/{document_id}')
async def update_document(document_id: str, payload: UpdateDocumentInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    current = (await db.execute(text('SELECT * FROM documents WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL'), {'id': document_id, 'workspace_id': workspaceId})).mappings().first()
    if not current:
        raise ApiError(404, 'Document not found.', 'Not Found')
    await _team_access(db, workspaceId, current['team_id'], user['id'])
    values = payload.model_dump(exclude_unset=True)
    folder = await _resolve_folder(db, workspaceId, current['team_id'], values['folderId']) if 'folderId' in values and values['folderId'] else None
    columns = {'folderId': 'folder_id', 'title': 'title', 'content': 'content', 'icon': 'icon', 'sourceType': 'source_type', 'sourceUrl': 'source_url', 'pinned': 'pinned', 'position': 'position'}
    if values:
        source_type = values.get('sourceType', current['source_type'])
        if 'sourceType' in values or 'sourceUrl' in values:
            values['sourceUrl'] = _source_url(
                source_type,
                values.get('sourceUrl', current['source_url'] if source_type == 'link' else None),
            )
        params = {'id': document_id, 'updated_by': user['id'], 'now': _utcnow()}
        sets = []
        for field, column in columns.items():
            if field in values:
                params[field] = folder['id'] if field == 'folderId' and folder else values[field]
                sets.append(f'{column} = :{field}')
        if 'title' in params:
            params['title'] = str(params['title']).strip()
        await db.execute(text(f"UPDATE documents SET {', '.join(sets)}, updated_by = :updated_by, updated_at = :now WHERE id = :id"), params)
        await db.commit()
    document = await _document_by_id(db, document_id, workspaceId)
    if not document:
        raise ApiError(404, 'Document not found.', 'Not Found')
    return {'data': document}


@router.delete('/{document_id}')
async def archive_document(document_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    current = (await db.execute(text('SELECT team_id FROM documents WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL'), {'id': document_id, 'workspace_id': workspaceId})).mappings().first()
    if not current:
        raise ApiError(404, 'Document not found.', 'Not Found')
    await _team_access(db, workspaceId, current['team_id'], user['id'])
    await db.execute(text('UPDATE documents SET archived_at = :now, updated_at = :now WHERE id = :id'), {'id': document_id, 'now': _utcnow()})
    await db.commit()
    return {'data': {'id': document_id, 'archived': True}}
