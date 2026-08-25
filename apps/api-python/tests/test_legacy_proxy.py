from __future__ import annotations

import sys
import unittest
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.main import create_app


class LegacyFacadeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.requests: list[httpx.Request] = []

        def legacy_handler(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            return httpx.Response(
                200,
                json={'data': {'source': 'legacy'}},
                headers=[
                    ('set-cookie', 'flowie_access=access; HttpOnly; Path=/'),
                    ('set-cookie', 'flowie_refresh=refresh; HttpOnly; Path=/'),
                ],
            )

        settings = Settings(
            api_port=4000,
            legacy_api_url='http://legacy.test',
            legacy_timeout_seconds=5,
            cors_origins=('http://localhost:3000',),
            postgres_host='postgres',
            postgres_port=5432,
            redis_host='redis',
            redis_port=6379,
            minio_host='minio',
            minio_port=9000,
            database_url='postgresql+asyncpg://circle:circle@postgres:5432/circle',
            auth_jwt_secret='test-secret',
            auth_access_token_ttl_seconds=900,
            auth_refresh_token_ttl_days=30,
            auth_cookie_secure=False,
        )
        self.client = TestClient(
            create_app(settings, legacy_transport=httpx.MockTransport(legacy_handler))
        )
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)

    def test_proxies_unmigrated_relative_path_body_and_auth_cookie(self) -> None:
        response = self.client.post(
            '/api/v1/projects?source=web',
            content=b'{"email":"user@example.com"}',
            headers={'content-type': 'application/json', 'cookie': 'flowie_access=old-token'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'data': {'source': 'legacy'}})
        self.assertEqual(self.requests[0].url.path, '/api/v1/projects')
        self.assertEqual(self.requests[0].url.query, b'source=web')
        self.assertEqual(self.requests[0].content, b'{"email":"user@example.com"}')
        self.assertEqual(self.requests[0].headers['cookie'], 'flowie_access=old-token')
        self.assertIn('flowie_access=access', response.headers['set-cookie'])
        self.assertIn('flowie_refresh=refresh', response.headers['set-cookie'])


if __name__ == '__main__':
    unittest.main()
