from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domains.scm.contracts import ProviderReview, read_only_capabilities, write_capabilities


class ScmContractTests(unittest.TestCase):
    def test_read_only_capabilities_keep_every_mutation_closed(self) -> None:
        github = read_only_capabilities('GITHUB')
        azure = read_only_capabilities('AZURE_DEVOPS')

        self.assertFalse(github.canComment)
        self.assertFalse(github.canChangeDecision)
        self.assertEqual(github.decisions, [])
        self.assertFalse(github.supportsIterations)
        self.assertTrue(azure.supportsIterations)

    def test_write_decisions_preserve_provider_semantics(self) -> None:
        github = write_capabilities('GITHUB', can_merge=False)
        azure = write_capabilities('AZURE_DEVOPS', can_merge=False)

        self.assertEqual(github.decisions, ['COMMENTED', 'APPROVED', 'CHANGES_REQUESTED'])
        self.assertEqual(
            azure.decisions,
            ['APPROVED', 'APPROVED_WITH_SUGGESTIONS', 'WAITING_FOR_AUTHOR', 'REJECTED'],
        )

    def test_review_contract_requires_stable_external_identity_and_revision(self) -> None:
        review = ProviderReview.model_validate(
            {
                'externalReviewId': '42',
                'number': 42,
                'title': 'Keep providers on one screen',
                'state': 'OPEN',
                'externalAuthorId': 'provider-user-1',
                'sourceRef': 'refs/heads/reviews',
                'targetRef': 'refs/heads/main',
                'headRevision': 'abc123',
                'latestRevisionKey': 'iteration:3:abc123',
                'remoteUrl': 'https://example.invalid/review/42',
                'externalCreatedAt': datetime.now(timezone.utc),
                'externalUpdatedAt': datetime.now(timezone.utc),
            }
        )

        self.assertEqual(review.externalReviewId, '42')
        self.assertEqual(review.latestRevisionKey, 'iteration:3:abc123')


if __name__ == '__main__':
    unittest.main()
