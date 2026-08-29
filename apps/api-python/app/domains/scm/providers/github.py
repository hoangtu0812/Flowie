from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import jwt

from ..contracts import ProviderRepository, ProviderReview, ProviderReviewer, ProviderRevision


class GitHubProvider:
    provider = 'GITHUB'

    def __init__(
        self,
        *,
        app_id: str,
        private_key: str,
        installation_id: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if not app_id or not private_key:
            raise ValueError('GitHub App credentials are not configured.')
        self._app_id = app_id
        self._private_key = private_key
        self._installation_id = installation_id
        self._client = client
        self._token: str | None = None

    def _app_jwt(self) -> str:
        now = datetime.now(timezone.utc)
        return jwt.encode(
            {'iat': now - timedelta(seconds=60), 'exp': now + timedelta(minutes=9), 'iss': self._app_id},
            self._private_key,
            algorithm='RS256',
        )

    async def _installation_token(self, client: httpx.AsyncClient) -> str:
        if self._token:
            return self._token
        response = await client.post(
            f'https://api.github.com/app/installations/{self._installation_id}/access_tokens',
            headers={
                'Accept': 'application/vnd.github+json',
                'Authorization': f'Bearer {self._app_jwt()}',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        )
        response.raise_for_status()
        self._token = str(response.json()['token'])
        return self._token

    async def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=30)
        try:
            token = await self._installation_token(client)
            headers = {
                'Accept': 'application/vnd.github+json',
                'Authorization': f'Bearer {token}',
                'X-GitHub-Api-Version': '2022-11-28',
                **kwargs.pop('headers', {}),
            }
            response = await client.request(method, url, headers=headers, **kwargs)
            response.raise_for_status()
            return response
        finally:
            if owns_client:
                await client.aclose()

    async def list_repositories(self) -> list[ProviderRepository]:
        repositories: list[ProviderRepository] = []
        page = 1
        while True:
            response = await self._request(
                'GET',
                'https://api.github.com/installation/repositories',
                params={'per_page': 100, 'page': page},
            )
            batch = response.json().get('repositories', [])
            repositories.extend(self._repository(item) for item in batch)
            if len(batch) < 100:
                return repositories
            page += 1

    async def list_reviews(self, repository: ProviderRepository) -> list[ProviderReview]:
        response = await self._request(
            'GET',
            f'https://api.github.com/repos/{repository.fullName}/pulls',
            params={'state': 'all', 'sort': 'updated', 'direction': 'desc', 'per_page': 100},
        )
        semaphore = asyncio.Semaphore(8)

        async def hydrate(item: dict[str, Any]) -> ProviderReview:
            async with semaphore:
                review = self._review(item)
                return await self._with_decisions(repository, review)

        return list(await asyncio.gather(*(hydrate(item) for item in response.json())))

    async def get_review(self, repository: ProviderRepository, external_review_id: str) -> ProviderReview:
        detail = await self._request(
            'GET', f'https://api.github.com/repos/{repository.fullName}/pulls/{external_review_id}'
        )
        review = self._review(detail.json())
        return await self._with_decisions(repository, review)

    async def _with_decisions(
        self,
        repository: ProviderRepository,
        review: ProviderReview,
    ) -> ProviderReview:
        reviews_response = await self._request(
            'GET',
            f'https://api.github.com/repos/{repository.fullName}/pulls/{review.externalReviewId}/reviews',
            params={'per_page': 100},
        )
        decisions: dict[str, ProviderReviewer] = {item.externalUserId: item for item in review.reviewers}
        for item in reviews_response.json():
            user = item.get('user') or {}
            external_user_id = str(user.get('id') or user.get('login') or '')
            state = str(item.get('state') or '').upper()
            if not external_user_id or state not in {'COMMENTED', 'APPROVED', 'CHANGES_REQUESTED'}:
                continue
            decisions[external_user_id] = ProviderReviewer(
                externalUserId=external_user_id,
                displayName=user.get('login'),
                decision=state,
                providerDecision=state,
            )
        review.reviewers = list(decisions.values())
        return review

    @staticmethod
    def _repository(item: dict[str, Any]) -> ProviderRepository:
        return ProviderRepository(
            externalRepositoryId=str(item['id']),
            name=item['name'],
            fullName=item['full_name'],
            isPrivate=bool(item.get('private', True)),
            defaultBranch=item.get('default_branch'),
        )

    @staticmethod
    def _review(item: dict[str, Any]) -> ProviderReview:
        head = item.get('head') or {}
        base = item.get('base') or {}
        author = item.get('user') or {}
        head_sha = str(head.get('sha') or '')
        reviewers = [
            ProviderReviewer(externalUserId=str(user.get('id') or user['login']), displayName=user.get('login'))
            for user in item.get('requested_reviewers') or []
        ]
        reviewers.extend(
            ProviderReviewer(
                externalUserId=f"team:{team.get('id') or team['slug']}",
                displayName=team.get('name') or team.get('slug'),
                reviewerKind='TEAM',
            )
            for team in item.get('requested_teams') or []
        )
        merged_at = item.get('merged_at')
        state = 'MERGED' if merged_at else ('OPEN' if item.get('state') == 'open' else 'CLOSED')
        return ProviderReview(
            externalReviewId=str(item.get('number') or item['id']),
            number=item.get('number'),
            title=item['title'],
            description=item.get('body'),
            state=state,
            isDraft=bool(item.get('draft', False)),
            externalAuthorId=str(author.get('id') or author.get('login') or 'unknown'),
            authorName=author.get('login'),
            sourceRef=head.get('ref') or '',
            targetRef=base.get('ref') or '',
            headRevision=head_sha,
            latestRevisionKey=head_sha,
            remoteUrl=item['html_url'],
            additions=item.get('additions'),
            deletions=item.get('deletions'),
            changedFiles=item.get('changed_files'),
            externalCreatedAt=item['created_at'],
            externalUpdatedAt=item['updated_at'],
            mergedAt=merged_at,
            closedAt=item.get('closed_at'),
            reviewers=reviewers,
            revisions=[ProviderRevision(externalRevisionId=head_sha, headRevision=head_sha)],
        )
