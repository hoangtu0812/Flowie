from __future__ import annotations

from datetime import datetime
from typing import Literal, Protocol

from pydantic import BaseModel, Field


ScmProviderName = Literal['GITHUB', 'AZURE_DEVOPS']
ReviewState = Literal['OPEN', 'MERGED', 'CLOSED', 'ABANDONED']
ReviewDecision = Literal[
    'NONE',
    'PENDING',
    'COMMENTED',
    'APPROVED',
    'APPROVED_WITH_SUGGESTIONS',
    'CHANGES_REQUESTED',
    'WAITING_FOR_AUTHOR',
    'REJECTED',
]


class ReviewCapabilities(BaseModel):
    canComment: bool = False
    canInlineComment: bool = False
    canChangeDecision: bool = False
    canMerge: bool = False
    supportsIterations: bool = False
    decisions: list[ReviewDecision] = Field(default_factory=list)


class ProviderRepository(BaseModel):
    externalRepositoryId: str
    externalProjectId: str | None = None
    name: str
    fullName: str
    isPrivate: bool = True
    defaultBranch: str | None = None


class ProviderReviewer(BaseModel):
    externalUserId: str
    displayName: str | None = None
    reviewerKind: Literal['USER', 'TEAM'] = 'USER'
    isRequired: bool = False
    decision: ReviewDecision = 'NONE'
    providerDecision: str | None = None


class ProviderRevision(BaseModel):
    externalRevisionId: str
    sequence: int | None = None
    baseRevision: str | None = None
    headRevision: str
    externalCreatedAt: datetime | None = None


class ProviderReview(BaseModel):
    externalReviewId: str
    number: int | None = None
    title: str
    description: str | None = None
    state: ReviewState
    isDraft: bool = False
    externalAuthorId: str
    authorName: str | None = None
    sourceRef: str
    targetRef: str
    headRevision: str
    latestRevisionKey: str
    remoteUrl: str
    additions: int | None = None
    deletions: int | None = None
    changedFiles: int | None = None
    externalCreatedAt: datetime
    externalUpdatedAt: datetime
    mergedAt: datetime | None = None
    closedAt: datetime | None = None
    reviewers: list[ProviderReviewer] = Field(default_factory=list)
    revisions: list[ProviderRevision] = Field(default_factory=list)


class ReviewProvider(Protocol):
    provider: ScmProviderName

    async def list_repositories(self) -> list[ProviderRepository]: ...

    async def list_reviews(self, repository: ProviderRepository) -> list[ProviderReview]: ...

    async def get_review(
        self, repository: ProviderRepository, external_review_id: str
    ) -> ProviderReview: ...


def read_only_capabilities(provider: ScmProviderName) -> ReviewCapabilities:
    return ReviewCapabilities(supportsIterations=provider == 'AZURE_DEVOPS')


def write_capabilities(provider: ScmProviderName, *, can_merge: bool) -> ReviewCapabilities:
    if provider == 'GITHUB':
        decisions: list[ReviewDecision] = ['COMMENTED', 'APPROVED', 'CHANGES_REQUESTED']
    else:
        decisions = [
            'APPROVED',
            'APPROVED_WITH_SUGGESTIONS',
            'WAITING_FOR_AUTHOR',
            'REJECTED',
        ]
    return ReviewCapabilities(
        canComment=True,
        canInlineComment=True,
        canChangeDecision=True,
        canMerge=can_merge,
        supportsIterations=provider == 'AZURE_DEVOPS',
        decisions=decisions,
    )
