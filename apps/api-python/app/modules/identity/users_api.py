from __future__ import annotations

from datetime import timedelta
from mimetypes import guess_type
from secrets import token_urlsafe
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, File, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ...storage.minio import MinioStorage
from .auth import current_user
from .commands import (
    UPLOAD_AVATAR_UPDATE_USERS,
    update_me_update_users_sql,
)
from .queries import (
    GET_AVATAR_SELECT_USERS,
    PROFILE_MANAGED_BY_SELECT_USER_IDENTITIES,
    UPLOAD_AVATAR_SELECT_USERS,
    WORKSPACE_MEMBER_ACCESS_SELECT_WORKSPACE_MEMBERS,
    WORKSPACE_MEMBERS_SELECT_PROJECT_MEMBERS,
    WORKSPACE_MEMBERS_SELECT_TEAM_MEMBERS,
    workspace_members_select_workspace_members_sql,
)

router = APIRouter(prefix='/api/v1/users', tags=['users'])
MAX_AVATAR_BYTES = 5 * 1024 * 1024
AVATAR_PREFIX = 'avatars/'


def _avatar_content_type(body: bytes) -> tuple[str, str] | None:
    """Recognize raster image bytes instead of trusting the browser MIME type."""
    if body.startswith(b'\xff\xd8\xff'):
        return ('image/jpeg', 'jpg')
    if body.startswith(b'\x89PNG\r\n\x1a\n'):
        return ('image/png', 'png')
    if body.startswith((b'GIF87a', b'GIF89a')):
        return ('image/gif', 'gif')
    if len(body) >= 12 and body[:4] == b'RIFF' and body[8:12] == b'WEBP':
        return ('image/webp', 'webp')
    return None


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    username: str | None = Field(default=None, max_length=48)
    title: str | None = Field(default=None, max_length=120)
    avatarUrl: str | None = Field(default=None, max_length=2048)
    timezone: str | None = Field(default=None, max_length=100)


def _profile(row: Any, profile_managed_by: str | None = None) -> dict[str, object]:
    stored_avatar_url = row['avatar_url']
    return {
        'id': row['id'],
        'name': row['name'],
        'email': row['email'],
        'username': row['username'],
        'title': row['title'],
        'timezone': row['timezone'],
        'avatarUrl': f'/users/{row["id"]}/avatar' if stored_avatar_url and stored_avatar_url.startswith(AVATAR_PREFIX) else stored_avatar_url,
        'createdAt': row['created_at'],
        'isPlatformAdmin': bool(row.get('is_platform_admin', False)),
        'profileManagedBy': profile_managed_by,
    }


async def _profile_managed_by(db: AsyncSession, user_id: str) -> str | None:
    result = await db.execute(
        PROFILE_MANAGED_BY_SELECT_USER_IDENTITIES,
        {'user_id': user_id},
    )
    return result.scalar_one_or_none()


@router.get('/me')
async def me(
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, object]:
    return {'data': _profile(user, await _profile_managed_by(db, user['id']))}


@router.patch('/me')
async def update_me(
    payload: ProfileUpdate,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    values = payload.model_dump(exclude_unset=True)
    profile_managed_by = await _profile_managed_by(db, user['id'])
    if not values:
        return {'data': _profile(user, profile_managed_by)}
    if profile_managed_by == 'MICROSOFT' and {'name', 'avatarUrl'} & values.keys():
        raise ApiError(
            409,
            'Name and profile picture are managed by Microsoft Entra ID.',
            'Conflict',
        )
    if 'timezone' in values and values['timezone'] is not None:
        try:
            ZoneInfo(values['timezone'])
        except ZoneInfoNotFoundError as error:
            raise ApiError(400, 'Timezone is invalid.', 'Bad Request') from error

    columns = {'name': 'name', 'username': 'username', 'title': 'title', 'avatarUrl': 'avatar_url', 'timezone': 'timezone'}
    params: dict[str, object] = {'id': user['id']}
    updates: list[str] = []
    for field, column in columns.items():
        if field not in values:
            continue
        value = values[field]
        if field in {'name', 'username', 'title', 'avatarUrl'} and value is not None:
            value = value.strip()
        if field in {'username', 'title', 'avatarUrl'} and value == '':
            value = None
        params[field] = value
        updates.append(f'{column} = :{field}')
    if not updates:
        return {'data': _profile(user, profile_managed_by)}
    updates.append('updated_at = CURRENT_TIMESTAMP')
    try:
        result = await db.execute(
            update_me_update_users_sql(updates),
            params,
        )
        await db.commit()
    except Exception as error:
        await db.rollback()
        raise ApiError(409, 'The profile could not be updated.', 'Conflict') from error
    return {'data': _profile(result.mappings().one(), profile_managed_by)}


@router.post('/me/avatar')
async def upload_avatar(
    request: Request,
    file: UploadFile = File(),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    if await _profile_managed_by(db, user['id']) == 'MICROSOFT':
        raise ApiError(
            409,
            'The profile picture is managed by Microsoft Entra ID.',
            'Conflict',
        )
    body = await file.read(MAX_AVATAR_BYTES + 1)
    if not body:
        raise ApiError(400, 'An image is required.', 'Bad Request')
    if len(body) > MAX_AVATAR_BYTES:
        raise ApiError(400, 'Profile pictures may not exceed 5 MB.', 'Bad Request')
    image = _avatar_content_type(body)
    if not image:
        raise ApiError(400, 'Profile pictures must be a JPEG, PNG, GIF, or WebP image.', 'Bad Request')

    content_type, extension = image
    object_key = f'{AVATAR_PREFIX}{user["id"]}/{token_urlsafe(18)}.{extension}'
    await MinioStorage(request.app.state.settings).put(object_key, body, content_type)
    await db.execute(
        UPLOAD_AVATAR_UPDATE_USERS,
        {'id': user['id'], 'object_key': object_key},
    )
    await db.commit()
    stored = await db.execute(
        UPLOAD_AVATAR_SELECT_USERS,
        {'id': user['id']},
    )
    # The storage key remains internal. The public route below always resolves
    # the most recent avatar for this user.
    profile = _profile(stored.mappings().one())
    profile['avatarUrl'] = f'/users/{user["id"]}/avatar'
    return {'data': profile}


@router.get('/{user_id}/avatar')
async def get_avatar(user_id: str, request: Request, db: AsyncSession = Depends(get_session)) -> Response:
    """Serve an uploaded avatar without exposing the internal MinIO object key."""
    result = await db.execute(GET_AVATAR_SELECT_USERS, {'id': user_id})
    row = result.mappings().first()
    object_key = row['avatar_url'] if row else None
    if not object_key or not object_key.startswith(AVATAR_PREFIX):
        raise ApiError(404, 'Profile picture not found.', 'Not Found')
    body = await MinioStorage(request.app.state.settings).get(object_key)
    content_type = guess_type(object_key)[0] or 'application/octet-stream'
    return Response(body, media_type=content_type, headers={'cache-control': 'private, no-store'})


async def _workspace_member_access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        WORKSPACE_MEMBER_ACCESS_SELECT_WORKSPACE_MEMBERS,
        {'workspace_id': workspace_id, 'user_id': user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, 'You do not have access to this workspace.', 'Forbidden')


async def _workspace_members(
    db: AsyncSession, workspace_id: str, user_id: str | None = None
) -> list[dict[str, object]]:
    """The Members directory: the profile plus the teams and projects joined.

    Teams and projects are read once for the whole directory rather than per
    member, so opening the screen costs three queries whatever the headcount.
    """

    condition = 'AND wm.user_id = :user_id' if user_id else ''
    result = await db.execute(
        workspace_members_select_workspace_members_sql(condition),
        {'workspace_id': workspace_id, **({'user_id': user_id} if user_id else {})},
    )
    rows = result.mappings().all()
    if not rows:
        return []

    member_ids = [row['id'] for row in rows]
    teams = await db.execute(
        WORKSPACE_MEMBERS_SELECT_TEAM_MEMBERS,
        {'ids': member_ids, 'workspace_id': workspace_id},
    )
    projects = await db.execute(
        WORKSPACE_MEMBERS_SELECT_PROJECT_MEMBERS,
        {'ids': member_ids, 'workspace_id': workspace_id},
    )

    team_rows: dict[str, list[dict[str, object]]] = {}
    for row in teams.mappings().all():
        team_rows.setdefault(row['user_id'], []).append(
            {
                'id': row['id'],
                'name': row['name'],
                'identifier': row['identifier'],
                'icon': row['icon'],
                'role': row['role'],
            }
        )
    project_rows: dict[str, list[dict[str, object]]] = {}
    for row in projects.mappings().all():
        project_rows.setdefault(row['user_id'], []).append(
            {'id': row['id'], 'name': row['name'], 'identifier': row['identifier']}
        )

    return [
        {
            'id': row['id'],
            'name': row['name'],
            'email': row['email'],
            'username': row['username'],
            'title': row['title'],
            'timezone': row['timezone'],
            'avatarUrl': f'/users/{row["id"]}/avatar'
            if row['avatar_url'] and row['avatar_url'].startswith(AVATAR_PREFIX)
            else row['avatar_url'],
            'createdAt': row['created_at'],
            'workspaceRole': row['role'],
            'joinedAt': row['joined_at'] or row['member_created_at'],
            'lastSeenAt': row['last_seen_at'],
            'isOnline': bool(
                row['last_seen_at'] and row['last_seen_at'] >= utcnow() - timedelta(minutes=2)
            ),
            'teams': team_rows.get(row['id'], []),
            'projects': project_rows.get(row['id'], []),
        }
        for row in rows
    ]


@router.get('')
async def list_workspace_members(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, object]]]:
    await _workspace_member_access(db, workspaceId, user['id'])
    return {'data': await _workspace_members(db, workspaceId)}


@router.get('/{user_id}')
async def get_workspace_member(
    user_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, object]]:
    await _workspace_member_access(db, workspaceId, user['id'])
    members = await _workspace_members(db, workspaceId, user_id)
    if not members:
        raise ApiError(404, 'Member not found.', 'Not Found')
    return {'data': members[0]}
