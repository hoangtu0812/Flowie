from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote

import httpx

from ..contracts import (
    ProviderRepository,
    ProviderReview,
    ProviderReviewer,
    ProviderRevision,
    ReviewDecision,
    ReviewState,
    ScmProviderName,
)

AZURE_DEVOPS_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798'
AZURE_VOTE_DECISIONS: dict[int, ReviewDecision] = {
    10: 'APPROVED',
    5: 'APPROVED_WITH_SUGGESTIONS',
    -5: 'WAITING_FOR_AUTHOR',
    -10: 'REJECTED',
}
# Pull request status -> review state; any other or missing status is CLOSED.
# VI: Trạng thái pull request -> trạng thái review; trạng thái khác hoặc thiếu là CLOSED.
AZURE_REVIEW_STATES: dict[str | None, ReviewState] = {'active': 'OPEN', 'completed': 'MERGED', 'abandoned': 'ABANDONED'}
# REST address of one pull request, as Azure returns it in the payload's `url` field.
# VI: Địa chỉ REST của một pull request, như Azure trả về trong trường `url` của payload.
AZURE_PULL_REQUEST_API_URL = re.compile(
    r'^(?P<base>https://[^?#]+?)/_apis/git/repositories/(?P<repo>[^/?#]+)/pullRequests/(?P<number>\d+)/?$',
    re.IGNORECASE,
)


def azure_pull_request_web_url(url: str) -> str:
    """Turn a pull request's REST address into the page a browser can open.

    Azure DevOps pull request payloads carry `url`, which points at
    `.../_apis/git/repositories/{repo}/pullRequests/{n}` and renders raw JSON in
    a browser. The web page for the same pull request is
    `.../_git/{repo}/pullrequest/{n}`; Azure accepts the project and repository
    GUIDs in that path as well as their names. Any other URL, including one that
    is already a web URL or comes from another provider, is returned unchanged,
    so the function is safe to apply to every stored review URL.

    VI: Đổi địa chỉ REST của pull request thành trang mà trình duyệt mở được.
    Payload pull request của Azure DevOps có `url` trỏ tới
    `.../_apis/git/repositories/{repo}/pullRequests/{n}`, mở trong trình duyệt
    chỉ thấy JSON thô. Trang web của cùng pull request là
    `.../_git/{repo}/pullrequest/{n}`; Azure chấp nhận GUID của project và
    repository trong đường dẫn này cũng như tên của chúng. Mọi URL khác, kể cả
    URL đã là trang web hoặc của nhà cung cấp khác, được trả lại nguyên vẹn,
    nên có thể áp dụng hàm cho mọi URL review đã lưu.
    """
    match = AZURE_PULL_REQUEST_API_URL.match(url)
    if not match:
        return url
    return f"{match['base']}/_git/{match['repo']}/pullrequest/{match['number']}"


class AzureDevOpsProvider:
    provider: ScmProviderName = 'AZURE_DEVOPS'

    def __init__(
        self,
        *,
        organization: str,
        auth_mode: str,
        tenant_id: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._organization = organization
        self._auth_mode = auth_mode
        self._tenant_id = tenant_id
        self._client_id = client_id
        self._client_secret = client_secret
        self._client = client
        self._token: str | None = None
        self._token_expires_at: datetime | None = None
        self._token_lock = asyncio.Lock()

    async def _access_token(self, client: httpx.AsyncClient) -> str:
        now = datetime.now(UTC)
        if self._token and self._token_expires_at and self._token_expires_at > now + timedelta(minutes=2):
            return self._token
        async with self._token_lock:
            now = datetime.now(UTC)
            if self._token and self._token_expires_at and self._token_expires_at > now + timedelta(minutes=2):
                return self._token
            if self._auth_mode == 'MANAGED_IDENTITY':
                params = {'api-version': '2018-02-01', 'resource': AZURE_DEVOPS_RESOURCE}
                if self._client_id:
                    params['client_id'] = self._client_id
                response = await client.get(
                    'http://169.254.169.254/metadata/identity/oauth2/token',
                    params=params,
                    headers={'Metadata': 'true'},
                )
            else:
                if not self._tenant_id or not self._client_id or not self._client_secret:
                    raise ValueError('Azure DevOps service-principal credentials are incomplete.')
                response = await client.post(
                    f'https://login.microsoftonline.com/{quote(self._tenant_id, safe="")}/oauth2/v2.0/token',
                    data={
                        'client_id': self._client_id,
                        'client_secret': self._client_secret,
                        'grant_type': 'client_credentials',
                        'scope': f'{AZURE_DEVOPS_RESOURCE}/.default',
                    },
                )
            response.raise_for_status()
            payload = response.json()
            self._token = str(payload['access_token'])
            expires_in = int(payload.get('expires_in') or 3600)
            self._token_expires_at = now + timedelta(seconds=max(expires_in, 0))
            return self._token

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=30)
        try:
            token = await self._access_token(client)
            response = await client.request(
                method,
                f'https://dev.azure.com/{quote(self._organization, safe="")}{path}',
                headers={'Authorization': f'Bearer {token}', **kwargs.pop('headers', {})},
                **kwargs,
            )
            response.raise_for_status()
            return response
        finally:
            if owns_client:
                await client.aclose()

    async def list_repositories(self) -> list[ProviderRepository]:
        response = await self._request('GET', '/_apis/git/repositories', params={'api-version': '7.1'})
        return [self._repository(item) for item in response.json().get('value', [])]

    async def list_reviews(self, repository: ProviderRepository) -> list[ProviderReview]:
        project = quote(repository.externalProjectId or '', safe='')
        repo = quote(repository.externalRepositoryId, safe='')
        response = await self._request(
            'GET',
            f'/{project}/_apis/git/repositories/{repo}/pullrequests',
            params={'searchCriteria.status': 'all', '$top': 100, 'api-version': '7.1'},
        )
        semaphore = asyncio.Semaphore(8)

        async def hydrate(item: dict[str, Any]) -> ProviderReview:
            async with semaphore:
                iterations = await self._iterations(repository, str(item['pullRequestId']))
                return self._review(item, iterations)

        return list(await asyncio.gather(*(hydrate(item) for item in response.json().get('value', []))))

    async def get_review(self, repository: ProviderRepository, external_review_id: str) -> ProviderReview:
        project = quote(repository.externalProjectId or '', safe='')
        repo = quote(repository.externalRepositoryId, safe='')
        detail = await self._request(
            'GET',
            f'/{project}/_apis/git/repositories/{repo}/pullrequests/{quote(external_review_id, safe="")}',
            params={'api-version': '7.1'},
        )
        iterations = await self._iterations(repository, external_review_id)
        return self._review(detail.json(), iterations)

    async def _iterations(
        self,
        repository: ProviderRepository,
        external_review_id: str,
    ) -> list[dict[str, Any]]:
        project = quote(repository.externalProjectId or '', safe='')
        repo = quote(repository.externalRepositoryId, safe='')
        response = await self._request(
            'GET',
            f'/{project}/_apis/git/repositories/{repo}/pullrequests/{quote(external_review_id, safe="")}/iterations',
            params={'api-version': '7.1'},
        )
        return list(response.json().get('value', []))

    @staticmethod
    def _repository(item: dict[str, Any]) -> ProviderRepository:
        project = item.get('project') or {}
        return ProviderRepository(
            externalRepositoryId=str(item['id']),
            externalProjectId=str(project.get('id') or ''),
            name=item['name'],
            fullName=f"{project.get('name', '')}/{item['name']}",
            isPrivate=True,
            defaultBranch=item.get('defaultBranch'),
        )

    @staticmethod
    def _review(item: dict[str, Any], iterations: list[dict[str, Any]] | None = None) -> ProviderReview:
        author = item.get('createdBy') or {}
        head = (item.get('lastMergeSourceCommit') or {}).get('commitId') or ''
        base = (item.get('lastMergeTargetCommit') or {}).get('commitId')
        status = item.get('status')
        state = AZURE_REVIEW_STATES.get(status, 'CLOSED')
        iteration_values = iterations or []
        latest_iteration = max(iteration_values, key=lambda value: value.get('id', 0), default=None)
        iteration_key = f"iteration:{latest_iteration['id']}:{head}" if latest_iteration else head
        reviewers = []
        for reviewer in item.get('reviewers') or []:
            vote = int(reviewer.get('vote') or 0)
            reviewers.append(
                ProviderReviewer(
                    externalUserId=str(reviewer.get('id') or reviewer.get('uniqueName') or 'unknown'),
                    displayName=reviewer.get('displayName'),
                    reviewerKind='TEAM' if reviewer.get('isContainer') else 'USER',
                    isRequired=bool(reviewer.get('isRequired', False)),
                    decision=AZURE_VOTE_DECISIONS.get(vote, 'PENDING' if vote == 0 else 'NONE'),
                    providerDecision=str(vote),
                )
            )
        revisions = [
            ProviderRevision(
                externalRevisionId=str(value['id']),
                sequence=int(value['id']),
                baseRevision=(value.get('commonRefCommit') or {}).get('commitId') or base,
                headRevision=(value.get('sourceRefCommit') or {}).get('commitId') or head,
                externalCreatedAt=value.get('createdDate'),
            )
            for value in iteration_values
        ] or [ProviderRevision(externalRevisionId=head, baseRevision=base, headRevision=head)]
        # Pull request payloads usually have no `_links.web`; the repository's
        # `webUrl` gives the browser page, and the REST `url` is only a fallback
        # that is rewritten to its web form.
        # VI: Payload pull request thường không có `_links.web`; `webUrl` của
        # repository cho trang trình duyệt, còn `url` REST chỉ là phương án cuối
        # và được đổi sang dạng trang web.
        repository_web_url = str((item.get('repository') or {}).get('webUrl') or '').rstrip('/')
        remote_url = (
            ((item.get('_links') or {}).get('web') or {}).get('href')
            or (f"{repository_web_url}/pullrequest/{item['pullRequestId']}" if repository_web_url else '')
            or azure_pull_request_web_url(item.get('url') or '')
        )
        return ProviderReview(
            externalReviewId=str(item['pullRequestId']),
            number=int(item['pullRequestId']),
            title=item['title'],
            description=item.get('description'),
            state=state,
            isDraft=bool(item.get('isDraft', False)),
            externalAuthorId=str(author.get('id') or author.get('uniqueName') or 'unknown'),
            authorName=author.get('displayName'),
            sourceRef=item.get('sourceRefName') or '',
            targetRef=item.get('targetRefName') or '',
            headRevision=head,
            latestRevisionKey=iteration_key,
            remoteUrl=remote_url,
            externalCreatedAt=item['creationDate'],
            externalUpdatedAt=item.get('closedDate') or item['creationDate'],
            mergedAt=item.get('closedDate') if state == 'MERGED' else None,
            closedAt=item.get('closedDate'),
            reviewers=reviewers,
            revisions=revisions,
        )
