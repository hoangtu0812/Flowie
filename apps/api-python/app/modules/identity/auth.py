from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest
from secrets import choice
from string import digits
from typing import Any
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
import jwt
from argon2 import PasswordHasher
from fastapi import Depends, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.config import Settings
from ...core.errors import ApiError
from ...core.identifiers import cuid, hash_token
from ...core.passwords import verify_password
from ...core.slugs import GENERATED_ID, RESERVED_WORKSPACE_SLUGS
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ...services.auth_policy import require_password_sign_in
from ...services.microsoft_identity import MicrosoftIdentityClient, MicrosoftProfile
from ...services.registration_verification import (
    RegistrationDeliveryError,
    deliver_registration_code,
)
from ...storage.minio import MinioStorage
from ..work_items.workflow_catalog import DEFAULT_ISSUE_STATUSES
from .commands import (
    CREATE_WORKSPACE_BOOTSTRAP_INSERT_ISSUE_STATUSES,
    CREATE_WORKSPACE_BOOTSTRAP_INSERT_ORGANIZATIONS,
    CREATE_WORKSPACE_BOOTSTRAP_INSERT_TEAM_MEMBERS,
    CREATE_WORKSPACE_BOOTSTRAP_INSERT_TEAMS,
    CREATE_WORKSPACE_BOOTSTRAP_INSERT_WORKSPACE_AGENT_TOOLS,
    CREATE_WORKSPACE_BOOTSTRAP_INSERT_WORKSPACE_MEMBERS,
    CREATE_WORKSPACE_BOOTSTRAP_INSERT_WORKSPACES,
    JOIN_TENANT_WORKSPACES_INSERT_AUDIT_LOGS,
    JOIN_TENANT_WORKSPACES_INSERT_WORKSPACE_MEMBERS,
    LOGIN_UPDATE_USERS,
    MICROSOFT_CALLBACK_UPDATE_USERS,
    REFRESH_PRESENCE_UPDATE_USERS,
    REQUEST_REGISTRATION_VERIFICATION_DELETE_REGISTRATION_VERIFICATION_TOKENS,
    REQUEST_REGISTRATION_VERIFICATION_DELETE_REGISTRATION_VERIFICATION_TOKENS_2,
    REQUEST_REGISTRATION_VERIFICATION_INSERT_REGISTRATION_VERIFICATION_TOKENS,
    REVOKE_API_KEY_UPDATE_PERSONAL_API_KEYS,
    UPSERT_MICROSOFT_USER_DELETE_USER_IDENTITIES,
    UPSERT_MICROSOFT_USER_INSERT_USER_IDENTITIES,
    UPSERT_MICROSOFT_USER_INSERT_USER_IDENTITIES_2,
    UPSERT_MICROSOFT_USER_INSERT_USERS,
    UPSERT_MICROSOFT_USER_UPDATE_SESSIONS,
    UPSERT_MICROSOFT_USER_UPDATE_USER_IDENTITIES,
    UPSERT_MICROSOFT_USER_UPDATE_USERS,
    VERIFY_REGISTRATION_DELETE_REGISTRATION_VERIFICATION_TOKENS,
    VERIFY_REGISTRATION_DELETE_REGISTRATION_VERIFICATION_TOKENS_2,
    VERIFY_REGISTRATION_INSERT_USER_IDENTITIES,
    VERIFY_REGISTRATION_INSERT_USERS,
    VERIFY_REGISTRATION_UPDATE_REGISTRATION_VERIFICATION_TOKENS,
)
from .queries import (
    FIRST_WORKSPACE_SELECT_WORKSPACE_MEMBERS,
    JOIN_TENANT_WORKSPACES_SELECT_WORKSPACES,
    LIST_API_KEYS_SELECT_PERSONAL_API_KEYS,
    LIST_SESSIONS_SELECT_SESSIONS,
    REQUEST_REGISTRATION_VERIFICATION_SELECT_REGISTRATION_VERIFICATION_TOKENS,
    REQUEST_REGISTRATION_VERIFICATION_SELECT_REGISTRATION_VERIFICATION_TOKENS_2,
    UNIQUE_WORKSPACE_SLUG_SELECT_WORKSPACES,
    UPSERT_MICROSOFT_USER_SELECT_USER_IDENTITIES,
    UPSERT_MICROSOFT_USER_SELECT_USER_IDENTITIES_2,
    UPSERT_MICROSOFT_USER_SELECT_USERS,
    VERIFY_REGISTRATION_SELECT_REGISTRATION_VERIFICATION_TOKENS,
    find_user_by_email_select_users_sql,
    find_user_by_id_select_users_sql,
    upsert_microsoft_user_select_users_sql,
)

router = APIRouter(prefix='/api/v1/auth', tags=['auth'])
password_hasher = PasswordHasher()
MICROSOFT_FLOW_COOKIE = 'flowie_microsoft_flow'
MICROSOFT_FLOW_TTL_SECONDS = 10 * 60

USER_COLUMNS = '''
    id, email, name, username, title, timezone, avatar_url, password_hash,
    is_platform_admin, platform_role, email_verified_at, status, auth_version, created_at
'''

# Chromium on Windows can report the historical IANA alias `Asia/Saigon`.
# PostgreSQL stores the canonical name and Python's zoneinfo database may not
# ship that alias, so normalize it at the API boundary.
TIMEZONE_ALIASES = {'Asia/Saigon': 'Asia/Ho_Chi_Minh'}


class LoginInput(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(min_length=1, max_length=128)
    timezone: str | None = Field(default=None, max_length=100)
    next: str | None = Field(default=None, max_length=2048)


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








def _registration_code() -> str:
    return ''.join(choice(digits) for _ in range(6))


def _request_fingerprint(request: Request, secret: str) -> str | None:
    if not request.client:
        return None
    return sha256(f'{secret}:{request.client.host}'.encode()).hexdigest()


def normalized_email(value: str) -> str:
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
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    if parsed <= utcnow():
        raise ApiError(400, 'API key expiry must be in the future.', 'Bad Request')
    return parsed


def _normalized_name(value: str) -> str:
    name = value.strip()
    if not 2 <= len(name) <= 120:
        raise ApiError(400, 'name must be longer than or equal to 2 characters', 'Bad Request')
    return name


def _safe_app_path(value: str | None) -> str | None:
    if not value or not value.startswith('/') or value.startswith('//') or '\\' in value or any(ord(char) < 32 for char in value):
        return None
    return value[:2048]


def _is_environment_admin(email: str, settings: Settings) -> bool:
    return bool(settings.admin_email and email.strip().lower() == settings.admin_email)


def _platform_role(email: str, stored_role: str | None, settings: Settings) -> str | None:
    """Return the effective /admin role: ADMIN_EMAIL is always a super admin, whatever is stored.

    The environment wins so the account stays recoverable from the server if roles are misconfigured.
    VI: Trả về vai trò /admin hiệu lực: ADMIN_EMAIL luôn là super admin, bất kể giá trị đã lưu.
    VI: Biến môi trường được ưu tiên để vẫn khôi phục được từ server nếu cấu hình vai trò bị sai.
    """

    return 'SUPER_ADMIN' if _is_environment_admin(email, settings) else stored_role


def _runtime_user(row: Any, settings: Settings) -> dict[str, Any]:
    user = dict(row)
    user['platform_role'] = _platform_role(
        str(user['email']), user.get('platform_role'), settings
    )
    user['is_platform_admin'] = user['platform_role'] is not None
    return user


def _microsoft_client(settings: Settings) -> MicrosoftIdentityClient:
    return MicrosoftIdentityClient(
        tenant_id=settings.azure_ad_tenant_id,
        client_id=settings.azure_ad_client_id,
        client_secret=settings.azure_ad_client_secret,
        redirect_uri=settings.azure_ad_redirect_uri,
    )


def _microsoft_flow_token(
    flow: dict[str, Any], *, next_path: str | None, timezone_name: str | None, settings: Settings
) -> str:
    now = datetime.now(UTC)
    stored_flow = {key: value for key, value in flow.items() if key != 'auth_uri'}
    return jwt.encode(
        {
            'flow': stored_flow,
            'next': next_path,
            'timezone': timezone_name,
            'iat': now,
            'exp': now + timedelta(seconds=MICROSOFT_FLOW_TTL_SECONDS),
        },
        settings.auth_jwt_secret,
        algorithm='HS256',
    )


def _microsoft_flow_cookie_path(settings: Settings) -> str:
    # Scopes the sign-in flow cookie to the directory of AZURE_AD_REDIRECT_URI so it
    # follows a proxy prefix: '/flowie/api/v1/auth/microsoft/callback' gives
    # '/flowie/api/v1/auth/microsoft', which covers both /start and /callback.
    # A fixed '/api/v1/...' path is never sent back under '/flowie/api/...'.
    # VI: Giới hạn cookie luồng đăng nhập theo thư mục của AZURE_AD_REDIRECT_URI để
    # theo tiền tố proxy: '/flowie/api/v1/auth/microsoft/callback' cho ra
    # '/flowie/api/v1/auth/microsoft', bao cả /start và /callback. Path cố định
    # '/api/v1/...' sẽ không được trình duyệt gửi lại dưới '/flowie/api/...'.
    path = urlsplit(settings.azure_ad_redirect_uri).path.rsplit('/', 1)[0]
    return path or '/api/v1/auth/microsoft'


def _decode_microsoft_flow(token: str, settings: Settings) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.auth_jwt_secret, algorithms=['HS256'])
    except jwt.PyJWTError as error:
        raise ApiError(400, 'The Microsoft sign-in request has expired.', 'Bad Request') from error
    if not isinstance(payload.get('flow'), dict):
        raise ApiError(400, 'The Microsoft sign-in request is invalid.', 'Bad Request')
    return payload


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
    result = await db.execute(find_user_by_email_select_users_sql(USER_COLUMNS), {'email': email})
    return result.mappings().first()


async def _find_user_by_id(db: AsyncSession, user_id: str) -> Any | None:
    result = await db.execute(find_user_by_id_select_users_sql(USER_COLUMNS), {'id': user_id})
    return result.mappings().first()


async def _first_workspace(db: AsyncSession, user_id: str) -> dict[str, str] | None:
    result = await db.execute(
        FIRST_WORKSPACE_SELECT_WORKSPACE_MEMBERS,
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
        # An earlier slug of another workspace still opens that workspace, and reserved or
        # id-shaped slugs would not reach the workspace, so all of them count as taken.
        # VI: Slug cũ của workspace khác vẫn mở workspace đó, còn slug dành riêng hoặc giống id sẽ
        # VI: không mở được workspace, nên tất cả đều coi như đã có chủ.
        exists = await db.execute(
            UNIQUE_WORKSPACE_SLUG_SELECT_WORKSPACES,
            {'slug': slug},
        )
        if exists.scalar_one_or_none() is None and slug not in RESERVED_WORKSPACE_SLUGS and not GENERATED_ID.fullmatch(slug):
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
    organization_id = cuid()
    workspace_id = cuid()
    team_id = cuid()
    await db.execute(
        CREATE_WORKSPACE_BOOTSTRAP_INSERT_ORGANIZATIONS,
        {'id': organization_id, 'name': organization_name, 'slug': slug, 'owner_id': user_id, 'now': now},
    )
    await db.execute(
        CREATE_WORKSPACE_BOOTSTRAP_INSERT_WORKSPACES,
        {'id': workspace_id, 'organization_id': organization_id, 'name': workspace_name, 'slug': slug, 'now': now},
    )
    for tool_key in (
        'issues.count', 'issues.overdue', 'issues.by_status', 'issues.by_assignee',
        'issues.stale', 'projects.progress', 'projects.delivery',
        'initiatives.delivery', 'cycles.progress',
    ):
        await db.execute(
            CREATE_WORKSPACE_BOOTSTRAP_INSERT_WORKSPACE_AGENT_TOOLS,
            {'id': cuid(), 'workspace_id': workspace_id, 'tool_key': tool_key, 'now': now},
        )
    await db.execute(
        CREATE_WORKSPACE_BOOTSTRAP_INSERT_WORKSPACE_MEMBERS,
        {'id': cuid(), 'workspace_id': workspace_id, 'user_id': user_id, 'now': now},
    )
    await db.execute(
        CREATE_WORKSPACE_BOOTSTRAP_INSERT_TEAMS,
        {'id': team_id, 'workspace_id': workspace_id, 'now': now},
    )
    await db.execute(
        CREATE_WORKSPACE_BOOTSTRAP_INSERT_TEAM_MEMBERS,
        {'team_id': team_id, 'user_id': user_id},
    )
    for position, (status_name, category, color) in enumerate(DEFAULT_ISSUE_STATUSES):
        await db.execute(
            CREATE_WORKSPACE_BOOTSTRAP_INSERT_ISSUE_STATUSES,
            {
                'id': cuid(),
                'workspace_id': workspace_id,
                'name': status_name,
                'category': category,
                'color': color,
                'position': position,
                'now': now,
            },
        )
    return {'organization_id': organization_id, 'workspace_id': workspace_id, 'team_id': team_id, 'slug': slug}




def _set_cookies(response: Response, access_token: str, refresh_token: str, settings: Settings) -> None:
    response.headers['Cache-Control'] = 'private, no-store'
    # Shared flags for both session cookies; `Any` lets mypy accept the `**cookie` spread.
    # VI: Cờ dùng chung cho hai cookie phiên; `Any` để mypy chấp nhận cách truyền `**cookie`.
    cookie: dict[str, Any] = {'httponly': True, 'secure': settings.auth_cookie_secure, 'samesite': 'lax', 'path': '/'}
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
    response.headers['Cache-Control'] = 'private, no-store'
    response.delete_cookie('flowie_access', path='/', secure=settings.auth_cookie_secure, httponly=True, samesite='lax')
    response.delete_cookie('flowie_refresh', path='/', secure=settings.auth_cookie_secure, httponly=True, samesite='lax')


async def _create_session(
    db: AsyncSession, user: Any, request: Request, settings: Settings, *, method: str = 'PASSWORD', authenticated_at=None
) -> tuple[str, str, dict[str, Any]]:
    from .security.sessions import create_session
    access, refresh = await create_session(db, user, request, settings, method=method, authenticated_at=authenticated_at)
    workspace = await _first_workspace(db, user['id'])
    return access, refresh, {'user': _authenticated_user(user), 'workspace': workspace}


async def current_user(request: Request, db: AsyncSession = Depends(get_session)) -> Any:
    from .security.sessions import (
        active_identity,
        decode_access,
        expired,
    )
    token = request.cookies.get('flowie_access')
    if not token:
        raise ApiError(401, 'Sign in is required.', 'Unauthorized')
    user = await active_identity(db, decode_access(token, request.app.state.settings))
    if user is None:
        raise expired()
    return _runtime_user(user, request.app.state.settings)


@router.post('/register', status_code=202)
async def request_registration_verification(
    payload: RegisterInput,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    require_password_sign_in(request.app.state.settings)
    name = _normalized_name(payload.name)
    email = normalized_email(payload.email)
    timezone_name = _valid_timezone(payload.timezone) or 'UTC'
    now = utcnow()
    expires_at = now + timedelta(seconds=request.app.state.settings.registration_otp_ttl_seconds)
    code = _registration_code()
    fingerprint = _request_fingerprint(request, request.app.state.settings.auth_jwt_secret)
    try:
        async with db.begin():
            if await _find_user_by_email(db, email):
                raise ApiError(409, 'An account already exists for this email address.', 'Conflict')
            if fingerprint:
                recent_requests = await db.execute(
                    REQUEST_REGISTRATION_VERIFICATION_SELECT_REGISTRATION_VERIFICATION_TOKENS_2,
                    {'fingerprint': fingerprint, 'window_start': now - timedelta(minutes=10)},
                )
                if int(recent_requests.scalar_one()) >= 5:
                    raise ApiError(429, 'Too many registration requests. Please try again later.', 'Too Many Requests')
            existing_pending = await db.execute(
                REQUEST_REGISTRATION_VERIFICATION_SELECT_REGISTRATION_VERIFICATION_TOKENS,
                {'email': email},
            )
            last_pending = existing_pending.mappings().first()
            if last_pending and last_pending['last_sent_at'] > now - timedelta(minutes=1):
                raise ApiError(429, 'Wait one minute before requesting another verification code.', 'Too Many Requests')
            await db.execute(
                REQUEST_REGISTRATION_VERIFICATION_DELETE_REGISTRATION_VERIFICATION_TOKENS,
                {'email': email},
            )
            await db.execute(
                REQUEST_REGISTRATION_VERIFICATION_INSERT_REGISTRATION_VERIFICATION_TOKENS,
                {
                    'id': cuid(),
                    'email': email,
                    'name': name,
                    'password_hash': password_hasher.hash(payload.password),
                    'timezone': timezone_name,
                    'code_hash': hash_token(code),
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
            REQUEST_REGISTRATION_VERIFICATION_DELETE_REGISTRATION_VERIFICATION_TOKENS_2,
            {'email': email, 'code_hash': hash_token(code)},
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
    require_password_sign_in(request.app.state.settings)
    email = normalized_email(payload.email)
    now = utcnow()
    async with db.begin():
        result = await db.execute(
            VERIFY_REGISTRATION_SELECT_REGISTRATION_VERIFICATION_TOKENS,
            {'email': email},
        )
        pending = result.mappings().first()
        if not pending or pending['expires_at'] <= now:
            if pending:
                await db.execute(VERIFY_REGISTRATION_DELETE_REGISTRATION_VERIFICATION_TOKENS_2, {'id': pending['id']})
            raise ApiError(400, 'The verification code has expired. Request a new code.', 'Bad Request')
        if pending['attempt_count'] >= 5:
            raise ApiError(429, 'Too many incorrect codes. Request a new code.', 'Too Many Requests')
        if not compare_digest(pending['code_hash'], hash_token(payload.code)):
            await db.execute(
                VERIFY_REGISTRATION_UPDATE_REGISTRATION_VERIFICATION_TOKENS,
                {'id': pending['id']},
            )
            raise ApiError(400, 'The verification code is incorrect.', 'Bad Request')
        if await _find_user_by_email(db, email):
            raise ApiError(409, 'An account already exists for this email address.', 'Conflict')
        user = {
            'id': cuid(),
            'email': email,
            'name': pending['name'],
            'username': None,
            'title': None,
            'timezone': pending['timezone'],
            'avatar_url': None,
            'password_hash': pending['password_hash'],
            'is_platform_admin': _is_environment_admin(email, request.app.state.settings),
            'email_verified_at': now,
            'status': 'ACTIVE',
            'created_at': now,
        }
        await db.execute(
            VERIFY_REGISTRATION_INSERT_USERS,
            {**user, 'updated_at': now},
        )
        await db.execute(
            VERIFY_REGISTRATION_INSERT_USER_IDENTITIES,
            {'id': cuid(), 'user_id': user['id'], 'provider_account_id': email, 'email': email, 'now': now},
        )
        await create_workspace_bootstrap(
            db,
            user_id=user['id'],
            organization_name=f"{user['name']}'s organization",
            workspace_name=f"{user['name']}'s workspace",
            now=now,
        )
        await db.execute(VERIFY_REGISTRATION_DELETE_REGISTRATION_VERIFICATION_TOKENS, {'id': pending['id']})
        access_token, refresh_token, data = await _create_session(db, user, request, request.app.state.settings)

    response = JSONResponse({'data': data}, status_code=201)
    _set_cookies(response, access_token, refresh_token, request.app.state.settings)
    return response


async def _join_tenant_workspaces(db: AsyncSession, user_id: str, tenant_id: str, now: Any) -> int:
    """Adds a Microsoft account to the workspaces open to its tenant and returns how many it joined.
    `tenant_id` is the `tid` claim of a token already checked against the configured tenant, never
    the email domain. Any existing row wins, so an invitation or a suspension is left alone, and
    the blocks keep out people who were removed or left. They join as members of no team.
    VI: Thêm tài khoản Microsoft vào các workspace mở cho tenant của họ, trả về số workspace đã vào.
    VI: `tenant_id` là claim `tid` của token đã được đối chiếu với tenant cấu hình, không phải đuôi
    VI: email. Dòng đã có luôn được giữ, nên lời mời hoặc trạng thái tạm khoá không đổi, và bảng chặn
    VI: giữ người bị xoá hoặc đã tự rời ở ngoài. Họ vào với vai trò member, không thuộc team nào.
    """
    open_workspaces = await db.execute(
        JOIN_TENANT_WORKSPACES_SELECT_WORKSPACES,
        {'tenant_id': tenant_id.lower(), 'user_id': user_id},
    )
    joined = 0
    for workspace_id in open_workspaces.scalars().all():
        member_id = cuid()
        inserted = await db.execute(
            JOIN_TENANT_WORKSPACES_INSERT_WORKSPACE_MEMBERS,
            {'id': member_id, 'workspace_id': workspace_id, 'user_id': user_id, 'now': now},
        )
        if inserted.first() is None:
            continue
        await db.execute(
            JOIN_TENANT_WORKSPACES_INSERT_AUDIT_LOGS,
            {'id': cuid(), 'workspace_id': workspace_id, 'actor_id': user_id, 'entity_id': member_id, 'now': now},
        )
        joined += 1
    return joined


async def _upsert_microsoft_user(
    db: AsyncSession,
    profile: MicrosoftProfile,
    *,
    timezone_name: str | None,
    settings: Settings,
) -> str:
    provider_account_id = f'{profile.tenant_id.lower()}:{profile.object_id.lower()}'
    now = utcnow()
    async with db.begin():
        identity = await db.execute(
            UPSERT_MICROSOFT_USER_SELECT_USER_IDENTITIES,
            {'provider_account_id': provider_account_id},
        )
        user = identity.mappings().first()
        if not user:
            # Email can bootstrap an unlinked account; subsequent logins must use tenant/object identity.
            matches = (await db.execute(
                upsert_microsoft_user_select_users_sql(USER_COLUMNS),
                {'email': profile.email.lower()},
            )).mappings().all()
            if len(matches) > 1:
                raise ApiError(409, 'Multiple accounts use this email. Contact your administrator.', 'Conflict')
            user = matches[0] if matches else None
            if user:
                linked = (await db.execute(
                    UPSERT_MICROSOFT_USER_SELECT_USER_IDENTITIES_2,
                    {'id': user['id']},
                )).first()
                if linked:
                    raise ApiError(409, 'This email is already linked to another Microsoft account.', 'Conflict')
                await db.execute(
                    UPSERT_MICROSOFT_USER_INSERT_USER_IDENTITIES,
                    {
                        'id': cuid(),
                        'user_id': user['id'],
                        'provider_account_id': provider_account_id,
                        'email': profile.email,
                        'tenant_id': profile.tenant_id,
                        'now': now,
                    },
                )
            else:
                user_id = cuid()
                await db.execute(
                    UPSERT_MICROSOFT_USER_INSERT_USERS,
                    {
                        'id': user_id,
                        'email': profile.email,
                        'name': profile.name,
                        'timezone': timezone_name or 'UTC',
                        'is_platform_admin': _is_environment_admin(profile.email, settings),
                        'now': now,
                    },
                )
                await db.execute(
                    UPSERT_MICROSOFT_USER_INSERT_USER_IDENTITIES_2,
                    {
                        'id': cuid(),
                        'user_id': user_id,
                        'provider_account_id': provider_account_id,
                        'email': profile.email,
                        'tenant_id': profile.tenant_id,
                        'now': now,
                    },
                )
                # A personal workspace would make this person an owner and hide Service Desk from them.
                # VI: Workspace cá nhân sẽ biến người này thành owner và che mất Service Desk.
                if not await _join_tenant_workspaces(db, user_id, profile.tenant_id, now):
                    await create_workspace_bootstrap(
                        db,
                        user_id=user_id,
                        organization_name=f"{profile.name}'s organization",
                        workspace_name=f"{profile.name}'s workspace",
                        now=now,
                    )
                return user_id

        if user['status'] != 'ACTIVE':
            raise ApiError(403, 'This Flowie account is not active.', 'Forbidden')
        collision = (await db.execute(
            UPSERT_MICROSOFT_USER_SELECT_USERS,
            {'email': profile.email.lower(), 'id': user['id']},
        )).first()
        if collision:
            raise ApiError(409, 'This Microsoft email belongs to another Flowie account.', 'Conflict')
        if user['password_hash']:
            await db.execute(
                UPSERT_MICROSOFT_USER_UPDATE_SESSIONS,
                {'id': user['id'], 'now': now},
            )
        await db.execute(
            UPSERT_MICROSOFT_USER_UPDATE_USERS,
            {
                'id': user['id'],
                'name': profile.name,
                'email': profile.email.lower(),
                'timezone': timezone_name,
                'is_environment_admin': _is_environment_admin(profile.email, settings),
                'now': now,
            },
        )
        await db.execute(
            UPSERT_MICROSOFT_USER_DELETE_USER_IDENTITIES,
            {'id': user['id']},
        )
        await db.execute(
            UPSERT_MICROSOFT_USER_UPDATE_USER_IDENTITIES,
            {
                'provider_account_id': provider_account_id,
                'email': profile.email,
                'tenant_id': profile.tenant_id,
                'now': now,
            },
        )
        await _join_tenant_workspaces(db, user['id'], profile.tenant_id, now)
        return str(user['id'])


@router.get('/providers')
async def auth_providers(request: Request) -> dict[str, dict[str, dict[str, bool]]]:
    enabled = _microsoft_client(request.app.state.settings).enabled
    return {'data': {'microsoft': {'enabled': enabled}, 'password': {'enabled': not enabled}}}


@router.get('/microsoft/start')
async def microsoft_start(
    request: Request,
    next_path: str | None = Query(default=None, alias='next', max_length=2048),
    timezone_name: str | None = Query(default=None, alias='timezone', max_length=100),
    reauth: bool = False,
) -> RedirectResponse:
    settings = request.app.state.settings
    client = _microsoft_client(settings)
    try:
        valid_timezone = _valid_timezone(timezone_name)
        flow = await client.initiate_flow(reauthenticate=True) if reauth else await client.initiate_flow()
    except RuntimeError as error:
        raise ApiError(503, str(error), 'Service Unavailable') from error
    auth_uri = flow.get('auth_uri')
    if not isinstance(auth_uri, str):
        raise ApiError(502, 'Microsoft sign-in could not be started.', 'Bad Gateway')
    token = _microsoft_flow_token(
        flow,
        next_path=_safe_app_path(next_path),
        timezone_name=valid_timezone,
        settings=settings,
    )
    response = RedirectResponse(auth_uri, status_code=302)
    response.set_cookie(
        MICROSOFT_FLOW_COOKIE,
        token,
        max_age=MICROSOFT_FLOW_TTL_SECONDS,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite='lax',
        path=_microsoft_flow_cookie_path(settings),
    )
    return response


@router.get('/microsoft/callback')
async def microsoft_callback(
    request: Request, db: AsyncSession = Depends(get_session)
) -> RedirectResponse:
    settings = request.app.state.settings
    flow_cookie = request.cookies.get(MICROSOFT_FLOW_COOKIE)
    if not flow_cookie:
        raise ApiError(400, 'The Microsoft sign-in request has expired.', 'Bad Request')
    stored = _decode_microsoft_flow(flow_cookie, settings)
    client = _microsoft_client(settings)
    try:
        profile, graph_token = await client.complete_flow(
            stored['flow'], dict(request.query_params)
        )
        user_id = await _upsert_microsoft_user(
            db,
            profile,
            timezone_name=stored.get('timezone'),
            settings=settings,
        )
    except (RuntimeError, ValueError, httpx.HTTPError, IntegrityError, ApiError):
        await db.rollback()
        login = RedirectResponse(
            f'{settings.app_url}/auth/login?azure_error=Microsoft+sign-in+could+not+be+completed.',
            status_code=302,
        )
        login.delete_cookie(MICROSOFT_FLOW_COOKIE, path=_microsoft_flow_cookie_path(settings))
        return login

    # A transient Graph or object-storage failure must not turn identity login
    # into an outage. A 404 is authoritative and clears the previous photo.
    try:
        photo = await client.download_photo(graph_token)
        avatar_url: str | None = None
        if photo:
            avatar_url = f'avatars/{user_id}/microsoft-profile.{photo.extension}'
            await MinioStorage(settings).put(
                avatar_url, photo.body, photo.content_type
            )
        await db.execute(
            MICROSOFT_CALLBACK_UPDATE_USERS,
            {'id': user_id, 'avatar_url': avatar_url, 'now': utcnow()},
        )
        await db.commit()
    except (httpx.HTTPError, ValueError, ApiError):
        await db.rollback()

    user = await _find_user_by_id(db, user_id)
    if not user or user['status'] != 'ACTIVE':
        raise ApiError(403, 'This Flowie account is not active.', 'Forbidden')
    user = _runtime_user(user, settings)
    from .security.mfa.login import begin_login, challenge_cookie
    challenge = await begin_login(db, user, request, method='MICROSOFT', authenticated_at=profile.authenticated_at, next_path=_safe_app_path(stored.get('next')))
    if challenge:
        await db.commit()
        response = RedirectResponse(f'{settings.app_url}/auth/mfa', status_code=302)
        response.delete_cookie(MICROSOFT_FLOW_COOKIE, path=_microsoft_flow_cookie_path(settings))
        _clear_cookies(response, settings)
        challenge_cookie(response, challenge, settings)
        return response
    access_token, refresh_token, data = await _create_session(db, user, request, settings, method='MICROSOFT', authenticated_at=profile.authenticated_at)
    await db.commit()
    next_path = _safe_app_path(stored.get('next'))
    destination = next_path or '/'
    response = RedirectResponse(f'{settings.app_url}{destination}', status_code=302)
    response.delete_cookie(MICROSOFT_FLOW_COOKIE, path=_microsoft_flow_cookie_path(settings))
    _set_cookies(response, access_token, refresh_token, settings)
    return response


@router.post('/login')
async def login(payload: LoginInput, request: Request, db: AsyncSession = Depends(get_session)) -> JSONResponse:
    require_password_sign_in(request.app.state.settings)
    from .password_reset import limit_request
    from .security.events import record_event
    settings = request.app.state.settings
    email = normalized_email(payload.email)
    await limit_request(db, settings.auth_jwt_secret, 'login-ip', request.client.host if request.client else 'unknown', settings.auth_login_ip_limit)
    await limit_request(db, settings.auth_jwt_secret, 'login-account', email, settings.auth_login_account_limit)
    user = await _find_user_by_email(db, email)
    if not user or not user['password_hash'] or user['status'] != 'ACTIVE':
        await record_event(db, user['id'] if user else None, 'LOGIN_FAILED', 'PASSWORD', request)
        await db.commit()
        raise ApiError(401, 'Invalid email or password.', 'Unauthorized')
    import asyncio
    password_matches = await asyncio.to_thread(verify_password, user['password_hash'], payload.password)
    if not password_matches:
        await record_event(db, user['id'], 'LOGIN_FAILED', 'PASSWORD', request)
        await db.commit()
        raise ApiError(401, 'Invalid email or password.', 'Unauthorized')

    user = _runtime_user(user, request.app.state.settings)
    from .security.mfa.login import begin_login, challenge_cookie
    challenge = await begin_login(db, user, request, method='PASSWORD', next_path=_safe_app_path(payload.next))
    if challenge:
        await db.commit()
        response = JSONResponse({'data': {'mfaRequired': True}})
        _clear_cookies(response, settings)
        challenge_cookie(response, challenge, settings)
        return response
    timezone_name = _valid_timezone(payload.timezone)
    await db.execute(
        LOGIN_UPDATE_USERS,
        {
            'id': user['id'],
            'now': utcnow(),
            'timezone': timezone_name,
            'is_platform_admin': user['is_platform_admin'],
        },
    )
    access_token, refresh_token, data = await _create_session(db, user, request, request.app.state.settings)
    await db.commit()
    response = JSONResponse({'data': data})
    _set_cookies(response, access_token, refresh_token, request.app.state.settings)
    return response


@router.post('/presence')
async def refresh_presence(
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, datetime]]:
    """Persist an explicit browser heartbeat without marking background API reads as activity."""
    now = utcnow()
    await db.execute(
        REFRESH_PRESENCE_UPDATE_USERS,
        {'id': user['id'], 'now': now},
    )
    await db.commit()
    return {'data': {'lastSeenAt': now}}


@router.post('/refresh')
async def refresh(
    request: Request, payload: RefreshInput | None = None, db: AsyncSession = Depends(get_session)
) -> JSONResponse:
    from .security.sessions import expired, rotate_session
    refresh_token = (payload.refreshToken if payload else None) or request.cookies.get('flowie_refresh')
    if not refresh_token:
        raise expired()
    settings = request.app.state.settings
    access, replacement, user = await rotate_session(db, refresh_token, request, settings)
    user = _runtime_user(user, settings)
    data = {'user': _authenticated_user(user), 'workspace': await _first_workspace(db, user['id'])}
    await db.commit()
    response = JSONResponse({'data': data})
    _set_cookies(response, access, replacement, settings)
    return response


@router.post('/logout', status_code=204)
async def logout(request: Request, db: AsyncSession = Depends(get_session)) -> Response:
    from ...services.notification_events import notification_hub
    from .security.sessions import logout_session
    owner = await logout_session(db, request, request.app.state.settings)
    await db.commit()
    if owner:
        await notification_hub.close_user(owner)
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
    current_hash = hash_token(current_refresh) if current_refresh else None
    result = await db.execute(
        LIST_SESSIONS_SELECT_SESSIONS,
        {'user_id': user['id'], 'now': utcnow()},
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
    request: Request, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, dict[str, int]]:
    from ...services.notification_events import notification_hub
    from .security.sessions import revoke_sessions
    rows = await revoke_sessions(db, user, request)
    await db.commit()
    await notification_hub.close_user(user['id'])
    return {'data': {'revoked': len(rows)}}


@router.delete('/sessions/{session_id}')
async def revoke_session(
    session_id: str, request: Request, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, dict[str, Any]]:
    from ...services.notification_events import notification_hub
    from .security.sessions import revoke_sessions
    await revoke_sessions(db, user, request, identifier=session_id)
    await db.commit()
    await notification_hub.close_user(user['id'])
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
        LIST_API_KEYS_SELECT_PERSONAL_API_KEYS,
        {'user_id': user['id'], 'now': utcnow()},
    )
    return {'data': [_api_key(row) for row in result.mappings().all()]}


@router.post('/api-keys')
async def create_api_key(
    payload: CreateApiKeyInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, dict[str, Any]]:
    raise ApiError(410, 'Legacy personal API key issuance is retired. Use scoped AI connections in Integrations.', 'Gone')


@router.delete('/api-keys/{key_id}')
async def revoke_api_key(
    key_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    result = await db.execute(
        REVOKE_API_KEY_UPDATE_PERSONAL_API_KEYS,
        {'id': key_id, 'user_id': user['id'], 'now': utcnow()},
    )
    if not result.scalar_one_or_none():
        raise ApiError(404, 'API key not found.', 'Not Found')
    await db.commit()
    return {'data': {'id': key_id, 'revoked': True}}
