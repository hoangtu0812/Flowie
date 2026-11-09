from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import Depends, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..core.utc_responses import UtcAPIRouter as APIRouter
from ..db.session import get_session
from .auth import _cuid, _is_environment_admin, _platform_role, _utcnow, current_user

router = APIRouter(prefix='/api/v1/admin', tags=['admin'])

UserStatus = Literal['ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED']
PlatformRole = Literal['SUPER_ADMIN', 'VIEWER']


class UpdateAdminUserInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    status: UserStatus | None = None
    # An explicit null revokes the role; leaving the field out keeps it.
    # VI: Gửi null tường minh để thu hồi vai trò; bỏ trống trường này thì giữ nguyên.
    platformRole: PlatformRole | None = None


async def _platform_admin(user: Any) -> None:
    """The console is platform-wide, so workspace roles grant nothing here."""

    if not user['platform_role']:
        raise ApiError(403, 'Platform administrator access is required.', 'Forbidden')


async def _super_admin(user: Any) -> None:
    """Guard every console write and the audit log; view-only administrators stop here.

    VI: Chặn mọi thao tác ghi của console và audit log; admin chỉ xem dừng ở đây.
    """

    if user['platform_role'] != 'SUPER_ADMIN':
        raise ApiError(403, 'Super administrator access is required.', 'Forbidden')


def _admin_user(row: Any, actor: Any, settings: Any) -> dict[str, Any]:
    email = row['email']
    role = _platform_role(email, row['platform_role'], settings)
    environment_admin = _is_environment_admin(email, settings)
    return {
        'id': row['id'],
        'name': row['name'],
        'email': row['email'],
        'status': row['status'],
        'isPlatformAdmin': role is not None,
        'isEnvironmentAdmin': environment_admin,
        'platformRole': role,
        # Mirrors the checks in update_user so the console only offers what the API accepts.
        # VI: Khớp các kiểm tra trong update_user để console chỉ cho thao tác mà API chấp nhận.
        'manageable': (
            actor['platform_role'] == 'SUPER_ADMIN'
            and row['id'] != actor['id']
            and not environment_admin
        ),
        'createdAt': row['created_at'],
        'lastLoginAt': row['last_login_at'],
        '_count': {'memberships': row['memberships'], 'organizations': row['organizations']},
    }


ADMIN_USER_QUERY = '''
    SELECT u.id, u.name, u.email, u.status, u.platform_role, u.created_at, u.last_login_at,
           (SELECT COUNT(*)::int FROM workspace_members m WHERE m.user_id = u.id) AS memberships,
           (SELECT COUNT(*)::int FROM organizations o WHERE o.owner_id = u.id) AS organizations
    FROM users u
'''


@router.get('/overview')
async def overview(
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, dict[str, int]]:
    await _platform_admin(user)
    result = await db.execute(
        text(
            '''SELECT (SELECT COUNT(*)::int FROM users) AS users,
                      (SELECT COUNT(*)::int FROM users WHERE status = 'ACTIVE') AS active_users,
                      (SELECT COUNT(*)::int FROM organizations) AS organizations,
                      (SELECT COUNT(*)::int FROM workspaces) AS workspaces,
                      (SELECT COUNT(*)::int FROM projects) AS projects,
                      (SELECT COUNT(*)::int FROM issues) AS issues'''
        )
    )
    row = result.mappings().one()
    return {
        'data': {
            'users': row['users'],
            'activeUsers': row['active_users'],
            'organizations': row['organizations'],
            'workspaces': row['workspaces'],
            'projects': row['projects'],
            'issues': row['issues'],
        }
    }


@router.get('/users')
async def users(
    request: Request,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _platform_admin(user)
    result = await db.execute(text(f'{ADMIN_USER_QUERY} ORDER BY u.created_at DESC'))
    return {
        'data': [
            _admin_user(row, user, request.app.state.settings)
            for row in result.mappings().all()
        ]
    }


@router.get('/workspaces')
async def workspaces(
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, list[dict[str, Any]]]:
    await _platform_admin(user)
    result = await db.execute(
        text(
            '''SELECT w.id, w.name, w.slug, w.created_at,
                      o.name AS organization_name, o.slug AS organization_slug,
                      ow.name AS owner_name, ow.email AS owner_email,
                      (SELECT COUNT(*)::int FROM workspace_members m WHERE m.workspace_id = w.id) AS members,
                      (SELECT COUNT(*)::int FROM teams t WHERE t.workspace_id = w.id) AS teams,
                      (SELECT COUNT(*)::int FROM projects p WHERE p.workspace_id = w.id) AS projects,
                      (SELECT COUNT(*)::int FROM issues i WHERE i.workspace_id = w.id) AS issues
               FROM workspaces w
               JOIN organizations o ON o.id = w.organization_id
               JOIN users ow ON ow.id = o.owner_id
               ORDER BY w.created_at DESC'''
        )
    )
    return {
        'data': [
            {
                'id': row['id'],
                'name': row['name'],
                'slug': row['slug'],
                'createdAt': row['created_at'],
                'organization': {
                    'name': row['organization_name'],
                    'slug': row['organization_slug'],
                    'owner': {'name': row['owner_name'], 'email': row['owner_email']},
                },
                '_count': {
                    'members': row['members'],
                    'teams': row['teams'],
                    'projects': row['projects'],
                    'issues': row['issues'],
                },
            }
            for row in result.mappings().all()
        ]
    }


@router.get('/audit')
async def audit_logs(
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, list[dict[str, Any]]]:
    await _super_admin(user)
    result = await db.execute(
        text(
            '''SELECT id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at
               FROM audit_logs ORDER BY created_at DESC LIMIT 200'''
        )
    )
    return {
        'data': [
            {
                'id': row['id'],
                'workspaceId': row['workspace_id'],
                'actorId': row['actor_id'],
                'action': row['action'],
                'entityType': row['entity_type'],
                'entityId': row['entity_id'],
                'metadata': row['metadata'],
                'createdAt': row['created_at'],
            }
            for row in result.mappings().all()
        ]
    }


@router.patch('/users/{user_id}')
async def update_user(
    user_id: str,
    payload: UpdateAdminUserInput,
    request: Request,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _super_admin(user)
    if user_id == user['id']:
        raise ApiError(
            400,
            'Use a separate platform administrator to change your own access.',
            'Bad Request',
        )
    target = await db.execute(
        text('SELECT id, email, status, platform_role FROM users WHERE id = :id'), {'id': user_id}
    )
    row = target.mappings().first()
    if not row:
        raise ApiError(404, 'User not found.', 'Not Found')

    settings = request.app.state.settings
    is_environment_admin = _is_environment_admin(row['email'], settings)
    role_changes = 'platformRole' in payload.model_fields_set
    if role_changes and is_environment_admin:
        raise ApiError(
            400,
            'The ADMIN_EMAIL account always keeps super administrator access.',
            'Bad Request',
        )
    if payload.status and payload.status != 'ACTIVE' and is_environment_admin:
        raise ApiError(
            400,
            'The ADMIN_EMAIL account cannot be suspended or disabled.',
            'Bad Request',
        )

    now = _utcnow()
    sets, params = [], {'id': user_id}
    if payload.status:
        sets.append('status = :status')
        params['status'] = payload.status
    if role_changes:
        # is_platform_admin is kept in step because /users/me and member payloads read the column.
        # VI: Giữ is_platform_admin đồng bộ vì /users/me và dữ liệu thành viên đọc cột này.
        sets.append('platform_role = CAST(:platform_role AS "PlatformRole")')
        sets.append('is_platform_admin = :is_platform_admin')
        params['platform_role'] = payload.platformRole
        params['is_platform_admin'] = payload.platformRole is not None
    if sets:
        await db.execute(text(f"UPDATE users SET {', '.join(sets)} WHERE id = :id"), params)
    if payload.status and payload.status != 'ACTIVE':
        await db.execute(
            text(
                'UPDATE sessions SET revoked_at = :now WHERE user_id = :id AND revoked_at IS NULL'
            ),
            {'id': user_id, 'now': now},
        )
    await db.execute(
        text(
            '''INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (:id, :actor_id, 'admin.user.updated', 'user', :entity_id, CAST(:metadata AS jsonb), :now)'''
        ),
        {
            'id': _cuid(),
            'actor_id': user['id'],
            'entity_id': user_id,
            'metadata': json.dumps(
                {
                    'status': payload.status,
                    **(
                        {
                            'platformRole': {
                                'from': row['platform_role'],
                                'to': payload.platformRole,
                            }
                        }
                        if role_changes
                        else {}
                    ),
                }
            ),
            'now': now,
        },
    )
    await db.commit()
    updated = await db.execute(text(f'{ADMIN_USER_QUERY} WHERE u.id = :id'), {'id': user_id})
    return {'data': _admin_user(updated.mappings().one(), user, settings)}
