from __future__ import annotations

from ..modules.work_items.document_repository import _team_access as _team_access, _document as _document, _documents as _documents, _document_by_id as _document_by_id, _folder as _folder, _resolve_folder as _resolve_folder, _source_url as _source_url

from typing import Any, Literal
from urllib.parse import urlparse

from fastapi import Depends, Query
from ..core.utc_responses import UtcAPIRouter as APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..modules.work_items.contracts import CreateDocumentInput, UpdateDocumentInput
from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .teams import _workspace_role


router = APIRouter(prefix='/api/v1/documents', tags=['documents'])


FolderKind = Literal['project', 'module', 'feature', 'changes', 'general']


class CreateFolderInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    # A root folder names its team or project; a child takes both from `parentId`.
    # VI: Thư mục gốc chỉ rõ team hoặc dự án; thư mục con lấy cả hai từ `parentId`.
    teamId: str | None = Field(default=None, min_length=1)
    projectId: str | None = Field(default=None, min_length=1)
    parentId: str | None = Field(default=None, min_length=1)
    kind: FolderKind = 'general'
    name: str = Field(min_length=2, max_length=100)
    icon: str | None = Field(default=None, min_length=1, max_length=32)


class UpdateFolderInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    icon: str | None = Field(default=None, min_length=1, max_length=32)
    position: int | None = Field(default=None, ge=0)
    kind: FolderKind | None = None
    # null moves the folder to its team root. VI: null đưa thư mục về gốc của team.
    parentId: str | None = None


class ProjectTreeInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    projectId: str = Field(min_length=1)


@router.get('')
async def list_documents(workspaceId: str = Query(min_length=1), teamId: str | None = None, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _team_access(db, workspaceId, teamId, user['id'])
    return {'data': await _documents(db, workspaceId, teamId, user_id=user['id'])}


@router.get('/folders')
async def list_folders(workspaceId: str = Query(min_length=1), teamId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    from ..modules.work_items.document_tree import folder_payload

    await _team_access(db, workspaceId, teamId, user['id'])
    result = await db.execute(
        text('''SELECT * FROM document_folders WHERE workspace_id = :workspace_id AND team_id = :team_id
                ORDER BY position ASC, name ASC, id ASC'''),
        {'workspace_id': workspaceId, 'team_id': teamId},
    )
    return {'data': [
        {**folder_payload(row), 'documents': await _documents(db, workspaceId, teamId, row['id'])}
        for row in result.mappings().all()
    ]}


@router.post('/folders')
async def create_folder(payload: CreateFolderInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    from ..modules.work_items.document_tree import create_folder as operation

    folder = await operation(
        db, workspace_id=payload.workspaceId, user_id=user['id'], team_id=payload.teamId,
        name=payload.name, icon=payload.icon, parent_id=payload.parentId,
        project_id=payload.projectId, kind=payload.kind,
    )
    await db.commit()
    return {'data': {**folder, 'documents': []}}


@router.patch('/folders/{folder_id}')
async def update_folder(folder_id: str, payload: UpdateFolderInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    from ..modules.work_items.document_tree import update_folder as operation

    folder = await operation(db, workspace_id=workspaceId, user_id=user['id'], folder_id=folder_id, values=payload.model_dump(exclude_unset=True))
    await db.commit()
    return {'data': folder}


@router.get('/project-tree')
async def read_project_tree(workspaceId: str = Query(min_length=1), projectId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    from ..modules.work_items.document_tree import project_tree

    return {'data': await project_tree(db, workspace_id=workspaceId, user_id=user['id'], project_id=projectId)}


@router.post('/project-tree/scaffold')
async def scaffold_project_tree(payload: ProjectTreeInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    from ..modules.work_items.document_tree import project_tree, scaffold_project_tree as operation

    await operation(db, workspace_id=payload.workspaceId, user_id=user['id'], project_id=payload.projectId)
    await db.commit()
    return {'data': await project_tree(db, workspace_id=payload.workspaceId, user_id=user['id'], project_id=payload.projectId)}


@router.get('/issue-links')
async def read_issue_documents(workspaceId: str = Query(min_length=1), issueId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    from ..modules.work_items.document_tree import issue_documents

    return {'data': await issue_documents(db, workspace_id=workspaceId, user_id=user['id'], issue_id=issueId)}


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
