from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .native_projects import _workspace_access
from .scm.contracts import read_only_capabilities


router = APIRouter(prefix='/api/v1/reviews', tags=['reviews'])
ReviewView = Literal['assigned', 'created', 'all']
ReviewState = Literal['OPEN', 'MERGED', 'CLOSED', 'ABANDONED']


class IssueLinkInput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    issueId: str | None = Field(default=None, min_length=1)
    issueIdentifier: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode='after')
    def require_issue_reference(self) -> 'IssueLinkInput':
        if bool(self.issueId) == bool(self.issueIdentifier):
            raise ValueError('Provide exactly one issueId or issueIdentifier.')
        return self


ACCESS_JOIN = '''
    JOIN workspace_members membership
      ON membership.workspace_id = review.workspace_id
     AND membership.user_id = :user_id
     AND membership.status = 'ACTIVE'
    LEFT JOIN team_members team_membership
      ON team_membership.team_id = repository.team_id
     AND team_membership.user_id = :user_id
'''
ACCESS_WHERE = "(membership.role IN ('OWNER', 'ADMIN') OR team_membership.user_id IS NOT NULL)"


async def _accessible_review(
    db: AsyncSession,
    review_id: str,
    workspace_id: str,
    user_id: str,
) -> Any:
    result = await db.execute(
        text(
            f'''SELECT review.*, repository.connection_id, repository.team_id,
                       repository.full_name AS repository_name, repository.external_project_id,
                       repository.external_repository_id, repository.name AS repository_short_name,
                       repository.is_private, repository.default_branch,
                       connection.provider, connection.display_name AS connection_name
                FROM code_reviews review
                JOIN scm_repositories repository ON repository.id = review.repository_id
                JOIN scm_connections connection ON connection.id = repository.connection_id
                {ACCESS_JOIN}
                WHERE review.id = :review_id AND review.workspace_id = :workspace_id
                  AND repository.enabled = true AND repository.archived_at IS NULL
                  AND {ACCESS_WHERE}'''
        ),
        {'review_id': review_id, 'workspace_id': workspace_id, 'user_id': user_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Review not found.', 'Not Found')
    return row


async def _review_relations(
    db: AsyncSession,
    review_ids: list[str],
    user_id: str,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, list[dict[str, Any]]]]:
    if not review_ids:
        return {}, {}
    reviewer_result = await db.execute(
        text(
            '''SELECT code_review_id, external_user_id, display_name, reviewer_kind,
                      is_required, decision, provider_decision, flowie_user_id
               FROM code_review_reviewers
               WHERE code_review_id = ANY(:review_ids)
               ORDER BY is_required DESC, display_name ASC'''
        ),
        {'review_ids': review_ids},
    )
    reviewers: dict[str, list[dict[str, Any]]] = {review_id: [] for review_id in review_ids}
    for row in reviewer_result.mappings():
        reviewers[row['code_review_id']].append(
            {
                'externalUserId': row['external_user_id'],
                'displayName': row['display_name'],
                'reviewerKind': row['reviewer_kind'],
                'isRequired': row['is_required'],
                'decision': row['decision'],
                'providerDecision': row['provider_decision'],
                'flowieUserId': row['flowie_user_id'],
                'isCurrentUser': row['flowie_user_id'] == user_id,
            }
        )
    link_result = await db.execute(
        text(
            '''SELECT link.code_review_id, link.issue_id, link.source, link.created_at,
                      issue.identifier, issue.title
               FROM code_review_issue_links link
               JOIN issues issue ON issue.id = link.issue_id
               WHERE link.code_review_id = ANY(:review_ids)
               ORDER BY link.created_at ASC'''
        ),
        {'review_ids': review_ids},
    )
    links: dict[str, list[dict[str, Any]]] = {review_id: [] for review_id in review_ids}
    for row in link_result.mappings():
        links[row['code_review_id']].append(
            {
                'issueId': row['issue_id'],
                'identifier': row['identifier'],
                'title': row['title'],
                'source': row['source'],
                'createdAt': row['created_at'],
            }
        )
    return reviewers, links


def _review_view(
    row: Any,
    reviewers: list[dict[str, Any]],
    issue_links: list[dict[str, Any]],
) -> dict[str, Any]:
    assigned_to_me = bool(row['assigned_to_me'])
    created_by_me = bool(row['created_by_me'])
    return {
        'id': row['id'],
        'workspaceId': row['workspace_id'],
        'provider': row['provider'],
        'connectionId': row['connection_id'],
        'connectionName': row['connection_name'],
        'repositoryId': row['repository_id'],
        'repositoryName': row['repository_name'],
        'externalReviewId': row['external_review_id'],
        'number': row['number'],
        'title': row['title'],
        'description': row['description'],
        'state': row['state'],
        'isDraft': row['is_draft'],
        'externalAuthorId': row['external_author_id'],
        'authorName': row['author_name'],
        'sourceRef': row['source_ref'],
        'targetRef': row['target_ref'],
        'headRevision': row['head_revision'],
        'latestRevisionKey': row['latest_revision_key'],
        'remoteUrl': row['remote_url'],
        'additions': row['additions'],
        'deletions': row['deletions'],
        'changedFiles': row['changed_files'],
        'externalCreatedAt': row['external_created_at'],
        'externalUpdatedAt': row['external_updated_at'],
        'mergedAt': row['merged_at'],
        'closedAt': row['closed_at'],
        'assignedToMe': assigned_to_me,
        'createdByMe': created_by_me,
        'unread': row['last_viewed_revision'] != row['latest_revision_key'],
        'needsAttention': assigned_to_me
        and any(
            reviewer['isCurrentUser'] and reviewer['decision'] in {'NONE', 'PENDING'}
            for reviewer in reviewers
        ),
        'capabilities': read_only_capabilities(row['provider']).model_dump(),
        'reviewers': reviewers,
        'issueLinks': issue_links,
    }


@router.get('')
async def list_reviews(
    workspaceId: str = Query(min_length=1),
    view: ReviewView = 'assigned',
    state: ReviewState | None = None,
    provider: Literal['GITHUB', 'AZURE_DEVOPS'] | None = None,
    repositoryId: str | None = None,
    search: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _workspace_access(db, workspaceId, user['id'])
    filters = [
        'review.workspace_id = :workspace_id',
        'repository.enabled = true',
        'repository.archived_at IS NULL',
        ACCESS_WHERE,
    ]
    parameters: dict[str, Any] = {
        'workspace_id': workspaceId,
        'user_id': user['id'],
        'limit': limit,
        'offset': offset,
    }
    if view == 'assigned':
        filters.append(
            '''EXISTS (
                   SELECT 1 FROM code_review_reviewers mine
                   WHERE mine.code_review_id = review.id AND mine.flowie_user_id = :user_id
               )'''
        )
    elif view == 'created':
        filters.append(
            '''EXISTS (
                   SELECT 1 FROM scm_user_identities identity
                   WHERE identity.connection_id = repository.connection_id
                     AND identity.user_id = :user_id
                     AND identity.external_user_id = review.external_author_id
               )'''
        )
    if state:
        filters.append('review.state = CAST(:state AS "CodeReviewState")')
        parameters['state'] = state
    if provider:
        filters.append('connection.provider = CAST(:provider AS "ScmProvider")')
        parameters['provider'] = provider
    if repositoryId:
        filters.append('review.repository_id = :repository_id')
        parameters['repository_id'] = repositoryId
    if search and search.strip():
        filters.append(
            '''(review.title ILIKE :search OR COALESCE(review.author_name, '') ILIKE :search
                OR repository.full_name ILIKE :search)'''
        )
        parameters['search'] = f'%{search.strip()}%'
    where = ' AND '.join(filters)
    select = f'''FROM code_reviews review
                 JOIN scm_repositories repository ON repository.id = review.repository_id
                 JOIN scm_connections connection ON connection.id = repository.connection_id
                 {ACCESS_JOIN}
                 LEFT JOIN code_review_view_states view_state
                   ON view_state.code_review_id = review.id AND view_state.user_id = :user_id
                 WHERE {where}'''
    total_result = await db.execute(text(f'SELECT COUNT(DISTINCT review.id) {select}'), parameters)
    total = int(total_result.scalar_one())
    result = await db.execute(
        text(
            f'''SELECT DISTINCT review.*, repository.connection_id,
                       repository.full_name AS repository_name,
                       connection.provider, connection.display_name AS connection_name,
                       view_state.last_viewed_revision,
                       EXISTS (
                           SELECT 1 FROM code_review_reviewers mine
                           WHERE mine.code_review_id = review.id AND mine.flowie_user_id = :user_id
                       ) AS assigned_to_me,
                       EXISTS (
                           SELECT 1 FROM scm_user_identities identity
                           WHERE identity.connection_id = repository.connection_id
                             AND identity.user_id = :user_id
                             AND identity.external_user_id = review.external_author_id
                       ) AS created_by_me
                {select}
                ORDER BY review.external_updated_at DESC, review.id DESC
                LIMIT :limit OFFSET :offset'''
        ),
        parameters,
    )
    rows = result.mappings().all()
    review_ids = [row['id'] for row in rows]
    reviewers, links = await _review_relations(db, review_ids, user['id'])
    return {
        'data': [
            _review_view(row, reviewers.get(row['id'], []), links.get(row['id'], [])) for row in rows
        ],
        'meta': {'total': total, 'limit': limit, 'offset': offset},
    }


@router.get('/{review_id}')
async def get_review(
    review_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    row = await _accessible_review(db, review_id, workspaceId, user['id'])
    state_result = await db.execute(
        text(
            '''SELECT last_viewed_revision FROM code_review_view_states
               WHERE code_review_id = :review_id AND user_id = :user_id'''
        ),
        {'review_id': review_id, 'user_id': user['id']},
    )
    assigned_result = await db.execute(
        text(
            '''SELECT EXISTS (
                       SELECT 1 FROM code_review_reviewers
                       WHERE code_review_id = :review_id AND flowie_user_id = :user_id
                   ) AS assigned_to_me,
                   EXISTS (
                       SELECT 1 FROM scm_user_identities
                       WHERE connection_id = :connection_id AND user_id = :user_id
                         AND external_user_id = :external_author_id
                   ) AS created_by_me'''
        ),
        {
            'review_id': review_id,
            'connection_id': row['connection_id'],
            'user_id': user['id'],
            'external_author_id': row['external_author_id'],
        },
    )
    relation = assigned_result.mappings().one()
    enriched = dict(row)
    enriched['last_viewed_revision'] = state_result.scalar_one_or_none()
    enriched.update(relation)
    reviewers, links = await _review_relations(db, [review_id], user['id'])
    revisions_result = await db.execute(
        text(
            '''SELECT external_revision_id, sequence, base_revision, head_revision, external_created_at
               FROM code_review_revisions WHERE code_review_id = :review_id
               ORDER BY sequence NULLS LAST, created_at ASC'''
        ),
        {'review_id': review_id},
    )
    data = _review_view(enriched, reviewers.get(review_id, []), links.get(review_id, []))
    data['revisions'] = [
        {
            'externalRevisionId': revision['external_revision_id'],
            'sequence': revision['sequence'],
            'baseRevision': revision['base_revision'],
            'headRevision': revision['head_revision'],
            'externalCreatedAt': revision['external_created_at'],
        }
        for revision in revisions_result.mappings().all()
    ]
    return {'data': data}


@router.post('/{review_id}/viewed')
async def mark_review_viewed(
    review_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    review = await _accessible_review(db, review_id, workspaceId, user['id'])
    now = _utcnow()
    await db.execute(
        text(
            '''INSERT INTO code_review_view_states (
                   code_review_id, user_id, last_viewed_revision, updated_at
               ) VALUES (
                   :review_id, :user_id, :revision, :now
               ) ON CONFLICT (code_review_id, user_id) DO UPDATE SET
                   last_viewed_revision = EXCLUDED.last_viewed_revision,
                   updated_at = EXCLUDED.updated_at'''
        ),
        {
            'review_id': review_id,
            'user_id': user['id'],
            'revision': review['latest_revision_key'],
            'now': now,
        },
    )
    await db.commit()
    return {'data': {'id': review_id, 'lastViewedRevision': review['latest_revision_key'], 'unread': False}}


async def _audit_link(
    db: AsyncSession,
    workspace_id: str,
    actor_id: str,
    action: str,
    review_id: str,
    issue_id: str,
) -> None:
    await db.execute(
        text(
            '''INSERT INTO audit_logs (
                   id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at
               ) VALUES (
                   :id, :workspace_id, :actor_id, :action, 'review', :review_id,
                   CAST(:metadata AS jsonb), :now
               )'''
        ),
        {
            'id': _cuid(),
            'workspace_id': workspace_id,
            'actor_id': actor_id,
            'action': action,
            'review_id': review_id,
            'metadata': json.dumps({'issueId': issue_id}),
            'now': _utcnow(),
        },
    )


@router.post('/{review_id}/issues', status_code=201)
async def link_issue(
    review_id: str,
    payload: IssueLinkInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    review = await _accessible_review(db, review_id, workspaceId, user['id'])
    issue_filter = 'id = :issue_id' if payload.issueId else 'identifier = :issue_identifier'
    issue_result = await db.execute(
        text(
            f'''SELECT id, identifier, title, team_id FROM issues
                WHERE {issue_filter} AND workspace_id = :workspace_id AND archived_at IS NULL'''
        ),
        {
            'issue_id': payload.issueId,
            'issue_identifier': payload.issueIdentifier.strip().upper() if payload.issueIdentifier else None,
            'workspace_id': workspaceId,
        },
    )
    issue = issue_result.mappings().first()
    if not issue:
        raise ApiError(404, 'Issue not found.', 'Not Found')
    if issue['team_id'] != review['team_id']:
        raise ApiError(400, 'A Review can only link to an Issue in its mapped Flowie team.', 'Bad Request')
    linked_at = _utcnow()
    try:
        await db.execute(
            text(
                '''INSERT INTO code_review_issue_links (
                       workspace_id, code_review_id, issue_id, source, created_by_id, created_at
                   ) VALUES (
                       :workspace_id, :review_id, :issue_id, 'MANUAL', :created_by_id, :now
                   )'''
            ),
            {
                'workspace_id': workspaceId,
                'review_id': review_id,
                'issue_id': issue['id'],
                'created_by_id': user['id'],
                'now': linked_at,
            },
        )
        await _audit_link(db, workspaceId, user['id'], 'review.issue-linked', review_id, issue['id'])
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'This Issue is already linked to the Review.', 'Conflict') from error
    return {
        'data': {
            'reviewId': review_id,
            'issueId': issue['id'],
            'identifier': issue['identifier'],
            'title': issue['title'],
            'source': 'MANUAL',
            'createdAt': linked_at,
        }
    }


@router.delete('/{review_id}/issues/{issue_id}')
async def unlink_issue(
    review_id: str,
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _accessible_review(db, review_id, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''DELETE FROM code_review_issue_links
               WHERE workspace_id = :workspace_id AND code_review_id = :review_id AND issue_id = :issue_id
               RETURNING issue_id'''
        ),
        {'workspace_id': workspaceId, 'review_id': review_id, 'issue_id': issue_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(404, 'Review Issue link not found.', 'Not Found')
    await _audit_link(db, workspaceId, user['id'], 'review.issue-unlinked', review_id, issue_id)
    await db.commit()
    return {'data': {'reviewId': review_id, 'issueId': issue_id, 'deleted': True}}
