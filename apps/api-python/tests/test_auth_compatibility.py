from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domains.auth import _compatible_argon2_hash, _valid_timezone


class Argon2CompatibilityTests(unittest.TestCase):
    def test_normalizes_legacy_node_parameter_order(self) -> None:
        legacy = '$argon2id$v=19$m=65536,p=4,t=3$encoded-salt$encoded-hash'

        self.assertEqual(
            _compatible_argon2_hash(legacy),
            '$argon2id$v=19$m=65536,t=3,p=4$encoded-salt$encoded-hash',
        )

    def test_leaves_standard_parameter_order_unchanged(self) -> None:
        standard = '$argon2id$v=19$m=65536,t=3,p=4$encoded-salt$encoded-hash'

        self.assertEqual(_compatible_argon2_hash(standard), standard)

    def test_normalizes_windows_saigon_timezone_alias(self) -> None:
        self.assertEqual(_valid_timezone('Asia/Saigon'), 'Asia/Ho_Chi_Minh')


if __name__ == '__main__':
    unittest.main()
