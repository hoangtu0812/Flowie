from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domains.auth import (
    _compatible_argon2_hash,
    _is_environment_admin,
    _safe_app_path,
    _valid_timezone,
)
from app.domains.native_admin import UpdateAdminUserInput
from pydantic import ValidationError


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

    def test_environment_admin_email_is_case_insensitive(self) -> None:
        settings = SimpleNamespace(admin_email='admin@example.com')

        self.assertTrue(_is_environment_admin('Admin@Example.com', settings))
        self.assertFalse(_is_environment_admin('member@example.com', settings))

    def test_microsoft_return_path_must_be_local(self) -> None:
        self.assertEqual(_safe_app_path('/workspace/teams'), '/workspace/teams')
        self.assertIsNone(_safe_app_path('//attacker.example/path'))
        self.assertIsNone(_safe_app_path('https://attacker.example/path'))

    def test_admin_api_cannot_promote_users(self) -> None:
        with self.assertRaises(ValidationError):
            UpdateAdminUserInput.model_validate({'isPlatformAdmin': True})


if __name__ == '__main__':
    unittest.main()
