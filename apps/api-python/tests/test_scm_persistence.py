from __future__ import annotations

import asyncio
import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow
from app.domains.scm.contracts import ProviderRepository, ProviderReview, ProviderReviewer, ProviderRevision
from app.domains.scm.service import upsert_repository, upsert_review
from app.domains.reviews import list_reviews


class ScmPersistenceIntegrationTests(unittest.TestCase):
    @unittest.skipUnless(os.getenv('SCM_TEST_DATABASE_URL'), 'SCM_TEST_DATABASE_URL is not configured')
    def test_repository_and_review_upserts_are_idempotent(self) -> None:
        async def run() -> None:
            engine = create_async_engine(_async_database_url(os.environ['SCM_TEST_DATABASE_URL']))
            async with engine.connect() as connection:
                transaction = await connection.begin()
                db = AsyncSession(bind=connection, expire_on_commit=False)
                try:
                    seed = await db.execute(
                        text(
                            '''SELECT workspace.id AS workspace_id, member.user_id, team_member.team_id
                               FROM workspaces workspace
                               JOIN workspace_members member ON member.workspace_id = workspace.id
                               JOIN team_members team_member ON team_member.user_id = member.user_id
                               JOIN teams team ON team.id = team_member.team_id
                                              AND team.workspace_id = workspace.id
                               WHERE member.status = 'ACTIVE' LIMIT 1'''
                        )
                    )
                    owner = seed.mappings().first()
                    if not owner:
                        self.skipTest('The integration database has no workspace member.')
                    now = _utcnow()
                    connection_id = _cuid()
                    await db.execute(
                        text(
                            '''INSERT INTO scm_connections (
                                   id, workspace_id, provider, external_account_id, display_name,
                                   status, auth_mode, settings, created_by_id, created_at, updated_at
                               ) VALUES (
                                   :id, :workspace_id, 'GITHUB', :external_account_id, 'Integration test',
                                   'ACTIVE', 'INSTALLATION', CAST('{}' AS jsonb), :user_id, :now, :now
                               )'''
                        ),
                        {
                            'id': connection_id,
                            'workspace_id': owner['workspace_id'],
                            'external_account_id': connection_id,
                            'user_id': owner['user_id'],
                            'now': now,
                        },
                    )
                    connection_row = {
                        'id': connection_id,
                        'workspace_id': owner['workspace_id'],
                    }
                    provider_repository = ProviderRepository(
                        externalRepositoryId='repo-1', name='repo', fullName='acme/repo'
                    )
                    repository_id = await upsert_repository(db, connection_row, provider_repository)
                    await db.execute(
                        text(
                            '''UPDATE scm_repositories SET enabled = true, team_id = :team_id
                               WHERE id = :repository_id'''
                        ),
                        {'repository_id': repository_id, 'team_id': owner['team_id']},
                    )
                    await db.execute(
                        text(
                            '''INSERT INTO scm_user_identities (
                                   id, workspace_id, connection_id, user_id, external_user_id,
                                   created_at, updated_at
                               ) VALUES (
                                   :id, :workspace_id, :connection_id, :user_id, 'reviewer-1', :now, :now
                               )'''
                        ),
                        {
                            'id': _cuid(),
                            'workspace_id': owner['workspace_id'],
                            'connection_id': connection_id,
                            'user_id': owner['user_id'],
                            'now': now,
                        },
                    )
                    repository = {
                        'id': repository_id,
                        'workspace_id': owner['workspace_id'],
                        'connection_id': connection_id,
                    }
                    review = ProviderReview(
                        externalReviewId='42',
                        number=42,
                        title='Persistence test',
                        state='OPEN',
                        externalAuthorId='author-1',
                        sourceRef='feature',
                        targetRef='main',
                        headRevision='abc123',
                        latestRevisionKey='abc123',
                        remoteUrl='https://example.invalid/reviews/42',
                        externalCreatedAt=datetime.now(timezone.utc),
                        externalUpdatedAt=datetime.now(timezone.utc),
                        reviewers=[ProviderReviewer(externalUserId='reviewer-1', decision='PENDING')],
                        revisions=[ProviderRevision(externalRevisionId='abc123', headRevision='abc123')],
                    )
                    review_id = await upsert_review(db, repository, review)
                    assigned = await list_reviews(
                        workspaceId=owner['workspace_id'],
                        view='assigned',
                        state=None,
                        provider=None,
                        repositoryId=None,
                        search=None,
                        limit=50,
                        offset=0,
                        user={'id': owner['user_id']},
                        db=db,
                    )
                    self.assertEqual(assigned['meta']['total'], 1)
                    self.assertTrue(assigned['data'][0]['assignedToMe'])
                    self.assertTrue(assigned['data'][0]['unread'])
                    outsider_id = _cuid()
                    await db.execute(
                        text(
                            '''INSERT INTO users (id, email, name, status, created_at, updated_at)
                               VALUES (:id, :email, 'Reviews outsider', 'ACTIVE', :now, :now)'''
                        ),
                        {'id': outsider_id, 'email': f'{outsider_id}@example.invalid', 'now': now},
                    )
                    await db.execute(
                        text(
                            '''INSERT INTO workspace_members (
                                   id, workspace_id, user_id, status, role, joined_at, created_at, updated_at
                               ) VALUES (
                                   :id, :workspace_id, :user_id, 'ACTIVE', 'MEMBER', :now, :now, :now
                               )'''
                        ),
                        {
                            'id': _cuid(),
                            'workspace_id': owner['workspace_id'],
                            'user_id': outsider_id,
                            'now': now,
                        },
                    )
                    hidden = await list_reviews(
                        workspaceId=owner['workspace_id'],
                        view='all',
                        state=None,
                        provider=None,
                        repositoryId=None,
                        search=None,
                        limit=50,
                        offset=0,
                        user={'id': outsider_id},
                        db=db,
                    )
                    self.assertEqual(hidden['meta']['total'], 0)
                    review.reviewers = []
                    second_id = await upsert_review(db, repository, review)
                    self.assertEqual(review_id, second_id)
                    reviewer_count = await db.execute(
                        text('SELECT COUNT(*) FROM code_review_reviewers WHERE code_review_id = :id'),
                        {'id': review_id},
                    )
                    self.assertEqual(reviewer_count.scalar_one(), 0)
                finally:
                    await db.close()
                    await transaction.rollback()
            await engine.dispose()

        asyncio.run(run())


if __name__ == '__main__':
    unittest.main()
