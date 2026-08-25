from __future__ import annotations

from datetime import datetime, timedelta
from hashlib import sha256
import re
from secrets import token_urlsafe
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import Settings
from ..core.errors import ApiError
from ..db.session import get_session

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])
password_hasher = PasswordHasher()

USER_COLUMNS = '''
    id, email, name, username, title, timezone, avatar_url, password_hash,
    is_platform_admin, email_verified_at, status, created_at
'''


class LoginInput(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(min_length=1, max_length=128)
    timezone: str | None = Field(default=None, max_length=100)


class RefreshInput(BaseModel):
    refreshToken: str | None = Field(default=None, max_length=512)


def _utcnow() -> datetime:
    # Prisma maps these columns to PostgreSQL `timestamp without time zone`.
    # Keep Python values UTC-naive so asyncpg does not mix offset-aware values
    # with the existing schema.
    return datetime.utcnow()


def _cuid() -> str:
    return f'c{token_urlsafe(18).replace("-", "a").replace("_", "b").lower()}'


def _hash_token(token: str) -> str:
    return sha256(token.encode('utf-8')).hexdigest()


def _compatible_argon2_hash(value: str) -> str:
    """Normalize a legacy Node argon2 parameter order for argon2-cffi.

    The existing Node package emitted ``m,p,t`` while argon2-cffi only accepts
    the standard ``m,t,p`` order.  The encoded parameters and hash bytes are
    unchanged, so old accounts can continue signing in without a reset.
    """

    return re.sub(r'm=(\d+),p=(\d+),t=(\d+)', r'm=\1,t=\3,p=\2', value, count=1)


def _normalized_email(value: str) -> str:
    email = value.strip().lower()
    if not email or '@' not in email or len(email) > 320:
        raise ApiError(400, 'email must be an email', 'Bad Request')
    return email


def _valid_timezone(value: str | None) -> str | None:
    if not value:
        return None
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError as error:
        raise ApiError(400, 'Timezone is invalid.', 'Bad Request') from error
    return value


def _authenticated_user(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'],
        'email': row['email'],
        'name': row['name'],
        'username': row['username'],
        'avatarUrl': row['avatar_url'],
        'emailVerified': row['email_verified_at'] is not None,
        'isPlatformAdmin': row['is_platform_admin'],
    }


async def _find_user_by_email(db: AsyncSession, email: str) -> Any | None:
    result = await db.execute(text(f'SELECT {USER_COLUMNS} FROM users WHERE email = :email'), {'email': email})
    return result.mappings().first()


async def _find_user_by_id(db: AsyncSession, user_id: str) -> Any | None:
    result = await db.execute(text(f'SELECT {USER_COLUMNS} FROM users WHERE id = :id'), {'id': user_id})
    return result.mappings().first()


async def _first_workspace(db: AsyncSession, user_id: str) -> dict[str, str] | None:
    result = await db.execute(
        text(
            '''
            SELECT w.id, w.slug, w.name
            FROM workspace_members AS wm
            INNER JOIN workspaces AS w ON w.id = wm.workspace_id
            WHERE wm.user_id = :user_id AND wm.status = 'ACTIVE'
            ORDER BY wm.created_at ASC
            LIMIT 1
            '''
        ),
        {'user_id': user_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


def _request_metadata(request: Request) -> dict[str, str | None]:
    return {
        'ip_address': request.client.host if request.client else None,
        'user_agent': request.headers.get('user-agent'),
    }


def _set_cookies(response: Response, access_token: str, refresh_token: str, settings: Settings) -> None:
    cookie = {'httponly': True, 'secure': settings.auth_cookie_secure, 'samesite': 'lax', 'path': '/'}
    response.set_cookie(
        'flowie_access',
        access_token,
        max_age=settings.auth_access_token_ttl_seconds,
        **cookie,
    )
    response.set_cookie(
        'flowie_refresh',
        refresh_token,
        max_age=settings.auth_refresh_token_ttl_days * 24 * 60 * 60,
        **cookie,
    )


def _clear_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie('flowie_access', path='/', secure=settings.auth_cookie_secure, httponly=True, samesite='lax')
    response.delete_cookie('flowie_refresh', path='/', secure=settings.auth_cookie_secure, httponly=True, samesite='lax')


async def _create_session(
    db: AsyncSession, user: Any, request: Request, settings: Settings
) -> tuple[str, str, dict[str, Any]]:
    refresh_token = token_urlsafe(48)
    now = _utcnow()
    expires_at = now + timedelta(days=settings.auth_refresh_token_ttl_days)
    metadata = _request_metadata(request)
    await db.execute(
        text(
            '''
            INSERT INTO sessions (
                id, user_id, refresh_token_hash, ip_address, user_agent,
                expires_at, created_at, last_used_at
            ) VALUES (
                :id, :user_id, :refresh_token_hash, :ip_address, :user_agent,
                :expires_at, :created_at, :last_used_at
            )
            '''
        ),
        {
            'id': _cuid(),
            'user_id': user['id'],
            'refresh_token_hash': _hash_token(refresh_token),
            'ip_address': metadata['ip_address'],
            'user_agent': metadata['user_agent'],
            'expires_at': expires_at,
            'created_at': now,
            'last_used_at': now,
        },
    )
    access_token = jwt.encode(
        {
            'sub': user['id'],
            'email': user['email'],
            'iat': now,
            'exp': now + timedelta(seconds=settings.auth_access_token_ttl_seconds),
        },
        settings.auth_jwt_secret,
        algorithm='HS256',
    )
    workspace = await _first_workspace(db, user['id'])
    return access_token, refresh_token, {'user': _authenticated_user(user), 'workspace': workspace}


async def current_user(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> Any:
    token = request.cookies.get('flowie_access')
    if not token:
        raise ApiError(401, 'Sign in is required.', 'Unauthorized')
    try:
        payload = jwt.decode(
            token,
            request.app.state.settings.auth_jwt_secret,
            algorithms=['HS256'],
        )
    except jwt.PyJWTError as error:
        raise ApiError(401, 'Your session has expired. Please sign in again.', 'Unauthorized') from error
    user_id = payload.get('sub')
    if not isinstance(user_id, str):
        raise ApiError(401, 'Your session has expired. Please sign in again.', 'Unauthorized')
    user = await _find_user_by_id(db, user_id)
    if not user or user['status'] != 'ACTIVE':
        raise ApiError(401, 'Your session has expired. Please sign in again.', 'Unauthorized')
    return user


@router.post('/login')
async def login(payload: LoginInput, request: Request, db: AsyncSession = Depends(get_session)) -> JSONResponse:
    email = _normalized_email(payload.email)
    user = await _find_user_by_email(db, email)
    if not user or not user['password_hash'] or user['status'] != 'ACTIVE':
        raise ApiError(401, 'Invalid email or password.', 'Unauthorized')
    try:
        password_matches = password_hasher.verify(
            _compatible_argon2_hash(user['password_hash']), payload.password
        )
    except (InvalidHashError, VerificationError):
        password_matches = False
    if not password_matches:
        raise ApiError(401, 'Invalid email or password.', 'Unauthorized')

    timezone_name = _valid_timezone(payload.timezone)
    await db.execute(
        text('UPDATE users SET last_login_at = :now, timezone = COALESCE(:timezone, timezone), updated_at = :now WHERE id = :id'),
        {'id': user['id'], 'now': _utcnow(), 'timezone': timezone_name},
    )
    access_token, refresh_token, data = await _create_session(db, user, request, request.app.state.settings)
    await db.commit()
    response = JSONResponse({'data': data})
    _set_cookies(response, access_token, refresh_token, request.app.state.settings)
    return response


@router.post('/refresh')
async def refresh(
    request: Request,
    payload: RefreshInput | None = None,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    refresh_token = payload.refreshToken if payload else None
    refresh_token = refresh_token or request.cookies.get('flowie_refresh')
    if not refresh_token:
        raise ApiError(401, 'Your session has expired. Please sign in again.', 'Unauthorized')
    now = _utcnow()
    result = await db.execute(
        text(
            '''
            SELECT s.id AS session_id, u.*
            FROM sessions AS s
            INNER JOIN users AS u ON u.id = s.user_id
            WHERE s.refresh_token_hash = :hash
              AND s.revoked_at IS NULL
              AND s.expires_at > :now
            LIMIT 1
            '''
        ),
        {'hash': _hash_token(refresh_token), 'now': now},
    )
    user = result.mappings().first()
    if not user or user['status'] != 'ACTIVE':
        raise ApiError(401, 'Your session has expired. Please sign in again.', 'Unauthorized')
    await db.execute(text('UPDATE sessions SET revoked_at = :now, last_used_at = :now WHERE id = :id'), {'id': user['session_id'], 'now': now})
    access_token, new_refresh_token, data = await _create_session(db, user, request, request.app.state.settings)
    await db.commit()
    response = JSONResponse({'data': data})
    _set_cookies(response, access_token, new_refresh_token, request.app.state.settings)
    return response


@router.post('/logout', status_code=204)
async def logout(request: Request, db: AsyncSession = Depends(get_session)) -> Response:
    refresh_token = request.cookies.get('flowie_refresh')
    if refresh_token:
        await db.execute(
            text('UPDATE sessions SET revoked_at = :now WHERE refresh_token_hash = :hash AND revoked_at IS NULL'),
            {'hash': _hash_token(refresh_token), 'now': _utcnow()},
        )
        await db.commit()
    response = Response(status_code=204)
    _clear_cookies(response, request.app.state.settings)
    return response
