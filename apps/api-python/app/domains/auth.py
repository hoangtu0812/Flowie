from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from hmac import compare_digest
import re
from secrets import choice, token_urlsafe
from string import digits
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import Settings
from ..core.errors import ApiError
from ..db.session import get_session
from ..services.registration_verification import RegistrationDeliveryError, deliver_registration_code
from .workflow_catalog import DEFAULT_CIRCLE_ISSUE_STATUSES

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])
password_hasher = PasswordHasher()

USER_COLUMNS = '''
    id, email, name, username, title, timezone, avatar_url, password_hash,
    is_platform_admin, email_verified_at, status, created_at
'''

# Chromium on Windows can report the historical IANA alias `Asia/Saigon`.
# PostgreSQL stores the canonical name and Python's zoneinfo database may not
# ship that alias, so normalize it at the API boundary.
TIMEZONE_ALIASES = {'Asia/Saigon': 'Asia/Ho_Chi_Minh'}


class LoginInput(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(min_length=1, max_length=128)
    timezone: str | None = Field(default=None, max_length=100)


class RefreshInput(BaseModel):
    refreshToken: str | None = Field(default=None, max_length=512)


class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=320)
    password: str = Field(min_length=12, max_length=128)
    timezone: str | None = Field(default=None, max_length=100)


class VerifyRegistrationInput(BaseModel):
    email: str = Field(max_length=320)
    code: str = Field(min_length=6, max_length=6, pattern=r'^\d{6}$')


class CreateApiKeyInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    expiresAt: str | None = Field(default=None, max_length=64)


def _utcnow() -> datetime:
    # Prisma maps these columns to PostgreSQL `timestamp without time zone`.
    # Keep Python values UTC-naive so asyncpg does not mix offset-aware values
    # with the existing schema.
    return datetime.utcnow()


def _cuid() -> str:
    return f'c{token_urlsafe(18).replace("-", "a").replace("_", "b").lower()}'


def _hash_token(token: str) -> str:
    return sha256(token.encode('utf-8')).hexdigest()


def _registration_code() -> str:
    return ''.join(choice(digits) for _ in range(6))


def _request_fingerprint(request: Request, secret: str) -> str | None:
    if not request.client:
        return None
    return sha256(f'{secret}:{request.client.host}'.encode('utf-8')).hexdigest()


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
    timezone_name = TIMEZONE_ALIASES.get(value.strip(), value.strip())
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as error:
        raise ApiError(400, 'Timezone is invalid.', 'Bad Request') from error
    return timezone_name


def _api_key_expiry(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise ApiError(400, 'expiresAt must be a valid ISO 8601 datetime', 'Bad Request') from error
    if parsed.tzinfo:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    if parsed <= _utcnow():
        raise ApiError(400, 'API key expiry must be in the future.', 'Bad Request')
    return parsed


def _normalized_name(value: str) -> str:
    name = value.strip()
    if not 2 <= len(name) <= 120:
        raise ApiError(400, 'name must be longer than or equal to 2 characters', 'Bad Request')
    return name


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


async def _unique_workspace_slug(db: AsyncSession, name: str) -> str:
    # Mirror the legacy service: user-facing slugs are predictable and receive
    # an increment only when the workspace name is already taken.
    base = re.sub(r'(^-|-$)', '', re.sub(r'[^a-z0-9]+', '-', name.lower().strip()))[:42] or 'workspace'
    slug = base
    suffix = 2
    while True:
        exists = await db.execute(text('SELECT 1 FROM workspaces WHERE slug = :slug LIMIT 1'), {'slug': slug})
        if exists.scalar_one_or_none() is None:
            return slug
        slug = f'{base}-{suffix}'
        suffix += 1


async def create_workspace_bootstrap(
    db: AsyncSession,
    *,
    user_id: str,
    organization_name: str,
    workspace_name: str,
    now: datetime,
) -> dict[str, str]:
    slug = await _unique_workspace_slug(db, workspace_name)
    organization_id = _cuid()
    workspace_id = _cuid()
    team_id = _cuid()
    await db.execute(
        text(
            '''
            INSERT INTO organizations (id, name, slug, owner_id, created_at, updated_at)
            VALUES (:id, :name, :slug, :owner_id, :now, :now)
            '''
        ),
        {'id': organization_id, 'name': organization_name, 'slug': slug, 'owner_id': user_id, 'now': now},
    )
    await db.execute(
        text(
            '''
            INSERT INTO workspaces (id, organization_id, name, slug, timezone, created_at, updated_at)
            VALUES (:id, :organization_id, :name, :slug, 'UTC', :now, :now)
            '''
        ),
        {'id': workspace_id, 'organization_id': organization_id, 'name': workspace_name, 'slug': slug, 'now': now},
    )
    await db.execute(
        text(
            '''
            INSERT INTO workspace_members (id, workspace_id, user_id, status, role, joined_at, created_at, updated_at)
            VALUES (:id, :workspace_id, :user_id, 'ACTIVE', 'OWNER', :now, :now, :now)
            '''
        ),
        {'id': _cuid(), 'workspace_id': workspace_id, 'user_id': user_id, 'now': now},
    )
    await db.execute(
        text(
            '''
            INSERT INTO teams (id, workspace_id, name, identifier, description, created_at, updated_at)
            VALUES (:id, :workspace_id, 'General', 'GEN', 'Default team for this workspace.', :now, :now)
            '''
        ),
        {'id': team_id, 'workspace_id': workspace_id, 'now': now},
    )
    await db.execute(
        text("INSERT INTO team_members (team_id, user_id, role) VALUES (:team_id, :user_id, 'LEAD')"),
        {'team_id': team_id, 'user_id': user_id},
    )
    for position, (status_name, category, color) in enumerate(DEFAULT_CIRCLE_ISSUE_STATUSES):
        await db.execute(
            text(
                '''
                INSERT INTO issue_statuses (id, workspace_id, name, category, color, position, created_at, updated_at)
                VALUES (:id, :workspace_id, :name, :category, :color, :position, :now, :now)
                '''
            ),
            {
                'id': _cuid(),
                'workspace_id': workspace_id,
                'name': status_name,
                'category': category,
                'color': color,
                'position': position,
                'now': now,
            },
        )
    return {'organization_id': organization_id, 'workspace_id': workspace_id, 'team_id': team_id, 'slug': slug}


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


@router.post('/register', status_code=202)
async def request_registration_verification(
    payload: RegisterInput,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    name = _normalized_name(payload.name)
    email = _normalized_email(payload.email)
    timezone_name = _valid_timezone(payload.timezone) or 'UTC'
    now = _utcnow()
    expires_at = now + timedelta(seconds=request.app.state.settings.registration_otp_ttl_seconds)
    code = _registration_code()
    fingerprint = _request_fingerprint(request, request.app.state.settings.auth_jwt_secret)
    try:
        async with db.begin():
            if await _find_user_by_email(db, email):
                raise ApiError(409, 'An account already exists for this email address.', 'Conflict')
            if fingerprint:
                recent_requests = await db.execute(
                    text(
                        '''
                        SELECT COUNT(*) FROM registration_verification_tokens
                        WHERE request_fingerprint = :fingerprint
                          AND created_at > :window_start
                        '''
                    ),
                    {'fingerprint': fingerprint, 'window_start': now - timedelta(minutes=10)},
                )
                if int(recent_requests.scalar_one()) >= 5:
                    raise ApiError(429, 'Too many registration requests. Please try again later.', 'Too Many Requests')
            existing_pending = await db.execute(
                text(
                    '''
                    SELECT last_sent_at FROM registration_verification_tokens
                    WHERE email = :email
                    FOR UPDATE
                    '''
                ),
                {'email': email},
            )
            last_pending = existing_pending.mappings().first()
            if last_pending and last_pending['last_sent_at'] > now - timedelta(minutes=1):
                raise ApiError(429, 'Wait one minute before requesting another verification code.', 'Too Many Requests')
            await db.execute(
                text(
                    '''
                    DELETE FROM registration_verification_tokens WHERE email = :email
                    '''
                ),
                {'email': email},
            )
            await db.execute(
                text(
                    '''
                    INSERT INTO registration_verification_tokens (
                        id, email, name, password_hash, timezone, code_hash, request_fingerprint,
                        expires_at, created_at, last_sent_at
                    ) VALUES (
                        :id, :email, :name, :password_hash, :timezone, :code_hash, :request_fingerprint,
                        :expires_at, :created_at, :last_sent_at
                    )
                    '''
                ),
                {
                    'id': _cuid(),
                    'email': email,
                    'name': name,
                    'password_hash': password_hasher.hash(payload.password),
                    'timezone': timezone_name,
                    'code_hash': _hash_token(code),
                    'request_fingerprint': fingerprint,
                    'expires_at': expires_at,
                    'created_at': now,
                    'last_sent_at': now,
                },
            )
    except IntegrityError as error:
        raise ApiError(409, 'An account already exists for this email address.', 'Conflict') from error

    try:
        await deliver_registration_code(request.app.state.settings, email=email, code=code, expires_at=expires_at)
    except RegistrationDeliveryError as error:
        await db.execute(
            text('DELETE FROM registration_verification_tokens WHERE email = :email AND code_hash = :code_hash'),
            {'email': email, 'code_hash': _hash_token(code)},
        )
        await db.commit()
        raise ApiError(503, str(error), 'Service Unavailable') from error
    return JSONResponse({'data': {'email': email, 'expiresAt': expires_at.isoformat()}}, status_code=202)


@router.post('/register/verify')
async def verify_registration(
    payload: VerifyRegistrationInput,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    email = _normalized_email(payload.email)
    now = _utcnow()
    async with db.begin():
        result = await db.execute(
            text(
                '''
                SELECT id, email, name, password_hash, timezone, code_hash, expires_at, attempt_count
                FROM registration_verification_tokens
                WHERE email = :email
                FOR UPDATE
                '''
            ),
            {'email': email},
        )
        pending = result.mappings().first()
        if not pending or pending['expires_at'] <= now:
            if pending:
                await db.execute(text('DELETE FROM registration_verification_tokens WHERE id = :id'), {'id': pending['id']})
            raise ApiError(400, 'The verification code has expired. Request a new code.', 'Bad Request')
        if pending['attempt_count'] >= 5:
            raise ApiError(429, 'Too many incorrect codes. Request a new code.', 'Too Many Requests')
        if not compare_digest(pending['code_hash'], _hash_token(payload.code)):
            await db.execute(
                text('UPDATE registration_verification_tokens SET attempt_count = attempt_count + 1 WHERE id = :id'),
                {'id': pending['id']},
            )
            raise ApiError(400, 'The verification code is incorrect.', 'Bad Request')
        if await _find_user_by_email(db, email):
            raise ApiError(409, 'An account already exists for this email address.', 'Conflict')
        user = {
            'id': _cuid(),
            'email': email,
            'name': pending['name'],
            'username': None,
            'title': None,
            'timezone': pending['timezone'],
            'avatar_url': None,
            'password_hash': pending['password_hash'],
            'is_platform_admin': False,
            'email_verified_at': now,
            'status': 'ACTIVE',
            'created_at': now,
        }
        await db.execute(
            text(
                '''
                INSERT INTO users (
                    id, email, name, timezone, password_hash, is_platform_admin,
                    email_verified_at, status, created_at, updated_at
                ) VALUES (
                    :id, :email, :name, :timezone, :password_hash, :is_platform_admin,
                    :email_verified_at, :status, :created_at, :updated_at
                )
                '''
            ),
            {**user, 'updated_at': now},
        )
        await db.execute(
            text(
                '''
                INSERT INTO user_identities (
                    id, user_id, provider, provider_account_id, email, created_at, updated_at
                ) VALUES (:id, :user_id, 'LOCAL', :provider_account_id, :email, :now, :now)
                '''
            ),
            {'id': _cuid(), 'user_id': user['id'], 'provider_account_id': email, 'email': email, 'now': now},
        )
        await create_workspace_bootstrap(
            db,
            user_id=user['id'],
            organization_name=f"{user['name']}'s organization",
            workspace_name=f"{user['name']}'s workspace",
            now=now,
        )
        await db.execute(text('DELETE FROM registration_verification_tokens WHERE id = :id'), {'id': pending['id']})
        access_token, refresh_token, data = await _create_session(db, user, request, request.app.state.settings)

    response = JSONResponse({'data': data}, status_code=201)
    _set_cookies(response, access_token, refresh_token, request.app.state.settings)
    return response


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


@router.get('/sessions')
async def list_sessions(
    request: Request,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    current_refresh = request.cookies.get('flowie_refresh')
    current_hash = _hash_token(current_refresh) if current_refresh else None
    result = await db.execute(
        text(
            '''
            SELECT id, refresh_token_hash, ip_address, user_agent, expires_at, created_at, last_used_at
            FROM sessions
            WHERE user_id = :user_id AND revoked_at IS NULL AND expires_at > :now
            ORDER BY last_used_at DESC
            '''
        ),
        {'user_id': user['id'], 'now': _utcnow()},
    )
    sessions = []
    for session in result.mappings():
        sessions.append(
            {
                'id': session['id'],
                'ipAddress': session['ip_address'],
                'userAgent': session['user_agent'],
                'expiresAt': session['expires_at'],
                'createdAt': session['created_at'],
                'lastUsedAt': session['last_used_at'],
                'current': bool(current_hash and session['refresh_token_hash'] == current_hash),
            }
        )
    return {'data': sessions}


@router.delete('/sessions')
async def revoke_other_sessions(
    request: Request,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, int]]:
    refresh_token = request.cookies.get('flowie_refresh')
    if not refresh_token:
        raise ApiError(403, 'The current session could not be identified.', 'Forbidden')
    result = await db.execute(
        text(
            '''
            UPDATE sessions
            SET revoked_at = :now
            WHERE user_id = :user_id
              AND revoked_at IS NULL
              AND expires_at > :now
              AND refresh_token_hash <> :current_hash
            '''
        ),
        {'now': _utcnow(), 'user_id': user['id'], 'current_hash': _hash_token(refresh_token)},
    )
    await db.commit()
    return {'data': {'revoked': max(result.rowcount or 0, 0)}}


@router.delete('/sessions/{session_id}')
async def revoke_session(
    session_id: str,
    request: Request,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    result = await db.execute(
        text(
            '''
            SELECT id, refresh_token_hash
            FROM sessions
            WHERE id = :id AND user_id = :user_id AND revoked_at IS NULL
            LIMIT 1
            '''
        ),
        {'id': session_id, 'user_id': user['id']},
    )
    session = result.mappings().first()
    if not session:
        raise ApiError(404, 'Session not found.', 'Not Found')
    refresh_token = request.cookies.get('flowie_refresh')
    if refresh_token and session['refresh_token_hash'] == _hash_token(refresh_token):
        raise ApiError(400, 'Use sign out to revoke the current session.', 'Bad Request')
    await db.execute(text('UPDATE sessions SET revoked_at = :now WHERE id = :id'), {'id': session_id, 'now': _utcnow()})
    await db.commit()
    return {'data': {'id': session_id, 'revoked': True}}


def _api_key(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'],
        'name': row['name'],
        'prefix': row['prefix'],
        'expiresAt': row['expires_at'],
        'lastUsedAt': row['last_used_at'],
        'createdAt': row['created_at'],
    }


@router.get('/api-keys')
async def list_api_keys(
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, list[dict[str, Any]]]:
    result = await db.execute(
        text(
            '''
            SELECT id, name, prefix, expires_at, last_used_at, created_at
            FROM personal_api_keys
            WHERE user_id = :user_id
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > :now)
            ORDER BY created_at DESC
            '''
        ),
        {'user_id': user['id'], 'now': _utcnow()},
    )
    return {'data': [_api_key(row) for row in result.mappings().all()]}


@router.post('/api-keys')
async def create_api_key(
    payload: CreateApiKeyInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    name = payload.name.strip()
    if len(name) < 2:
        raise ApiError(400, 'API key name is too short.', 'Bad Request')
    expires_at = _api_key_expiry(payload.expiresAt)
    token = f'flowie_pat_{token_urlsafe(32)}'
    now = _utcnow()
    result = await db.execute(
        text(
            '''
            INSERT INTO personal_api_keys (
                id, user_id, name, prefix, token_hash, expires_at, created_at
            ) VALUES (
                :id, :user_id, :name, :prefix, :token_hash, :expires_at, :created_at
            )
            RETURNING id, name, prefix, expires_at, last_used_at, created_at
            '''
        ),
        {
            'id': _cuid(),
            'user_id': user['id'],
            'name': name,
            'prefix': token[:18],
            'token_hash': _hash_token(token),
            'expires_at': expires_at,
            'created_at': now,
        },
    )
    await db.commit()
    return {'data': {**_api_key(result.mappings().one()), 'token': token}}


@router.delete('/api-keys/{key_id}')
async def revoke_api_key(
    key_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    result = await db.execute(
        text(
            '''
            UPDATE personal_api_keys
            SET revoked_at = :now
            WHERE id = :id AND user_id = :user_id AND revoked_at IS NULL
            RETURNING id
            '''
        ),
        {'id': key_id, 'user_id': user['id'], 'now': _utcnow()},
    )
    if not result.scalar_one_or_none():
        raise ApiError(404, 'API key not found.', 'Not Found')
    await db.commit()
    return {'data': {'id': key_id, 'revoked': True}}
