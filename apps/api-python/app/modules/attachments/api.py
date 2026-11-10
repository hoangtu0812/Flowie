from __future__ import annotations

from html import escape
from io import BytesIO
from re import IGNORECASE, match, sub
from secrets import token_urlsafe
from typing import Any, Literal
from urllib.parse import urlsplit

from fastapi import Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ...storage.minio import MinioStorage
from ..access.projects import (
    team_access,
    workspace_access,
)
from ..identity.auth import current_user
from ..sharepoint.graph import viewer_url
from .commands import (
    STORE_ATTACHMENT_INSERT_ATTACHMENTS,
)
from .queries import (
    AUTHORIZE_ENTITY_SELECT_COMMENTS,
    DOWNLOAD_ATTACHMENT_SELECT_ATTACHMENTS,
    ENTITY_TEAM_ID_SELECT,
    GET_ATTACHMENT_SELECT_ATTACHMENTS,
    LIST_ATTACHMENTS_SELECT_ATTACHMENTS,
    PREVIEW_ATTACHMENT_SELECT_ATTACHMENTS,
    STORE_ATTACHMENT_SELECT_ATTACHMENTS,
)
from .tables import (
    UnreadableSpreadsheet,
    csv_sheet,
    table_page,
    xlsx_sheets,
)

router = APIRouter(prefix='/api/v1/_native/attachments', tags=['native-attachments'])
# Storage authorization is entity-aware and already native. Expose this
# contract ahead of the attachment panel adapter without changing its UI.
public_router = APIRouter(prefix='/api/v1/attachments', tags=['attachments'])
EntityType = Literal['issue', 'comment', 'project', 'project-update', 'document', 'document-folder', 'ticket']
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
INLINE_IMAGE_MIME_TYPES = frozenset({'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'})
DOCUMENT_FILE_EXTENSIONS = ('.docx', '.pdf', '.md')
# Files filed in a document-tree folder are previewed beside the tree; PDF only for now.
# VI: File đặt trong thư mục của cây tài liệu được xem trước cạnh cây; hiện chỉ nhận PDF.
FOLDER_FILE_EXTENSIONS = ('.pdf',)
# Hosts an uploaded HTML mockup may load script, style, fonts and images from (SECURITY-REVIEW of
# DTD-547). Anything they serve still runs inside the opaque-origin sandbox, so the list only
# widens what a mockup can render, never what it can reach in Flowie.
# VI: Các host mà mockup HTML tải lên được phép lấy script, style, font và ảnh (SECURITY-REVIEW của
# VI: DTD-547). Mọi thứ chúng trả về vẫn chạy trong sandbox origin rỗng, nên danh sách chỉ mở rộng
# VI: những gì mockup hiển thị được, không bao giờ mở rộng những gì nó chạm tới trong Flowie.
HTML_PREVIEW_CDNS = 'https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://cdn.tailwindcss.com https://fonts.googleapis.com https://fonts.gstatic.com'
# Mockups call localStorage/sessionStorage, which throw a SecurityError in an opaque origin. This
# replaces both with an in-memory Storage that is lost on reload, which the task accepts.
# VI: Mockup gọi localStorage/sessionStorage, vốn ném SecurityError trong origin rỗng. Đoạn này thay
# VI: cả hai bằng Storage trong bộ nhớ, mất khi tải lại, điều mà task chấp nhận.
HTML_STORAGE_SHIM = (
    '<script>(function(){function S(){var m=new Map();return{get length(){return m.size},'
    'key:function(i){var k=Array.from(m.keys())[i];return k===undefined?null:k},'
    'getItem:function(k){k=String(k);return m.has(k)?m.get(k):null},'
    'setItem:function(k,v){m.set(String(k),String(v))},removeItem:function(k){m.delete(String(k))},'
    'clear:function(){m.clear()}}}["localStorage","sessionStorage"].forEach(function(n){'
    'try{Object.defineProperty(window,n,{value:S(),configurable:true})}catch(e){}})})();</script>'
)


async def _entity_team_id(db: AsyncSession, workspace_id: str, entity_type: EntityType, entity_id: str) -> str | None:
    result = await db.execute(ENTITY_TEAM_ID_SELECT[entity_type], {'entity_id': entity_id, 'workspace_id': workspace_id})
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Attachment target not found.', 'Not Found')
    return row['team_id']


async def _authorize_entity(db: AsyncSession, workspace_id: str, entity_type: EntityType, entity_id: str, user_id: str, *, writing: bool = False) -> None:
    await workspace_access(db, workspace_id, user_id)
    # Requesters sit outside the ticket's team, so the team rule below would lock them out of their own files.
    # VI: Người yêu cầu ở ngoài team của ticket, nên quy tắc team bên dưới sẽ chặn họ khỏi tệp của chính mình.
    if entity_type == 'ticket':
        from ..service_desk.api import _ask, _manage

        await _manage(db, await _ask(db, entity_id, workspace_id), workspace_id, user_id)
        return
    team_id = await _entity_team_id(db, workspace_id, entity_type, entity_id)
    if team_id:
        await team_access(db, workspace_id, team_id, user_id)
    if writing and entity_type == 'comment':
        author = (await db.execute(AUTHORIZE_ENTITY_SELECT_COMMENTS, {'id': entity_id})).scalar_one()
        if author != user_id:
            raise ApiError(403, 'Only the comment author can attach files to it.', 'Forbidden')


def _present(row: Any) -> dict[str, Any]:
    # `sharepoint` is the copy made by the SharePoint job (link or last error); null when the
    # file has not been copied, which includes every row not read through the list query.
    # VI: `sharepoint` là bản sao do job SharePoint tạo (link hoặc lỗi gần nhất); null khi file
    # VI: chưa được sao chép, gồm mọi dòng không đọc qua truy vấn danh sách.
    sharepoint = {'webUrl': viewer_url(row.get('sp_web_url'), row.get('sp_path')), 'lastError': row.get('sp_last_error')}
    return {'id': row['id'], 'workspaceId': row['workspace_id'], 'uploadedById': row['uploaded_by'], 'entityType': row['entity_type'], 'entityId': row['entity_id'], 'objectKey': row['object_key'], 'filename': row['filename'], 'mimeType': row['mime_type'], 'size': row['size'], 'createdAt': row['created_at'], 'sharepoint': sharepoint if any(sharepoint.values()) else None}


@router.get('')
@public_router.get('')
async def list_attachments(workspaceId: str = Query(min_length=1), entityType: EntityType = Query(), entityId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _authorize_entity(db, workspaceId, entityType, entityId, user['id'])
    result = await db.execute(LIST_ATTACHMENTS_SELECT_ATTACHMENTS, {'workspace_id': workspaceId, 'entity_type': entityType, 'entity_id': entityId})
    return {'data': [_present(row) for row in result.mappings().all()]}


@router.post('')
@public_router.post('')
async def create_attachment(request: Request, workspaceId: str = Form(), entityType: EntityType = Form(), entityId: str = Form(), file: UploadFile = File(), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _authorize_entity(db, workspaceId, entityType, entityId, user['id'], writing=True)
    body = await file.read(MAX_ATTACHMENT_BYTES + 1)
    data = await store_attachment(db, request.app.state.settings, workspaceId, user['id'], entityType, entityId, file.filename, file.content_type, body)
    if entityType == 'ticket':
        from ..service_desk.api import record_ticket_file

        await record_ticket_file(db, entityId, workspaceId, user, data['filename'])
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
    if entity_type == 'document-folder':
        from ..work_items.document_tree import _lock_team_folders

        team_id = await _entity_team_id(db, workspace_id, entity_type, entity_id)
        # document_folders.team_id is NOT NULL, so a folder always yields a team id here.
        # VI: document_folders.team_id là NOT NULL nên thư mục luôn trả về team id ở đây.
        await _lock_team_folders(db, team_id)  # type: ignore[arg-type]
        await _authorize_entity(db, workspace_id, entity_type, entity_id, user_id, writing=True)
    object_key = f'{workspace_id}/{user_id}/{token_urlsafe(18)}-{filename}'
    await MinioStorage(settings).put(object_key, body, mime_type)
    attachment_id = cuid()
    await db.execute(STORE_ATTACHMENT_INSERT_ATTACHMENTS, {'id': attachment_id, 'workspace_id': workspace_id, 'uploaded_by': user_id, 'entity_type': entity_type, 'entity_id': entity_id, 'object_key': object_key, 'filename': filename, 'mime_type': mime_type, 'size': len(body), 'now': utcnow()})
    result = await db.execute(STORE_ATTACHMENT_SELECT_ATTACHMENTS, {'id': attachment_id})
    return _present(result.mappings().one())


@router.get('/{attachment_id}')
@public_router.get('/{attachment_id}')
async def get_attachment(attachment_id: str, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    """One attachment's metadata and uploader name, for the HTML preview page's header.

    Same access rule as download; a missing or unreadable attachment is a 404 either way.
    VI: Metadata và tên người tải lên của một tệp đính kèm, cho header trang xem trước HTML. Cùng
    VI: luật quyền như tải xuống; tệp không tồn tại hay không đọc được đều trả 404.
    """
    row = (await db.execute(GET_ATTACHMENT_SELECT_ATTACHMENTS, {'attachment_id': attachment_id})).mappings().first()
    if not row:
        raise ApiError(404, 'Attachment not found.', 'Not Found')
    await _authorize_entity(db, row['workspace_id'], row['entity_type'], row['entity_id'], user['id'])
    return {'data': {**_present(row), 'uploadedByName': row['uploader_name']}}


@router.get('/{attachment_id}/download')
@public_router.get('/{attachment_id}/download')
async def download_attachment(attachment_id: str, request: Request, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)):
    result = await db.execute(DOWNLOAD_ATTACHMENT_SELECT_ATTACHMENTS, {'attachment_id': attachment_id})
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
    result = await db.execute(PREVIEW_ATTACHMENT_SELECT_ATTACHMENTS, {'attachment_id': attachment_id})
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

    # HTML mockups run, but only as an opaque origin (SECURITY-REVIEW of DTD-547). The `sandbox`
    # CSP directive without `allow-same-origin` makes the browser treat the page as a unique origin
    # even when this URL is opened directly: it carries no Flowie cookie, cannot read Flowie
    # storage, cannot touch the parent page, and CORS refuses its `null` origin. `connect-src
    # 'none'` and `form-action 'none'` stop it sending data with fetch or forms; no popup,
    # top-navigation or form flags are granted. The page is only served into an iframe (Fetch
    # Metadata); any other request, including a browser that sends no `Sec-Fetch-Dest`, is sent to
    # the web wrapper so the file never fills a tab without Flowie's warning header (phishing).
    # `frame-ancestors` adds APP_URL's origin, which equals 'self' in production and is the web
    # port in development. Known residual risk: the page can navigate its own frame to leak itself.
    # VI: Mockup HTML được chạy, nhưng chỉ với origin rỗng (SECURITY-REVIEW của DTD-547). Chỉ thị
    # VI: CSP `sandbox` không có `allow-same-origin` khiến trình duyệt coi trang là một origin riêng
    # VI: kể cả khi mở thẳng URL này: không mang cookie Flowie, không đọc được storage của Flowie,
    # VI: không chạm tới trang cha, và CORS từ chối origin `null` của nó. `connect-src 'none'` và
    # VI: `form-action 'none'` chặn gửi dữ liệu bằng fetch hay form; không cấp cờ popup, điều hướng
    # VI: tab chính hay form. Trang chỉ được phục vụ vào iframe (Fetch Metadata); mọi request khác,
    # VI: kể cả trình duyệt không gửi `Sec-Fetch-Dest`, được chuyển tới wrapper của web để tệp
    # VI: không bao giờ chiếm trọn tab mà thiếu header cảnh báo của Flowie (chống phishing).
    # VI: `frame-ancestors` thêm origin của APP_URL, bằng 'self' trên production và là cổng web khi
    # VI: phát triển. Rủi ro còn lại đã chấp nhận: trang có thể điều hướng khung của chính nó để làm lộ nội dung.
    if suffix in ('html', 'htm'):
        app_url = request.app.state.settings.app_url
        if request.headers.get('sec-fetch-dest') != 'iframe':
            return RedirectResponse(f'{app_url}/preview/{attachment_id}', status_code=303)
        app_origin = '{0.scheme}://{0.netloc}'.format(urlsplit(app_url))
        policy = (
            f"sandbox allow-scripts allow-modals; default-src 'none'; script-src 'unsafe-inline' {HTML_PREVIEW_CDNS}; "
            f"style-src 'unsafe-inline' {HTML_PREVIEW_CDNS}; font-src {HTML_PREVIEW_CDNS}; img-src data: blob: {HTML_PREVIEW_CDNS}; "
            f"connect-src 'none'; form-action 'none'; frame-ancestors 'self' {app_origin}"
        )
        page = body.decode('utf-8', errors='replace')
        # The shim goes after any doctype: content before it would switch the page to quirks mode.
        # VI: Shim đặt sau doctype nếu có: nội dung đứng trước doctype sẽ đưa trang vào quirks mode.
        doctype = match(r'\ufeff?\s*<!doctype[^>]*>', page, IGNORECASE)
        cut = doctype.end() if doctype else 0
        return HTMLResponse(
            page[:cut] + HTML_STORAGE_SHIM + page[cut:],
            headers={'content-security-policy': policy, 'x-content-type-options': 'nosniff', 'cache-control': 'private'},
        )

    if suffix in ('xlsx', 'xlsm', 'csv'):
        try:
            sheets = [csv_sheet(filename, body)] if suffix == 'csv' else xlsx_sheets(body)
        except UnreadableSpreadsheet as error:
            raise ApiError(422, str(error), 'Unprocessable Entity') from error
        return HTMLResponse(
            table_page(filename, sheets),
            headers={'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'", 'x-content-type-options': 'nosniff'},
        )

    if suffix in ('md', 'txt', 'log', 'json'):
        text_content = body.decode('utf-8', errors='replace')
        return HTMLResponse(
            f'<!doctype html><html><head><meta charset="utf-8"><title>{escape(filename)}</title><style>body{{margin:0;padding:32px;font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}}</style></head><body>{escape(text_content)}</body></html>',
            headers={'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'"},
        )

    raise ApiError(415, 'This file type cannot be previewed.', 'Unsupported Media Type')
