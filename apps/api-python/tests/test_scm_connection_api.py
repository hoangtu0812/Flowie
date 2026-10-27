import asyncio
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI

from app.db.session import get_session
from app.domains.auth import current_user
from app.domains.scm.router import router


def test_creating_a_github_connection_returns_its_timestamps_as_utc_json():
    # The stored row holds naive UTC datetimes, which a raw JSONResponse cannot encode.
    # VI: Dòng lưu trữ chứa datetime UTC không múi giờ, mà JSONResponse thô không mã hoá được.
    created = datetime(2026, 10, 27, 4, 10)
    row = {
        'id': 'connection',
        'workspace_id': 'workspace',
        'provider': 'GITHUB',
        'external_account_id': '175687951',
        'display_name': 'Flowie',
        'status': 'ACTIVE',
        'auth_mode': 'INSTALLATION',
        'settings': {},
        'encrypted_value': None,
        'last_synced_at': None,
        'last_error': None,
        'created_at': created,
        'updated_at': created,
    }

    async def verify():
        app = FastAPI()
        app.include_router(router)
        app.state.settings = SimpleNamespace(scm_github_app_id='123', scm_github_app_private_key='key')
        app.dependency_overrides[current_user] = lambda: {'id': 'user'}
        app.dependency_overrides[get_session] = lambda: AsyncMock()
        with (
            patch('app.domains.scm.router._workspace_manager', AsyncMock()),
            patch('app.domains.scm.router._audit', AsyncMock()),
            patch('app.domains.scm.router.connection_row', AsyncMock(return_value=row)),
        ):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url='http://test'
            ) as client:
                response = await client.post(
                    '/api/v1/scm/connections',
                    json={
                        'workspaceId': 'workspace',
                        'provider': 'GITHUB',
                        'externalAccountId': '175687951',
                        'displayName': 'Flowie',
                        'authMode': 'INSTALLATION',
                    },
                )
        assert response.status_code == 201
        data = response.json()['data']
        assert data['createdAt'] == '2026-10-27T04:10:00Z'
        assert data['webhookPath'] == '/api/v1/scm/webhooks/github'

    asyncio.run(verify())
