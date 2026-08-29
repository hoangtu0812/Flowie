from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import Settings
from ...core.errors import ApiError
from ..auth import _cuid, _utcnow
from .contracts import ProviderRepository, ProviderReview, ReviewProvider
from .providers import AzureDevOpsProvider, GitHubProvider
from .security import decrypt_secret_bundle


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def provider_for(
    connection: Any,
    settings: Settings,
    secret_bundle: dict[str, str],
    *,
    client: httpx.AsyncClient | None = None,
) -> ReviewProvider:
    provider = connection['provider']
    connection_settings = connection['settings'] or {}
    if provider == 'GITHUB':
        try:
            return GitHubProvider(
                app_id=settings.scm_github_app_id,
                private_key=settings.scm_github_app_private_key,
                installation_id=connection['external_account_id'],
                client=client,
            )
        except ValueError as error:
            raise ApiError(503, str(error), 'Service Unavailable') from error
    if provider == 'AZURE_DEVOPS':
        return AzureDevOpsProvider(
            organization=connection_settings.get('organization', ''),
            auth_mode=connection['auth_mode'],
            tenant_id=connection_settings.get('tenantId'),
            client_id=connection_settings.get('clientId'),
            client_secret=secret_bundle.get('clientSecret'),
            client=client,
        )
    raise ApiError(400, 'Unsupported source-control provider.', 'Bad Request')


async def connection_row(db: AsyncSession, connection_id: str, workspace_id: str | None = None) -> Any:
    workspace_clause = 'AND connection.workspace_id = :workspace_id' if workspace_id else ''
    result = await db.execute(
        text(
            f'''SELECT connection.*, secret.encrypted_value
                FROM scm_connections connection
                LEFT JOIN scm_connection_secrets secret ON secret.connection_id = connection.id
                WHERE connection.id = :connection_id {workspace_clause}'''
        ),
        {'connection_id': connection_id, 'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Source-control connection not found.', 'Not Found')
    return row


async def upsert_repository(
    db: AsyncSession,
    connection: Any,
    repository: ProviderRepository,
) -> str:
    now = _utcnow()
    result = await db.execute(
        text(
            '''INSERT INTO scm_repositories (
                   id, workspace_id, connection_id, external_project_id, external_repository_id,
                   name, full_name, is_private, default_branch, created_at, updated_at
               ) VALUES (
                   :id, :workspace_id, :connection_id, :external_project_id, :external_repository_id,
                   :name, :full_name, :is_private, :default_branch, :now, :now
               ) ON CONFLICT (connection_id, external_repository_id) DO UPDATE SET
                   external_project_id = EXCLUDED.external_project_id,
                   name = EXCLUDED.name, full_name = EXCLUDED.full_name,
                   is_private = EXCLUDED.is_private, default_branch = EXCLUDED.default_branch,
                   archived_at = NULL, updated_at = EXCLUDED.updated_at
               RETURNING id'''
        ),
        {
            'id': _cuid(),
            'workspace_id': connection['workspace_id'],
            'connection_id': connection['id'],
            'external_project_id': repository.externalProjectId,
            'external_repository_id': repository.externalRepositoryId,
            'name': repository.name,
            'full_name': repository.fullName,
            'is_private': repository.isPrivate,
            'default_branch': repository.defaultBranch,
            'now': now,
        },
    )
    return str(result.scalar_one())


async def upsert_review(db: AsyncSession, repository: Any, review: ProviderReview) -> str:
    now = _utcnow()
    result = await db.execute(
        text(
            '''INSERT INTO code_reviews (
                   id, workspace_id, repository_id, external_review_id, number, title, description,
                   state, is_draft, external_author_id, author_name, source_ref, target_ref,
                   head_revision, latest_revision_key, remote_url, additions, deletions, changed_files,
                   external_created_at, external_updated_at, merged_at, closed_at, created_at, updated_at
               ) VALUES (
                   :id, :workspace_id, :repository_id, :external_review_id, :number, :title, :description,
                   CAST(:state AS "CodeReviewState"), :is_draft, :external_author_id, :author_name,
                   :source_ref, :target_ref, :head_revision, :latest_revision_key, :remote_url,
                   :additions, :deletions, :changed_files, :external_created_at, :external_updated_at,
                   :merged_at, :closed_at, :now, :now
               ) ON CONFLICT (repository_id, external_review_id) DO UPDATE SET
                   number = EXCLUDED.number, title = EXCLUDED.title, description = EXCLUDED.description,
                   state = EXCLUDED.state, is_draft = EXCLUDED.is_draft,
                   external_author_id = EXCLUDED.external_author_id, author_name = EXCLUDED.author_name,
                   source_ref = EXCLUDED.source_ref, target_ref = EXCLUDED.target_ref,
                   head_revision = EXCLUDED.head_revision, latest_revision_key = EXCLUDED.latest_revision_key,
                   remote_url = EXCLUDED.remote_url, additions = EXCLUDED.additions,
                   deletions = EXCLUDED.deletions, changed_files = EXCLUDED.changed_files,
                   external_created_at = EXCLUDED.external_created_at,
                   external_updated_at = EXCLUDED.external_updated_at,
                   merged_at = EXCLUDED.merged_at, closed_at = EXCLUDED.closed_at,
                   updated_at = EXCLUDED.updated_at
               RETURNING id'''
        ),
        {
            'id': _cuid(),
            'workspace_id': repository['workspace_id'],
            'repository_id': repository['id'],
            'external_review_id': review.externalReviewId,
            'number': review.number,
            'title': review.title,
            'description': review.description,
            'state': review.state,
            'is_draft': review.isDraft,
            'external_author_id': review.externalAuthorId,
            'author_name': review.authorName,
            'source_ref': review.sourceRef,
            'target_ref': review.targetRef,
            'head_revision': review.headRevision,
            'latest_revision_key': review.latestRevisionKey,
            'remote_url': review.remoteUrl,
            'additions': review.additions,
            'deletions': review.deletions,
            'changed_files': review.changedFiles,
            'external_created_at': _naive_utc(review.externalCreatedAt),
            'external_updated_at': _naive_utc(review.externalUpdatedAt),
            'merged_at': _naive_utc(review.mergedAt),
            'closed_at': _naive_utc(review.closedAt),
            'now': now,
        },
    )
    review_id = str(result.scalar_one())
    reviewer_ids: list[str] = []
    for reviewer in review.reviewers:
        reviewer_ids.append(reviewer.externalUserId)
        identity = await db.execute(
            text(
                '''SELECT user_id FROM scm_user_identities
                   WHERE connection_id = :connection_id AND external_user_id = :external_user_id'''
            ),
            {
                'connection_id': repository['connection_id'],
                'external_user_id': reviewer.externalUserId,
            },
        )
        await db.execute(
            text(
                '''INSERT INTO code_review_reviewers (
                       id, code_review_id, flowie_user_id, external_user_id, display_name,
                       reviewer_kind, is_required, decision, provider_decision, updated_at
                   ) VALUES (
                       :id, :code_review_id, :flowie_user_id, :external_user_id, :display_name,
                       :reviewer_kind, :is_required, CAST(:decision AS "CodeReviewDecision"),
                       :provider_decision, :now
                   ) ON CONFLICT (code_review_id, external_user_id) DO UPDATE SET
                       flowie_user_id = EXCLUDED.flowie_user_id, display_name = EXCLUDED.display_name,
                       reviewer_kind = EXCLUDED.reviewer_kind, is_required = EXCLUDED.is_required,
                       decision = EXCLUDED.decision, provider_decision = EXCLUDED.provider_decision,
                       updated_at = EXCLUDED.updated_at'''
            ),
            {
                'id': _cuid(),
                'code_review_id': review_id,
                'flowie_user_id': identity.scalar_one_or_none(),
                'external_user_id': reviewer.externalUserId,
                'display_name': reviewer.displayName,
                'reviewer_kind': reviewer.reviewerKind,
                'is_required': reviewer.isRequired,
                'decision': reviewer.decision,
                'provider_decision': reviewer.providerDecision,
                'now': now,
            },
        )
    if reviewer_ids:
        await db.execute(
            text(
                '''DELETE FROM code_review_reviewers
                   WHERE code_review_id = :code_review_id
                     AND NOT (external_user_id = ANY(:reviewer_ids))'''
            ),
            {'code_review_id': review_id, 'reviewer_ids': reviewer_ids},
        )
    else:
        await db.execute(
            text('DELETE FROM code_review_reviewers WHERE code_review_id = :code_review_id'),
            {'code_review_id': review_id},
        )
    for revision in review.revisions:
        await db.execute(
            text(
                '''INSERT INTO code_review_revisions (
                       id, code_review_id, external_revision_id, sequence, base_revision,
                       head_revision, external_created_at, created_at
                   ) VALUES (
                       :id, :code_review_id, :external_revision_id, :sequence, :base_revision,
                       :head_revision, :external_created_at, :now
                   ) ON CONFLICT (code_review_id, external_revision_id) DO UPDATE SET
                       sequence = EXCLUDED.sequence, base_revision = EXCLUDED.base_revision,
                       head_revision = EXCLUDED.head_revision,
                       external_created_at = EXCLUDED.external_created_at'''
            ),
            {
                'id': _cuid(),
                'code_review_id': review_id,
                'external_revision_id': revision.externalRevisionId,
                'sequence': revision.sequence,
                'base_revision': revision.baseRevision,
                'head_revision': revision.headRevision,
                'external_created_at': _naive_utc(revision.externalCreatedAt),
                'now': now,
            },
        )
    return review_id


async def sync_connection(db: AsyncSession, connection_id: str, settings: Settings) -> dict[str, int]:
    connection = await connection_row(db, connection_id)
    if connection['status'] not in {'ACTIVE', 'ERROR'}:
        raise ApiError(409, 'This source-control connection must be reactivated before synchronization.', 'Conflict')
    bundle = decrypt_secret_bundle(settings, connection['encrypted_value'])
    provider = provider_for(connection, settings, bundle)
    try:
        repositories = await provider.list_repositories()
        seen_ids: set[str] = set()
        for repository in repositories:
            seen_ids.add(repository.externalRepositoryId)
            await upsert_repository(db, connection, repository)
        existing = await db.execute(
            text('SELECT id, external_repository_id FROM scm_repositories WHERE connection_id = :connection_id'),
            {'connection_id': connection_id},
        )
        now = _utcnow()
        for row in existing.mappings():
            if row['external_repository_id'] not in seen_ids:
                await db.execute(
                    text(
                        '''UPDATE scm_repositories SET archived_at = :now, enabled = false, updated_at = :now
                           WHERE id = :id'''
                    ),
                    {'id': row['id'], 'now': now},
                )
        await db.commit()

        enabled_result = await db.execute(
            text(
                '''SELECT * FROM scm_repositories
                   WHERE connection_id = :connection_id AND enabled = true AND archived_at IS NULL'''
            ),
            {'connection_id': connection_id},
        )
        review_count = 0
        for repository_row in enabled_result.mappings().all():
            repository = ProviderRepository(
                externalRepositoryId=repository_row['external_repository_id'],
                externalProjectId=repository_row['external_project_id'],
                name=repository_row['name'],
                fullName=repository_row['full_name'],
                isPrivate=repository_row['is_private'],
                defaultBranch=repository_row['default_branch'],
            )
            reviews = await provider.list_reviews(repository)
            for review in reviews:
                await upsert_review(db, repository_row, review)
                review_count += 1
            await db.commit()
        await db.execute(
            text(
                '''UPDATE scm_connections
                   SET last_synced_at = :now, last_error = NULL, status = 'ACTIVE', updated_at = :now
                   WHERE id = :id'''
            ),
            {'id': connection_id, 'now': _utcnow()},
        )
        await db.commit()
        return {'repositories': len(repositories), 'reviews': review_count}
    except (httpx.HTTPError, KeyError, ValueError) as error:
        await db.rollback()
        await db.execute(
            text(
                '''UPDATE scm_connections SET status = 'ERROR', last_error = :error, updated_at = :now
                   WHERE id = :id'''
            ),
            {'id': connection_id, 'error': str(error)[:1000], 'now': _utcnow()},
        )
        await db.commit()
        raise ApiError(502, f'The provider synchronization failed: {error}', 'Bad Gateway') from error


async def sync_delivery_review(db: AsyncSession, delivery: Any, settings: Settings) -> bool:
    connection = await connection_row(db, delivery['connection_id'])
    payload = delivery['payload']
    if isinstance(payload, str):
        payload = json.loads(payload)
    repository_id: str | None = None
    external_review_id: str | None = None
    if connection['provider'] == 'GITHUB':
        repository_id = str((payload.get('repository') or {}).get('id') or '') or None
        pull_request = payload.get('pull_request') or {}
        external_review_id = str(pull_request.get('number') or payload.get('number') or '') or None
    elif connection['provider'] == 'AZURE_DEVOPS':
        resource = payload.get('resource') or {}
        repository_id = str((resource.get('repository') or {}).get('id') or '') or None
        external_review_id = str(resource.get('pullRequestId') or '') or None
    if not repository_id or not external_review_id:
        return False
    repository_result = await db.execute(
        text(
            '''SELECT * FROM scm_repositories
               WHERE connection_id = :connection_id AND external_repository_id = :external_repository_id
                 AND enabled = true AND archived_at IS NULL'''
        ),
        {'connection_id': connection['id'], 'external_repository_id': repository_id},
    )
    repository = repository_result.mappings().first()
    if not repository:
        return False
    provider_repository = ProviderRepository(
        externalRepositoryId=repository['external_repository_id'],
        externalProjectId=repository['external_project_id'],
        name=repository['name'],
        fullName=repository['full_name'],
        isPrivate=repository['is_private'],
        defaultBranch=repository['default_branch'],
    )
    provider = provider_for(
        connection,
        settings,
        decrypt_secret_bundle(settings, connection['encrypted_value']),
    )
    review = await provider.get_review(provider_repository, external_review_id)
    await upsert_review(db, repository, review)
    await db.commit()
    return True
