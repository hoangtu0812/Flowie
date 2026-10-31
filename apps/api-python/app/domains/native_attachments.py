from __future__ import annotations

from html import escape
from io import BytesIO
from re import sub
from secrets import token_urlsafe
from typing import Any, Literal

from fastapi import Depends, File, Form, Query, Request, UploadFile
from ..core.utc_responses import UtcAPIRouter as APIRouter
from fastapi.responses import HTMLResponse, Response
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
EntityType = Literal['issue', 'comment', 'project', 'project-update', 'document', 'document-folder']
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
INLINE_IMAGE_MIME_TYPES = frozenset({'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'})
DOCUMENT_FILE_EXTENSIONS = ('.docx', '.pdf', '.md')
# Files filed in a document-tree folder are previewed beside the tree; PDF only for now.
# VI: File đặt trong thư mục của cây tài liệu được xem trước cạnh cây; hiện chỉ nhận PDF.
FOLDER_FILE_EXTENSIONS = ('.pdf',)


async def _entity_team_id(db: AsyncSession, workspace_id: str, entity_type: EntityType, entity_id: str) -> str | None:
    queries = {
        'issue': 'SELECT team_id FROM issues WHERE id = :entity_id AND workspace_id = :workspace_id AND archived_at IS NULL',
        'comment': 'SELECT i.team_id FROM comments c JOIN issues i ON i.id = c.issue_id WHERE c.id = :entity_id AND i.workspace_id = :workspace_id AND c.deleted_at IS NULL AND i.archived_at IS NULL',
        'project': 'SELECT team_id FROM projects WHERE id = :entity_id AND workspace_id = :workspace_id AND archived_at IS NULL',
        'project-update': 'SELECT p.team_id FROM project_updates pu JOIN projects p ON p.id = pu.project_id WHERE pu.id = :entity_id AND pu.workspace_id = :workspace_id AND p.archived_at IS NULL',
        'document': 'SELECT team_id FROM documents WHERE id = :entity_id AND workspace_id = :workspace_id AND archived_at IS NULL',
        'document-folder': 'SELECT team_id FROM document_folders WHERE id = :entity_id AND workspace_id = :workspace_id',
    }
    result = await db.execute(text(queries[entity_type]), {'entity_id': entity_id, 'workspace_id': workspace_id})
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Attachment target not found.', 'Not Found')
    return row['team_id']


async def _authorize_entity(db: AsyncSession, workspace_id: str, entity_type: EntityType, entity_id: str, user_id: str, *, writing: bool = False) -> None:
    await _workspace_access(db, workspace_id, user_id)
    team_id = await _entity_team_id(db, workspace_id, entity_type, entity_id)
    if team_id:
        await _team_access(db, workspace_id, team_id, user_id)
    if writing and entity_type == 'comment':
        author = (await db.execute(text('SELECT author_id FROM comments WHERE id=:id'), {'id': entity_id})).scalar_one()
        if author != user_id:
            raise ApiError(403, 'Only the comment author can attach files to it.', 'Forbidden')


def _present(row: Any) -> dict[str, Any]:
    # `sharepoint` is the copy made by the SharePoint job (link or last error); null when the
    # file has not been copied, which includes every row not read through the list query.
    # VI: `sharepoint` là bản sao do job SharePoint tạo (link hoặc lỗi gần nhất); null khi file
    # VI: chưa được sao chép, gồm mọi dòng không đọc qua truy vấn danh sách.
    sharepoint = {'webUrl': row.get('sp_web_url'), 'lastError': row.get('sp_last_error')}
    return {'id': row['id'], 'workspaceId': row['workspace_id'], 'uploadedById': row['uploaded_by'], 'entityType': row['entity_type'], 'entityId': row['entity_id'], 'objectKey': row['object_key'], 'filename': row['filename'], 'mimeType': row['mime_type'], 'size': row['size'], 'createdAt': row['created_at'], 'sharepoint': sharepoint if any(sharepoint.values()) else None}


@router.get('')
@public_router.get('')
async def list_attachments(workspaceId: str = Query(min_length=1), entityType: EntityType = Query(), entityId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _authorize_entity(db, workspaceId, entityType, entityId, user['id'])
    result = await db.execute(text('SELECT a.*, pub.web_url AS sp_web_url, pub.last_error AS sp_last_error FROM attachments a LEFT JOIN attachment_publications pub ON pub.attachment_id = a.id WHERE a.workspace_id = :workspace_id AND a.entity_type = :entity_type AND a.entity_id = :entity_id ORDER BY a.created_at DESC'), {'workspace_id': workspaceId, 'entity_type': entityType, 'entity_id': entityId})
    return {'data': [_present(row) for row in result.mappings().all()]}


@router.post('')
@public_router.post('')
async def create_attachment(request: Request, workspaceId: str = Form(), entityType: EntityType = Form(), entityId: str = Form(), file: UploadFile = File(), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _authorize_entity(db, workspaceId, entityType, entityId, user['id'], writing=True)
    body = await file.read(MAX_ATTACHMENT_BYTES + 1)
    data = await store_attachment(db, request.app.state.settings, workspaceId, user['id'], entityType, entityId, file.filename, file.content_type, body)
    await db.commit()
    return {'data': data}


async def store_attachment(db: AsyncSession, settings: Any, workspace_id: str, user_id: str, entity_type: EntityType, entity_id: str, filename: str | None, content_type: str | None, body: bytes) -> dict[str, Any]:
    """Stores an already authorized upload in object storage and records it; the caller commits.

    Shared by the web upload and the MCP upload URL, so both apply the same 10 MB limit, filename
    cleaning and document type rules. `body` may be one byte over the limit so an oversized file
    is told apart from one that fits exactly.
    VI: Lưu file đã được cấp quyền vào object storage và ghi bản ghi; bên gọi tự commit. Dùng chung
    VI: cho upload trên web và URL upload của MCP, nên cả hai cùng giới hạn 10 MB, cùng cách làm sạch
    VI: tên file và luật loại file của tài liệu. `body` có thể dư một byte so với giới hạn để phân biệt
    VI: file quá lớn với file vừa đúng giới hạn.
    """
    if not body:
        raise ApiError(400, 'A file is required.', 'Bad Request')
    if len(body) > MAX_ATTACHMENT_BYTES:
        raise ApiError(400, 'Files may not exceed 10 MB.', 'Bad Request')
    filename = sub(r'[^a-zA-Z0-9._-]', '_', filename or 'attachment')[:180] or 'attachment'
    if entity_type == 'document' and not filename.lower().endswith(DOCUMENT_FILE_EXTENSIONS):
        raise ApiError(400, 'Documents accept DOCX, PDF, or Markdown files only.', 'Bad Request')
    # The %PDF- signature check stops a renamed file from being served inline as a PDF.
    # VI: Kiểm tra chữ ký %PDF- để file đổi đuôi không được phục vụ inline như PDF.
    if entity_type == 'document-folder' and (not filename.lower().endswith(FOLDER_FILE_EXTENSIONS) or not body.startswith(b'%PDF-')):
        raise ApiError(400, 'Document folders accept PDF files only.', 'Bad Request')
    mime_type = content_type or 'application/octet-stream'
    object_key = f'{workspace_id}/{user_id}/{token_urlsafe(18)}-{filename}'
    await MinioStorage(settings).put(object_key, body, mime_type)
    attachment_id = _cuid()
    await db.execute(text('''INSERT INTO attachments (id, workspace_id, uploaded_by, entity_type, entity_id, object_key, filename, mime_type, size, created_at) VALUES (:id, :workspace_id, :uploaded_by, :entity_type, :entity_id, :object_key, :filename, :mime_type, :size, :now)'''), {'id': attachment_id, 'workspace_id': workspace_id, 'uploaded_by': user_id, 'entity_type': entity_type, 'entity_id': entity_id, 'object_key': object_key, 'filename': filename, 'mime_type': mime_type, 'size': len(body), 'now': _utcnow()})
    result = await db.execute(text('SELECT * FROM attachments WHERE id = :id'), {'id': attachment_id})
    return _present(result.mappings().one())


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


@router.get('/{attachment_id}/preview')
@public_router.get('/{attachment_id}/preview')
async def preview_attachment(attachment_id: str, request: Request, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)):
    """Render a private document in-browser without exposing it to a third party."""
    result = await db.execute(text('SELECT * FROM attachments WHERE id = :attachment_id'), {'attachment_id': attachment_id})
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Attachment not found.', 'Not Found')
    await _authorize_entity(db, row['workspace_id'], row['entity_type'], row['entity_id'], user['id'])
    body = await MinioStorage(request.app.state.settings).get(row['object_key'])
    filename = row['filename']
    suffix = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    safe_filename = filename.replace('"', '')

    # Pasted screenshots are stored like any other attachment, so the preview
    # route is what lets a description or comment embed them. SVG stays out:
    # it can carry script, and nothing pasted from a clipboard needs it.
    if row['mime_type'] in INLINE_IMAGE_MIME_TYPES:
        return Response(
            body,
            media_type=row['mime_type'],
            headers={
                'content-disposition': f'inline; filename="{safe_filename}"',
                'x-content-type-options': 'nosniff',
                'cache-control': 'private, max-age=3600',
            },
        )

    if suffix == 'pdf' or row['mime_type'] == 'application/pdf':
        return Response(
            body,
            media_type='application/pdf',
            headers={'content-disposition': f'inline; filename="{safe_filename}"'},
        )

    if suffix == 'docx':
        import mammoth

        converted = mammoth.convert_to_html(BytesIO(body))
        page = f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(filename)}</title><style>body{{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6;color:#202124;margin:0 auto;max-width:900px;padding:48px 32px}}img{{max-width:100%;height:auto}}table{{border-collapse:collapse;max-width:100%}}td,th{{border:1px solid #d0d7de;padding:8px;text-align:left}}pre{{overflow:auto;background:#f6f8fa;padding:16px;border-radius:6px}}</style></head><body>{converted.value}</body></html>'''
        return HTMLResponse(
            page,
            headers={
                'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
                'x-content-type-options': 'nosniff',
            },
        )

    if suffix == 'md':
        text_content = body.decode('utf-8', errors='replace')
        return HTMLResponse(
            f'<!doctype html><html><head><meta charset="utf-8"><title>{escape(filename)}</title><style>body{{margin:0;padding:32px;font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}}</style></head><body>{escape(text_content)}</body></html>',
            headers={'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'"},
        )

    raise ApiError(415, 'This file type cannot be previewed.', 'Unsupported Media Type')
