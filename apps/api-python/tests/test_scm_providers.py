from __future__ import annotations

import asyncio
import base64
import sys
import unittest
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from hmac import new as new_hmac
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domains.scm.contracts import ProviderRepository
from app.domains.scm.providers.azure_devops import AzureDevOpsProvider
from app.domains.scm.providers.github import GitHubProvider
from app.domains.scm.security import verify_azure_basic_auth, verify_github_signature


class ScmProviderTests(unittest.TestCase):
    def test_webhook_authentication_rejects_tampering(self) -> None:
        payload = b'{"pull_request":42}'
        signature = 'sha256=' + new_hmac(b'github-secret', payload, sha256).hexdigest()
        basic = 'Basic ' + base64.b64encode(b'flowie:azure-secret').decode('ascii')

        self.assertTrue(verify_github_signature('github-secret', payload, signature))
        self.assertFalse(verify_github_signature('github-secret', payload + b' ', signature))
        self.assertTrue(verify_azure_basic_auth('azure-secret', basic))
        self.assertFalse(verify_azure_basic_auth('wrong-secret', basic))

    def test_github_review_normalizes_review_decisions(self) -> None:
        async def run() -> None:
            def handler(request: httpx.Request) -> httpx.Response:
                if request.url.path.endswith('/reviews'):
                    return httpx.Response(
                        200,
                        json=[
                            {
                                'user': {'id': 7, 'login': 'reviewer'},
                                'state': 'APPROVED',
                                'submitted_at': '2026-08-29T01:05:00Z',
                            }
                        ],
                    )
                return httpx.Response(
                    200,
                    json={
                        'id': 420,
                        'number': 42,
                        'title': 'Unify Reviews',
                        'body': None,
                        'state': 'open',
                        'draft': False,
                        'user': {'id': 5, 'login': 'author'},
                        'head': {'ref': 'feature', 'sha': 'abc123'},
                        'base': {'ref': 'main', 'sha': 'def456'},
                        'html_url': 'https://github.com/acme/repo/pull/42',
                        'created_at': '2026-08-29T01:00:00Z',
                        'updated_at': '2026-08-29T01:05:00Z',
                        'requested_reviewers': [],
                        'requested_teams': [],
                    },
                )

            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                provider = GitHubProvider(
                    app_id='1', private_key='not-used', installation_id='99', client=client
                )
                provider._token = 'installation-token'
                provider._token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
                repository = ProviderRepository(
                    externalRepositoryId='1', name='repo', fullName='acme/repo'
                )
                review = await provider.get_review(repository, '42')
                self.assertEqual(review.latestRevisionKey, 'abc123')
                self.assertEqual(review.reviewers[0].decision, 'APPROVED')

        asyncio.run(run())

    def test_github_renews_an_expiring_installation_token(self) -> None:
        async def run() -> None:
            requests = 0

            def handler(request: httpx.Request) -> httpx.Response:
                nonlocal requests
                requests += 1
                return httpx.Response(
                    201,
                    json={'token': 'renewed', 'expires_at': '2026-08-29T03:00:00Z'},
                )

            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                provider = GitHubProvider(
                    app_id='1', private_key='not-used', installation_id='99', client=client
                )
                provider._app_jwt = lambda: 'app-jwt'
                provider._token = 'expiring'
                provider._token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=30)

                self.assertEqual(await provider._installation_token(client), 'renewed')
                self.assertEqual(requests, 1)

        asyncio.run(run())

    def test_azure_renews_an_expiring_workload_token(self) -> None:
        async def run() -> None:
            requests = 0

            def handler(request: httpx.Request) -> httpx.Response:
                nonlocal requests
                requests += 1
                return httpx.Response(200, json={'access_token': 'renewed', 'expires_in': 3600})

            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                provider = AzureDevOpsProvider(
                    organization='acme',
                    auth_mode='SERVICE_PRINCIPAL',
                    tenant_id='tenant',
                    client_id='client',
                    client_secret='secret',
                    client=client,
                )
                provider._token = 'expiring'
                provider._token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=30)

                self.assertEqual(await provider._access_token(client), 'renewed')
                self.assertEqual(requests, 1)

        asyncio.run(run())

    def test_azure_review_preserves_iteration_and_vote_semantics(self) -> None:
        review = AzureDevOpsProvider._review(
            {
                'pullRequestId': 73,
                'title': 'Azure review',
                'description': 'Keep iteration context.',
                'status': 'active',
                'isDraft': False,
                'createdBy': {'id': 'author-id', 'displayName': 'Author'},
                'sourceRefName': 'refs/heads/feature',
                'targetRefName': 'refs/heads/main',
                'lastMergeSourceCommit': {'commitId': 'head-sha'},
                'lastMergeTargetCommit': {'commitId': 'base-sha'},
                'creationDate': '2026-08-29T01:00:00Z',
                'reviewers': [
                    {'id': 'reviewer-id', 'displayName': 'Reviewer', 'vote': -5, 'isRequired': True}
                ],
                '_links': {'web': {'href': 'https://dev.azure.com/acme/project/_git/repo/pullrequest/73'}},
            },
            [
                {
                    'id': 2,
                    'sourceRefCommit': {'commitId': 'head-sha'},
                    'commonRefCommit': {'commitId': 'base-sha'},
                    'createdDate': '2026-08-29T01:03:00Z',
                }
            ],
        )

        self.assertEqual(review.latestRevisionKey, 'iteration:2:head-sha')
        self.assertEqual(review.reviewers[0].decision, 'WAITING_FOR_AUTHOR')
        self.assertTrue(review.reviewers[0].isRequired)


if __name__ == '__main__':
    unittest.main()
