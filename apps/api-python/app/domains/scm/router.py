from __future__ import annotations

import json
import re
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from ...db.session import get_session
from ..auth import _cuid, _utcnow, current_user
from ..native_projects import _workspace_manager
from .contracts import read_only_capabilities
from .security import (
    decrypt_secret_bundle,
    encrypt_secret_bundle,
    new_webhook_secret,
    payload_hash,
    verify_azure_basic_auth,
    verify_github_signature,
)
from .service import connection_row, sync_connection


router = APIRouter(prefix='/api/v1/scm', tags=['source-control'])
webhook_router = APIRouter(prefix='/api/v1/scm/webhooks', tags=['source-control-webhooks'])
ProviderName = Literal['GITHUB', 'AZURE_DEVOPS']
AuthMode = Literal['INSTALLATION', 'SERVICE_PRINCIPAL', 'MANAGED_IDENTITY']
MAX_WEBHOOK_BYTES = 2 * 1024 * 1024
AZURE_ORGANIZATION = re.compile(r'^[A-Za-z0-9][A-Za-z0-9-]{0,49}$')
GITHUB_EVENTS = {'pull_request', 'pull_request_review', 'pull_request_review_thread'}
AZURE_EVENTS = {'git.pullrequest.created', 'git.pullrequest.updated', 'git.pullrequest.merged'}


class ConnectionInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    workspaceId: str = Field(min_length=1)
    provider: ProviderName
    externalAccountId: str = Field(min_length=1, max_length=200)
    displayName: str = Field(min_length=1, max_length=200)
    authMode: AuthMode
    settings: dict[str, str] = Field(default_factory=dict)
    clientSecret: str | None = Field(default=None, min_length=8, max_length=4000)


class RepositoryInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    enabled: bool
    teamId: str | None = None


class CredentialRotationInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    clientSecret: str | None = Field(default=None, min_length=8, max_length=4000)
    rotateWebhookSecret: bool = False


class IdentityInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    externalUserId: str = Field(min_length=1, max_length=300)
    displayName: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=320)


async def _audit(
    db: AsyncSession,
    workspace_id: str,
    actor_id: str,
    action: str,
    entity_id: str,
    metadata: dict[str, Any],
) -> None:
    await db.execute(
        text(
            '''INSERT INTO audit_logs (
                   id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at
               ) VALUES (
                   :id, :workspace_id, :actor_id, :action, 'scm-connection', :entity_id,
                   CAST(:metadata AS jsonb), :now
               )'''
        ),
        {
            'id': _cuid(),
            'workspace_id': workspace_id,
            'actor_id': actor_id,
            'action': action,
            'entity_id': entity_id,
            'metadata': json.dumps(metadata),
            'now': _utcnow(),
        },
    )


def _validated_connection(payload: ConnectionInput, request: Request) -> tuple[dict[str, str], dict[str, str]]:
    settings = {key: value.strip() for key, value in payload.settings.items() if value.strip()}
    allowed = {'organization', 'tenantId', 'clientId'} if payload.provider == 'AZURE_DEVOPS' else set()
    unknown = set(settings) - allowed
    if unknown:
        raise ApiError(400, f'Unsupported connection setting(s): {", ".join(sorted(unknown))}.', 'Bad Request')
    if payload.provider == 'GITHUB':
        if payload.authMode != 'INSTALLATION' or not payload.externalAccountId.isdigit():
            raise ApiError(400, 'GitHub connections require a numeric GitHub App installation ID.', 'Bad Request')
        if payload.clientSecret:
            raise ApiError(400, 'GitHub App installation credentials are configured on the server.', 'Bad Request')
        if not request.app.state.settings.scm_github_app_id or not request.app.state.settings.scm_github_app_private_key:
            raise ApiError(503, 'Configure the GitHub App ID and private key before adding an installation.', 'Service Unavailable')
        return {}, {}
    organization = settings.get('organization', '')
    if not AZURE_ORGANIZATION.fullmatch(organization):
        raise ApiError(400, 'Azure DevOps organization is invalid.', 'Bad Request')
    if payload.externalAccountId.casefold() != organization.casefold():
        raise ApiError(400, 'Azure DevOps externalAccountId must match the organization name.', 'Bad Request')
    if payload.authMode == 'SERVICE_PRINCIPAL':
        if not settings.get('tenantId') or not settings.get('clientId') or not payload.clientSecret:
            raise ApiError(400, 'Azure DevOps service-principal tenant, client ID, and secret are required.', 'Bad Request')
    elif payload.authMode == 'MANAGED_IDENTITY':
        if payload.clientSecret or settings.get('tenantId'):
            raise ApiError(400, 'Managed identity connections do not accept a tenant or client secret.', 'Bad Request')
    else:
        raise ApiError(400, 'Azure DevOps requires a service principal or managed identity.', 'Bad Request')
    webhook_secret = new_webhook_secret()
    bundle = {'webhookSecret': webhook_secret}
    if payload.clientSecret:
        bundle['clientSecret'] = payload.clientSecret
    return settings, bundle


def _connection_view(row: Any) -> dict[str, Any]:
    provider = row['provider']
    return {
        'id': row['id'],
        'workspaceId': row['workspace_id'],
        'provider': provider,
        'externalAccountId': row['external_account_id'],
        'displayName': row['display_name'],
        'status': row['status'],
        'authMode': row['auth_mode'],
        'settings': row['settings'],
        'credentialConfigured': bool(row.get('encrypted_value')) or provider == 'GITHUB',
        'capabilities': read_only_capabilities(provider).model_dump(),
        'repositoryCount': int(row.get('repository_count') or 0),
        'enabledRepositoryCount': int(row.get('enabled_repository_count') or 0),
        'lastSyncedAt': row['last_synced_at'],
        'lastError': row['last_error'],
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
    }


@router.get('/connections')
async def list_connections(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_manager(db, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''SELECT connection.*, secret.encrypted_value,
                      COUNT(repository.id) AS repository_count,
                      COUNT(repository.id) FILTER (WHERE repository.enabled = true) AS enabled_repository_count
               FROM scm_connections connection
               LEFT JOIN scm_connection_secrets secret ON secret.connection_id = connection.id
               LEFT JOIN scm_repositories repository
                 ON repository.connection_id = connection.id AND repository.archived_at IS NULL
               WHERE connection.workspace_id = :workspace_id
               GROUP BY connection.id, secret.encrypted_value
               ORDER BY connection.created_at ASC'''
        ),
        {'workspace_id': workspaceId},
    )
    return {'data': [_connection_view(row) for row in result.mappings().all()]}


@router.post('/connections', status_code=201)
async def create_connection(
    payload: ConnectionInput,
    request: Request,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    await _workspace_manager(db, payload.workspaceId, user['id'])
    connection_settings, bundle = _validated_connection(payload, request)
    now = _utcnow()
    connection_id = _cuid()
    try:
        await db.execute(
            text(
                '''INSERT INTO scm_connections (
                       id, workspace_id, provider, external_account_id, display_name, status,
                       auth_mode, settings, created_by_id, created_at, updated_at
                   ) VALUES (
                       :id, :workspace_id, CAST(:provider AS "ScmProvider"), :external_account_id,
                       :display_name, 'ACTIVE', CAST(:auth_mode AS "ScmAuthMode"), CAST(:settings AS jsonb),
                       :created_by_id, :now, :now
                   )'''
            ),
            {
                'id': connection_id,
                'workspace_id': payload.workspaceId,
                'provider': payload.provider,
                'external_account_id': payload.externalAccountId.strip(),
                'display_name': payload.displayName.strip(),
                'auth_mode': payload.authMode,
                'settings': json.dumps(connection_settings),
                'created_by_id': user['id'],
                'now': now,
            },
        )
        if bundle:
            await db.execute(
                text(
                    '''INSERT INTO scm_connection_secrets (
                           id, connection_id, encrypted_value, key_version, created_at, updated_at
                       ) VALUES (:id, :connection_id, :encrypted_value, 1, :now, :now)'''
                ),
                {
                    'id': _cuid(),
                    'connection_id': connection_id,
                    'encrypted_value': encrypt_secret_bundle(request.app.state.settings, bundle),
                    'now': now,
                },
            )
        await _audit(
            db,
            payload.workspaceId,
            user['id'],
            'scm.connection.created',
            connection_id,
            {'provider': payload.provider, 'externalAccountId': payload.externalAccountId},
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'This provider account is already connected to the workspace.', 'Conflict') from error
    row = await connection_row(db, connection_id, payload.workspaceId)
    data = _connection_view(row)
    data['webhookPath'] = f'/api/v1/scm/webhooks/{payload.provider.lower().replace("_devops", "")}/{connection_id}'
    if payload.provider == 'AZURE_DEVOPS':
        data['webhookUsername'] = 'flowie'
        data['webhookSecret'] = bundle['webhookSecret']
    return JSONResponse({'data': data}, status_code=201)


@router.get('/repositories')
async def list_repositories(
    workspaceId: str = Query(min_length=1),
    connectionId: str | None = Query(default=None),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_manager(db, workspaceId, user['id'])
    connection_clause = 'AND repository.connection_id = :connection_id' if connectionId else ''
    result = await db.execute(
        text(
            f'''SELECT repository.*, connection.provider, connection.display_name AS connection_name,
                       team.name AS team_name
                FROM scm_repositories repository
                JOIN scm_connections connection ON connection.id = repository.connection_id
                LEFT JOIN teams team ON team.id = repository.team_id
                WHERE repository.workspace_id = :workspace_id AND repository.archived_at IS NULL
                  {connection_clause}
                ORDER BY connection.provider, repository.full_name'''
        ),
        {'workspace_id': workspaceId, 'connection_id': connectionId},
    )
    return {
        'data': [
            {
                'id': row['id'],
                'connectionId': row['connection_id'],
                'provider': row['provider'],
                'connectionName': row['connection_name'],
                'externalProjectId': row['external_project_id'],
                'externalRepositoryId': row['external_repository_id'],
                'name': row['name'],
                'fullName': row['full_name'],
                'isPrivate': row['is_private'],
                'defaultBranch': row['default_branch'],
                'enabled': row['enabled'],
                'teamId': row['team_id'],
                'teamName': row['team_name'],
            }
            for row in result.mappings().all()
        ]
    }


@router.get('/identities')
async def list_identities(
    workspaceId: str = Query(min_length=1),
    connectionId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_manager(db, workspaceId, user['id'])
    await connection_row(db, connectionId, workspaceId)
    result = await db.execute(
        text(
            '''SELECT identity.*, account.name AS flowie_name, account.email AS flowie_email
               FROM scm_user_identities identity
               JOIN users account ON account.id = identity.user_id
               WHERE identity.connection_id = :connection_id
               ORDER BY account.name, account.email'''
        ),
        {'connection_id': connectionId},
    )
    return {
        'data': [
            {
                'id': row['id'],
                'connectionId': row['connection_id'],
                'userId': row['user_id'],
                'flowieName': row['flowie_name'],
                'flowieEmail': row['flowie_email'],
                'externalUserId': row['external_user_id'],
                'displayName': row['display_name'],
                'email': row['email'],
                'updatedAt': row['updated_at'],
            }
            for row in result.mappings().all()
        ]
    }


@router.put('/connections/{connection_id}/identities/{user_id}')
async def save_identity(
    connection_id: str,
    user_id: str,
    payload: IdentityInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    await connection_row(db, connection_id, workspaceId)
    member = await db.execute(
        text(
            '''SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE' '''
        ),
        {'workspace_id': workspaceId, 'user_id': user_id},
    )
    if member.scalar_one_or_none() is None:
        raise ApiError(400, 'The selected user is not an active workspace member.', 'Bad Request')
    now = _utcnow()
    try:
        result = await db.execute(
            text(
                '''INSERT INTO scm_user_identities (
                       id, workspace_id, connection_id, user_id, external_user_id,
                       display_name, email, created_at, updated_at
                   ) VALUES (
                       :id, :workspace_id, :connection_id, :user_id, :external_user_id,
                       :display_name, :email, :now, :now
                   ) ON CONFLICT (connection_id, user_id) DO UPDATE SET
                       external_user_id = EXCLUDED.external_user_id,
                       display_name = EXCLUDED.display_name, email = EXCLUDED.email,
                       updated_at = EXCLUDED.updated_at
                   RETURNING id, user_id, external_user_id, display_name, email, updated_at'''
            ),
            {
                'id': _cuid(),
                'workspace_id': workspaceId,
                'connection_id': connection_id,
                'user_id': user_id,
                'external_user_id': payload.externalUserId.strip(),
                'display_name': payload.displayName.strip() if payload.displayName else None,
                'email': payload.email.strip().lower() if payload.email else None,
                'now': now,
            },
        )
        row = result.mappings().one()
        await db.execute(
            text(
                '''UPDATE code_review_reviewers reviewer
                   SET flowie_user_id = NULL, updated_at = :now
                   FROM code_reviews review
                   JOIN scm_repositories repository ON repository.id = review.repository_id
                   WHERE reviewer.code_review_id = review.id
                     AND repository.connection_id = :connection_id
                     AND reviewer.flowie_user_id = :user_id'''
            ),
            {'user_id': user_id, 'connection_id': connection_id, 'now': now},
        )
        await db.execute(
            text(
                '''UPDATE code_review_reviewers reviewer
                   SET flowie_user_id = :user_id, updated_at = :now
                   FROM code_reviews review
                   JOIN scm_repositories repository ON repository.id = review.repository_id
                   WHERE reviewer.code_review_id = review.id
                     AND repository.connection_id = :connection_id
                     AND reviewer.external_user_id = :external_user_id'''
            ),
            {
                'user_id': user_id,
                'connection_id': connection_id,
                'external_user_id': payload.externalUserId.strip(),
                'now': now,
            },
        )
        await _audit(
            db,
            workspaceId,
            user['id'],
            'scm.identity.mapped',
            connection_id,
            {'userId': user_id, 'externalUserId': payload.externalUserId},
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'This provider identity is already mapped to another Flowie user.', 'Conflict') from error
    return {
        'data': {
            'id': row['id'],
            'userId': row['user_id'],
            'externalUserId': row['external_user_id'],
            'displayName': row['display_name'],
            'email': row['email'],
            'updatedAt': row['updated_at'],
        }
    }


@router.delete('/connections/{connection_id}/identities/{user_id}')
async def delete_identity(
    connection_id: str,
    user_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    await connection_row(db, connection_id, workspaceId)
    result = await db.execute(
        text(
            '''DELETE FROM scm_user_identities
               WHERE connection_id = :connection_id AND user_id = :user_id RETURNING id'''
        ),
        {'connection_id': connection_id, 'user_id': user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(404, 'Source-control identity mapping not found.', 'Not Found')
    await db.execute(
        text(
            '''UPDATE code_review_reviewers reviewer
               SET flowie_user_id = NULL, updated_at = :now
               FROM code_reviews review
               JOIN scm_repositories repository ON repository.id = review.repository_id
               WHERE reviewer.code_review_id = review.id
                 AND repository.connection_id = :connection_id
                 AND reviewer.flowie_user_id = :user_id'''
        ),
        {'connection_id': connection_id, 'user_id': user_id, 'now': _utcnow()},
    )
    await _audit(
        db,
        workspaceId,
        user['id'],
        'scm.identity.unmapped',
        connection_id,
        {'userId': user_id},
    )
    await db.commit()
    return {'data': {'connectionId': connection_id, 'userId': user_id, 'deleted': True}}


@router.patch('/connections/{connection_id}/credentials')
async def rotate_connection_credentials(
    connection_id: str,
    payload: CredentialRotationInput,
    request: Request,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    connection = await connection_row(db, connection_id, workspaceId)
    if connection['provider'] != 'AZURE_DEVOPS':
        raise ApiError(400, 'GitHub App credentials are rotated in the server environment.', 'Bad Request')
    if not payload.clientSecret and not payload.rotateWebhookSecret:
        raise ApiError(400, 'Provide a new client secret or request webhook-secret rotation.', 'Bad Request')
    if payload.clientSecret and connection['auth_mode'] != 'SERVICE_PRINCIPAL':
        raise ApiError(400, 'Managed identity connections do not use a client secret.', 'Bad Request')
    bundle = decrypt_secret_bundle(request.app.state.settings, connection['encrypted_value'])
    if payload.clientSecret:
        bundle['clientSecret'] = payload.clientSecret
    webhook_secret: str | None = None
    if payload.rotateWebhookSecret:
        webhook_secret = new_webhook_secret()
        bundle['webhookSecret'] = webhook_secret
    await db.execute(
        text(
            '''UPDATE scm_connection_secrets
               SET encrypted_value = :encrypted_value, key_version = key_version + 1, updated_at = :now
               WHERE connection_id = :connection_id'''
        ),
        {
            'connection_id': connection_id,
            'encrypted_value': encrypt_secret_bundle(request.app.state.settings, bundle),
            'now': _utcnow(),
        },
    )
    await _audit(
        db,
        workspaceId,
        user['id'],
        'scm.connection.credentials-rotated',
        connection_id,
        {
            'clientSecretRotated': bool(payload.clientSecret),
            'webhookSecretRotated': payload.rotateWebhookSecret,
        },
    )
    await db.commit()
    data: dict[str, Any] = {'id': connection_id, 'credentialConfigured': bool(bundle.get('clientSecret'))}
    if webhook_secret:
        data['webhookUsername'] = 'flowie'
        data['webhookSecret'] = webhook_secret
    return {'data': data}


@router.post('/connections/{connection_id}/reactivate')
async def reactivate_connection(
    connection_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    await connection_row(db, connection_id, workspaceId)
    now = _utcnow()
    await db.execute(
        text(
            '''UPDATE scm_connections
               SET status = 'ACTIVE', last_error = NULL, updated_at = :now WHERE id = :id'''
        ),
        {'id': connection_id, 'now': now},
    )
    await _audit(db, workspaceId, user['id'], 'scm.connection.reactivated', connection_id, {})
    await db.commit()
    return {'data': {'id': connection_id, 'status': 'ACTIVE'}}


@router.patch('/repositories/{repository_id}')
async def update_repository(
    repository_id: str,
    payload: RepositoryInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    current = await db.execute(
        text(
            '''SELECT repository.id, repository.connection_id, repository.full_name, repository.team_id
               FROM scm_repositories repository
               JOIN scm_connections connection ON connection.id = repository.connection_id
               WHERE repository.id = :id AND repository.workspace_id = :workspace_id
                 AND repository.archived_at IS NULL AND connection.status = 'ACTIVE' '''
        ),
        {'id': repository_id, 'workspace_id': workspaceId},
    )
    repository = current.mappings().first()
    if not repository:
        raise ApiError(404, 'Repository not found.', 'Not Found')
    team_id = payload.teamId if payload.teamId is not None else repository['team_id']
    if payload.enabled and not team_id:
        raise ApiError(400, 'Map the repository to a Flowie team before enabling Reviews.', 'Bad Request')
    if team_id:
        team = await db.execute(
            text(
                '''SELECT 1 FROM teams WHERE id = :team_id AND workspace_id = :workspace_id
                   AND deleted_at IS NULL AND archived_at IS NULL'''
            ),
            {'team_id': team_id, 'workspace_id': workspaceId},
        )
        if team.scalar_one_or_none() is None:
            raise ApiError(400, 'The selected team is not available in this workspace.', 'Bad Request')
    await db.execute(
        text(
            '''UPDATE scm_repositories SET enabled = :enabled, team_id = :team_id, updated_at = :now
               WHERE id = :id'''
        ),
        {'id': repository_id, 'enabled': payload.enabled, 'team_id': team_id, 'now': _utcnow()},
    )
    await _audit(
        db,
        workspaceId,
        user['id'],
        'scm.repository.updated',
        repository_id,
        {'enabled': payload.enabled, 'teamId': team_id, 'fullName': repository['full_name']},
    )
    await db.commit()
    return {'data': {'id': repository_id, 'enabled': payload.enabled, 'teamId': team_id}}


@router.post('/connections/{connection_id}/sync')
async def synchronize_connection(
    connection_id: str,
    request: Request,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, int]]:
    await _workspace_manager(db, workspaceId, user['id'])
    await connection_row(db, connection_id, workspaceId)
    result = await sync_connection(db, connection_id, request.app.state.settings)
    await _audit(db, workspaceId, user['id'], 'scm.connection.synchronized', connection_id, result)
    await db.commit()
    return {'data': result}


@router.delete('/connections/{connection_id}')
async def disconnect(
    connection_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    await connection_row(db, connection_id, workspaceId)
    now = _utcnow()
    await db.execute(
        text("UPDATE scm_connections SET status = 'REVOKED', updated_at = :now WHERE id = :id"),
        {'id': connection_id, 'now': now},
    )
    await db.execute(
        text('UPDATE scm_repositories SET enabled = false, updated_at = :now WHERE connection_id = :id'),
        {'id': connection_id, 'now': now},
    )
    await _audit(db, workspaceId, user['id'], 'scm.connection.revoked', connection_id, {})
    await db.commit()
    return {'data': {'id': connection_id, 'status': 'REVOKED'}}


async def _webhook_payload(request: Request) -> tuple[bytes, dict[str, Any]]:
    content_length = request.headers.get('content-length')
    if content_length:
        try:
            if int(content_length) > MAX_WEBHOOK_BYTES:
                raise ApiError(413, 'Webhook payload is too large.', 'Payload Too Large')
        except ValueError as error:
            raise ApiError(400, 'Webhook Content-Length is invalid.', 'Bad Request') from error
    raw = await request.body()
    if len(raw) > MAX_WEBHOOK_BYTES:
        raise ApiError(413, 'Webhook payload is too large.', 'Payload Too Large')
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ApiError(400, 'Webhook payload must be valid JSON.', 'Bad Request') from error
    if not isinstance(payload, dict):
        raise ApiError(400, 'Webhook payload must be a JSON object.', 'Bad Request')
    return raw, payload


async def _save_delivery(
    db: AsyncSession,
    *,
    connection: Any,
    external_delivery_id: str,
    event_type: str,
    action: str | None,
    raw: bytes,
    payload: dict[str, Any],
    relevant: bool,
) -> bool:
    result = await db.execute(
        text(
            '''INSERT INTO scm_webhook_deliveries (
                   id, connection_id, external_delivery_id, event_type, action, status, payload,
                   payload_hash, attempts, next_attempt_at, received_at
               ) VALUES (
                   :id, :connection_id, :external_delivery_id, :event_type, :action,
                   CAST(:status AS "ScmDeliveryStatus"), CAST(:payload AS jsonb), :payload_hash,
                   0, :now, :now
               ) ON CONFLICT (connection_id, external_delivery_id) DO NOTHING
               RETURNING id'''
        ),
        {
            'id': _cuid(),
            'connection_id': connection['id'],
            'external_delivery_id': external_delivery_id,
            'event_type': event_type,
            'action': action,
            'status': 'PENDING' if relevant else 'IGNORED',
            'payload': json.dumps(payload),
            'payload_hash': payload_hash(raw),
            'now': _utcnow(),
        },
    )
    created = result.scalar_one_or_none() is not None
    await db.commit()
    return created


@webhook_router.post('/github/{connection_id}', status_code=202)
async def github_webhook(
    connection_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    raw, payload = await _webhook_payload(request)
    settings = request.app.state.settings
    if not verify_github_signature(settings.scm_github_webhook_secret, raw, request.headers.get('x-hub-signature-256')):
        raise ApiError(401, 'GitHub webhook signature is invalid.', 'Unauthorized')
    connection = await connection_row(db, connection_id)
    if connection['provider'] != 'GITHUB' or connection['status'] != 'ACTIVE':
        raise ApiError(404, 'Active GitHub connection not found.', 'Not Found')
    installation_id = str((payload.get('installation') or {}).get('id') or '')
    if installation_id and installation_id != connection['external_account_id']:
        raise ApiError(403, 'Webhook installation does not match this connection.', 'Forbidden')
    delivery_id = request.headers.get('x-github-delivery')
    event_type = request.headers.get('x-github-event')
    if not delivery_id or not event_type:
        raise ApiError(400, 'GitHub delivery and event headers are required.', 'Bad Request')
    created = await _save_delivery(
        db,
        connection=connection,
        external_delivery_id=delivery_id,
        event_type=event_type,
        action=payload.get('action'),
        raw=raw,
        payload=payload,
        relevant=event_type in GITHUB_EVENTS,
    )
    return JSONResponse({'data': {'accepted': True, 'duplicate': not created}}, status_code=202)


@webhook_router.post('/azure/{connection_id}', status_code=202)
async def azure_webhook(
    connection_id: str,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    raw, payload = await _webhook_payload(request)
    connection = await connection_row(db, connection_id)
    if connection['provider'] != 'AZURE_DEVOPS' or connection['status'] != 'ACTIVE':
        raise ApiError(404, 'Active Azure DevOps connection not found.', 'Not Found')
    bundle = decrypt_secret_bundle(request.app.state.settings, connection['encrypted_value'])
    if not verify_azure_basic_auth(bundle.get('webhookSecret', ''), request.headers.get('authorization')):
        raise ApiError(401, 'Azure DevOps webhook credentials are invalid.', 'Unauthorized')
    event_type = str(payload.get('eventType') or '')
    delivery_id = str(payload.get('id') or '')
    if not event_type or not delivery_id:
        raise ApiError(400, 'Azure DevOps eventType and delivery ID are required.', 'Bad Request')
    created = await _save_delivery(
        db,
        connection=connection,
        external_delivery_id=delivery_id,
        event_type=event_type,
        action=None,
        raw=raw,
        payload=payload,
        relevant=event_type in AZURE_EVENTS,
    )
    return JSONResponse({'data': {'accepted': True, 'duplicate': not created}}, status_code=202)
