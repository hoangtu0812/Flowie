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
from ..modules.work_items.document_review import DecisionInput, ReviewersInput
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
    # Two-digit folder number; omitted, a folder inside a project tree takes the next free one.
    # VI: Số thư mục hai chữ số; bỏ trống thì thư mục trong cây dự án nhận số trống kế tiếp.
    number: int | None = Field(default=None, ge=0, le=99)


class UpdateFolderInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    icon: str | None = Field(default=None, min_length=1, max_length=32)
    position: int | None = Field(default=None, ge=0)
    kind: FolderKind | None = None
    # null removes the number. VI: null xoá số của thư mục.
    number: int | None = Field(default=None, ge=0, le=99)
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
    # Project Docs folders carry their project's team too; only team-wide folders belong here,
    # project trees are read through /project-tree.
    # VI: Thư mục cây Docs dự án cũng mang team của dự án; ở đây chỉ trả thư mục chung của team,
    # VI: cây dự án đọc qua /project-tree.
    result = await db.execute(
        text('''SELECT * FROM document_folders WHERE workspace_id = :workspace_id AND team_id = :team_id
                AND project_id IS NULL
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
        project_id=payload.projectId, kind=payload.kind, number=payload.number,
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


class IssueLinkInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    issueId: str = Field(min_length=1)


@router.get('/{document_id}/issue-links')
async def read_document_issues(document_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    from ..modules.work_items.document_tree import document_issues

    return {'data': await document_issues(db, workspace_id=workspaceId, user_id=user['id'], document_id=document_id)}


@router.post('/{document_id}/issue-links')
async def link_document_issue(document_id: str, payload: IssueLinkInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    from ..modules.work_items.document_tree import issue_documents, link_issue_document

    await link_issue_document(db, workspace_id=payload.workspaceId, user_id=user['id'], document_id=document_id, issue_id=payload.issueId, linked=True)
    await db.commit()
    return {'data': await issue_documents(db, workspace_id=payload.workspaceId, user_id=user['id'], issue_id=payload.issueId)}


@router.delete('/{document_id}/issue-links/{issue_id}')
async def unlink_document_issue(document_id: str, issue_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    from ..modules.work_items.document_tree import issue_documents, link_issue_document

    await link_issue_document(db, workspace_id=workspaceId, user_id=user['id'], document_id=document_id, issue_id=issue_id, linked=False)
    await db.commit()
    return {'data': await issue_documents(db, workspace_id=workspaceId, user_id=user['id'], issue_id=issue_id)}


@router.get('/{document_id}/review')
async def read_document_review(document_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    from ..modules.work_items.document_review import review_state

    return {'data': await review_state(db, workspaceId, document_id, user['id'])}


@router.put('/{document_id}/review/reviewers')
async def set_document_reviewers(document_id: str, payload: ReviewersInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    from ..modules.work_items.document_review import set_reviewers
    from ..db.mutations import commit_mutation

    return {'data': await commit_mutation(db, lambda: set_reviewers(db, document_id, payload, user))}


@router.post('/{document_id}/review/decision')
async def decide_document_review(document_id: str, payload: DecisionInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    from ..modules.work_items.document_review import decide
    from ..db.mutations import commit_mutation

    return {'data': await commit_mutation(db, lambda: decide(db, document_id, payload, user))}


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
    from ..modules.work_items.document_tree import publications_by_document
    document = await accessible_document(db, workspaceId, document_id, user['id'])
    # The document page shows the same SharePoint state as the Docs preview.
    # VI: Trang tài liệu hiển thị cùng trạng thái SharePoint như khung xem trước của Docs.
    publications = await publications_by_document(db, [document_id])
    return {'data': {**document, 'publication': publications.get(document_id)}}


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


@router.get('/{document_id}/releases')
async def document_releases(document_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    from ..modules.work_items.document_history import list_releases
    await accessible_document(db, workspaceId, document_id, user['id'])
    return {'data': await list_releases(db, document_id)}


@router.get('/{document_id}/releases/{release}')
async def get_release(document_id: str, release: int, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    from ..modules.work_items.document_history import release_row
    await accessible_document(db, workspaceId, document_id, user['id'])
    return {'data': await release_row(db, document_id, release)}


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
