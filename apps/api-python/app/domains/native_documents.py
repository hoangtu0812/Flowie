from __future__ import annotations

from ..modules.work_items.document_repository import _team_access as _team_access, _document as _document, _documents as _documents, _document_by_id as _document_by_id, _folder as _folder, _resolve_folder as _resolve_folder, _source_url as _source_url

from typing import Any, Literal
from urllib.parse import urlparse

from fastapi import Depends, Query
from ..core.utc_responses import UtcAPIRouter as APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..modules.work_items.contracts import CreateDocumentInput, UpdateDocumentInput
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




















@router.get('')
async def list_documents(workspaceId: str = Query(min_length=1), teamId: str | None = None, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _team_access(db, workspaceId, teamId, user['id'])
    return {'data': await _documents(db, workspaceId, teamId, user_id=user['id'])}


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
    from ..modules.work_items.documents import create_document as operation
    from ..db.mutations import commit_mutation

    return await commit_mutation(db, lambda: operation(payload=payload, user=user, db=db))


@router.patch('/{document_id}')
async def update_document(document_id: str, payload: UpdateDocumentInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    from ..modules.work_items.documents import update_document as operation
    from ..db.mutations import commit_mutation

    return await commit_mutation(db, lambda: operation(document_id=document_id, payload=payload, workspaceId=workspaceId, user=user, db=db))


@router.delete('/{document_id}')
async def archive_document(document_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    from ..modules.work_items.documents import archive_document as operation
    from ..db.mutations import commit_mutation

    return await commit_mutation(db,lambda:operation(document_id,workspaceId,user,db))


class RestoreDocumentInput(BaseModel):
    expectedVersion: int = Field(ge=1)
    revisionVersion: int = Field(ge=1)


async def accessible_document(db: AsyncSession, workspace_id: str, document_id: str, user_id: str) -> dict:
    document = await _document_by_id(db, document_id, workspace_id)
    if not document:
        raise ApiError(404, 'Document not found.', 'Not Found')
    await _team_access(db, workspace_id, document['teamId'], user_id)
    return document


@router.get('/{document_id}')
async def get_document(document_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    return {'data': await accessible_document(db, workspaceId, document_id, user['id'])}


@router.get('/{document_id}/revisions')
async def document_revisions(document_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    from ..modules.work_items.document_history import list_revisions
    await accessible_document(db, workspaceId, document_id, user['id'])
    return {'data': await list_revisions(db, document_id)}


@router.get('/{document_id}/revisions/{version}')
async def get_revision(document_id: str, version: int, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    from ..modules.work_items.document_history import revision_row
    await accessible_document(db, workspaceId, document_id, user['id'])
    return {'data': await revision_row(db, document_id, version)}


@router.get('/{document_id}/diff/{version}')
async def document_diff(document_id: str, version: int, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    from ..modules.work_items.document_history import revision_row, revision_diff
    current = await accessible_document(db, workspaceId, document_id, user['id'])
    before = await revision_row(db, document_id, version)
    return {'data': await revision_diff(before, current)}


@router.post('/{document_id}/restore')
async def restore_document(document_id: str, payload: RestoreDocumentInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    from ..modules.work_items.document_history import revision_row
    from ..modules.work_items.documents import update_document as operation
    from ..db.mutations import commit_mutation
    await accessible_document(db, workspaceId, document_id, user['id'])
    revision = await revision_row(db, document_id, payload.revisionVersion)
    return await commit_mutation(db, lambda: operation(document_id, UpdateDocumentInput(
        title=revision['title'], content=revision['content'], expectedVersion=payload.expectedVersion), workspaceId, user, db))
