from __future__ import annotations

import json
import re
from secrets import token_urlsafe
from typing import Any

from fastapi import Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ...storage.minio import MinioStorage
from ..access.projects import workspace_access, workspace_manager
from ..identity.auth import current_user
from .commands import (
    ARCHIVE_EMOJI_UPDATE_WORKSPACE_EMOJIS,
    AUDIT_INSERT_AUDIT_LOGS,
    UPLOAD_EMOJI_INSERT_WORKSPACE_EMOJIS,
    UPLOAD_EMOJI_UPDATE_WORKSPACE_EMOJIS,
)
from .queries import (
    EMOJI_SELECT_WORKSPACE_EMOJIS,
    LIST_EMOJIS_SELECT_WORKSPACE_EMOJIS,
    UPLOAD_EMOJI_SELECT_WORKSPACE_EMOJIS,
)

router = APIRouter(prefix='/api/v1/emojis', tags=['emojis'])
MAX_EMOJI_BYTES = 512 * 1024
EMOJI_NAME = re.compile(r'^[a-z0-9][a-z0-9_-]{1,31}$')


def _image_mime(body: bytes) -> str | None:
    if body.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if len(body) >= 3 and body[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if body[:6] in {b'GIF87a', b'GIF89a'}:
        return 'image/gif'
    if len(body) >= 12 and body[:4] == b'RIFF' and body[8:12] == b'WEBP':
        return 'image/webp'
    return None


def _extension(mime_type: str) -> str:
    return 'jpg' if mime_type == 'image/jpeg' else mime_type.removeprefix('image/')


async def _emoji(
    db: AsyncSession, emoji_id: str, workspace_id: str, *, include_archived: bool = False
) -> dict[str, Any]:
    result = await db.execute(
        EMOJI_SELECT_WORKSPACE_EMOJIS,
        {'emoji_id': emoji_id, 'workspace_id': workspace_id, 'include_archived': include_archived},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Emoji not found.', 'Not Found')
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'name': row['name'],
        'objectKey': row['object_key'], 'filename': row['filename'], 'mimeType': row['mime_type'],
        'size': row['size'], 'createdById': row['created_by'], 'archivedAt': row['archived_at'],
        'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'createdBy': {
            'id': row['creator_id'], 'name': row['creator_name'],
            'avatarUrl': row['creator_avatar_url'],
        },
    }


async def _audit(
    db: AsyncSession, workspace_id: str, actor_id: str, action: str,
    emoji_id: str, metadata: dict[str, Any],
) -> None:
    await db.execute(
        AUDIT_INSERT_AUDIT_LOGS,
        {
            'id': cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id, 'action': action,
            'entity_id': emoji_id, 'metadata': json.dumps(metadata), 'created_at': utcnow(),
        },
    )


@router.get('')
async def list_emojis(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await workspace_access(db, workspaceId, user['id'])
    result = await db.execute(
        LIST_EMOJIS_SELECT_WORKSPACE_EMOJIS,
        {'workspace_id': workspaceId},
    )
    return {'data': [await _emoji(db, row['id'], workspaceId) for row in result.mappings().all()]}


@router.post('')
async def upload_emoji(
    request: Request,
    workspaceId: str = Form(min_length=1),
    name: str = Form(min_length=2, max_length=32),
    file: UploadFile = File(),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await workspace_manager(db, workspaceId, user['id'])
    normalized_name = name.strip().lower()
    if not EMOJI_NAME.fullmatch(normalized_name):
        raise ApiError(400, 'Emoji names must contain 2–32 lowercase letters, numbers, hyphens or underscores.', 'Bad Request')
    body = await file.read(MAX_EMOJI_BYTES + 1)
    if not body:
        raise ApiError(400, 'An emoji image is required.', 'Bad Request')
    if len(body) > MAX_EMOJI_BYTES:
        raise ApiError(400, 'Emoji images may not exceed 512 KB.', 'Bad Request')
    mime_type = _image_mime(body)
    if not mime_type:
        raise ApiError(400, 'Emoji images must be PNG, JPEG, GIF or WebP files.', 'Bad Request')

    filename = f'{normalized_name}.{_extension(mime_type)}'
    object_key = f'{workspaceId}/emojis/{token_urlsafe(18)}-{filename}'
    await MinioStorage(request.app.state.settings).put(object_key, body, mime_type)
    now = utcnow()
    existing = await db.execute(
        UPLOAD_EMOJI_SELECT_WORKSPACE_EMOJIS,
        {'workspace_id': workspaceId, 'name': normalized_name},
    )
    existing_id = existing.scalar_one_or_none()
    emoji_id = existing_id or cuid()
    try:
        if existing_id:
            await db.execute(
                UPLOAD_EMOJI_UPDATE_WORKSPACE_EMOJIS,
                {
                    'id': emoji_id, 'object_key': object_key, 'filename': filename, 'mime_type': mime_type,
                    'size': len(body), 'created_by': user['id'], 'now': now,
                },
            )
        else:
            await db.execute(
                UPLOAD_EMOJI_INSERT_WORKSPACE_EMOJIS,
                {
                    'id': emoji_id, 'workspace_id': workspaceId, 'name': normalized_name,
                    'object_key': object_key, 'filename': filename, 'mime_type': mime_type, 'size': len(body),
                    'created_by': user['id'], 'now': now,
                },
            )
        await _audit(db, workspaceId, user['id'], 'workspace-emoji.uploaded', emoji_id, {
            'name': normalized_name, 'mimeType': mime_type, 'size': len(body),
        })
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, f'An emoji named :{normalized_name}: already exists.', 'Conflict') from error
    return {'data': await _emoji(db, emoji_id, workspaceId)}


@router.get('/{emoji_id}/image')
async def emoji_image(
    emoji_id: str,
    request: Request,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> Response:
    await workspace_access(db, workspaceId, user['id'])
    emoji = await _emoji(db, emoji_id, workspaceId)
    body = await MinioStorage(request.app.state.settings).get(emoji['objectKey'])
    return Response(body, media_type=emoji['mimeType'], headers={'cache-control': 'private, max-age=3600'})


@router.delete('/{emoji_id}')
async def archive_emoji(
    emoji_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await workspace_manager(db, workspaceId, user['id'])
    emoji = await _emoji(db, emoji_id, workspaceId)
    now = utcnow()
    await db.execute(
        ARCHIVE_EMOJI_UPDATE_WORKSPACE_EMOJIS,
        {'emoji_id': emoji_id, 'now': now},
    )
    await _audit(db, workspaceId, user['id'], 'workspace-emoji.archived', emoji_id, {'name': emoji['name']})
    await db.commit()
    return {'data': {'id': emoji_id, 'archivedAt': now}}
