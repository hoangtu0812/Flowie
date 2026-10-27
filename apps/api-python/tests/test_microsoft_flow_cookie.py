from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.domains.auth import _microsoft_flow_cookie_path


class MicrosoftFlowCookiePathTests(unittest.TestCase):
    def path(self, redirect_uri: str) -> str:
        return _microsoft_flow_cookie_path(SimpleNamespace(azure_ad_redirect_uri=redirect_uri))

    def test_root_deployment_keeps_the_api_path(self) -> None:
        self.assertEqual(
            self.path('https://flowie.example/api/v1/auth/microsoft/callback'),
            '/api/v1/auth/microsoft',
        )

    def test_sub_path_deployment_follows_the_proxy_prefix(self) -> None:
        self.assertEqual(
            self.path('https://poc-dtd.bsr.com.vn/flowie/api/v1/auth/microsoft/callback'),
            '/flowie/api/v1/auth/microsoft',
        )

    def test_missing_redirect_uri_falls_back_to_the_api_path(self) -> None:
        self.assertEqual(self.path(''), '/api/v1/auth/microsoft')


if __name__ == '__main__':
    unittest.main()
