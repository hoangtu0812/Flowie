from __future__ import annotations

import json
import re
from secrets import token_urlsafe
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from ..storage.minio import MinioStorage
from .auth import _cuid, _utcnow, current_user
from .native_projects import _workspace_access, _workspace_manager


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
        text(
            '''SELECT emoji.id, emoji.workspace_id, emoji.name, emoji.object_key, emoji.filename,
                      emoji.mime_type, emoji.size, emoji.created_by, emoji.archived_at,
                      emoji.created_at, emoji.updated_at,
                      creator.id AS creator_id, creator.name AS creator_name,
                      creator.avatar_url AS creator_avatar_url
               FROM workspace_emojis emoji
               JOIN users creator ON creator.id = emoji.created_by
               WHERE emoji.id = :emoji_id AND emoji.workspace_id = :workspace_id
                 AND (:include_archived OR emoji.archived_at IS NULL)'''
        ),
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
        text(
            '''INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :workspace_id, :actor_id, :action, 'workspace-emoji', :entity_id,
                       CAST(:metadata AS jsonb), :created_at)'''
        ),
        {
            'id': _cuid(), 'workspace_id': workspace_id, 'actor_id': actor_id, 'action': action,
            'entity_id': emoji_id, 'metadata': json.dumps(metadata), 'created_at': _utcnow(),
        },
    )


@router.get('')
async def list_emojis(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''SELECT id FROM workspace_emojis
               WHERE workspace_id = :workspace_id AND archived_at IS NULL
               ORDER BY name ASC'''
        ),
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
    await _workspace_manager(db, workspaceId, user['id'])
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
    now = _utcnow()
    existing = await db.execute(
        text('SELECT id FROM workspace_emojis WHERE workspace_id = :workspace_id AND name = :name'),
        {'workspace_id': workspaceId, 'name': normalized_name},
    )
    existing_id = existing.scalar_one_or_none()
    emoji_id = existing_id or _cuid()
    try:
        if existing_id:
            await db.execute(
                text(
                    '''UPDATE workspace_emojis
                       SET object_key = :object_key, filename = :filename, mime_type = :mime_type,
                           size = :size, created_by = :created_by, archived_at = NULL, updated_at = :now
                       WHERE id = :id'''
                ),
                {
                    'id': emoji_id, 'object_key': object_key, 'filename': filename, 'mime_type': mime_type,
                    'size': len(body), 'created_by': user['id'], 'now': now,
                },
            )
        else:
            await db.execute(
                text(
                    '''INSERT INTO workspace_emojis
                       (id, workspace_id, name, object_key, filename, mime_type, size, created_by, created_at, updated_at)
                       VALUES (:id, :workspace_id, :name, :object_key, :filename, :mime_type, :size,
                               :created_by, :now, :now)'''
                ),
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
    await _workspace_access(db, workspaceId, user['id'])
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
    await _workspace_manager(db, workspaceId, user['id'])
    emoji = await _emoji(db, emoji_id, workspaceId)
    now = _utcnow()
    await db.execute(
        text('UPDATE workspace_emojis SET archived_at = :now, updated_at = :now WHERE id = :emoji_id'),
        {'emoji_id': emoji_id, 'now': now},
    )
    await _audit(db, workspaceId, user['id'], 'workspace-emoji.archived', emoji_id, {'name': emoji['name']})
    await db.commit()
    return {'data': {'id': emoji_id, 'archivedAt': now}}
