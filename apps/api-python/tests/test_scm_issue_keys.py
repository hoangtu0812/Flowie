from datetime import datetime, timezone

from app.domains.scm.contracts import ProviderReview
from app.domains.scm.service import detected_issue_keys


def review(source_ref: str, title: str, description: str | None = None) -> ProviderReview:
    now = datetime.now(timezone.utc)
    return ProviderReview(
        externalReviewId='1',
        title=title,
        description=description,
        state='OPEN',
        externalAuthorId='author',
        sourceRef=source_ref,
        targetRef='main',
        headRevision='abc',
        latestRevisionKey='abc',
        remoteUrl='https://example.invalid/pull/1',
        externalCreatedAt=now,
        externalUpdatedAt=now,
    )


def test_issue_keys_are_found_in_branch_title_and_description_in_any_case():
    assert detected_issue_keys(
        review('feat/dtd-6-issue-detail-ui', 'feat: task detail (DTD-6)', 'Also fixes cds-39.')
    ) == ['CDS-39', 'DTD-6']


def test_version_numbers_are_ignored_and_lookalikes_stay_candidates():
    # UTF-8 is only a candidate: a link is created only if the team has an issue with that key.
    # VI: UTF-8 chỉ là ứng viên: liên kết chỉ được tạo nếu team có issue mang mã đó.
    assert detected_issue_keys(review('release/v1.2.3', 'Bump utf-8 handling', None)) == ['UTF-8']
    assert detected_issue_keys(review('main', 'Refactor', None)) == []
