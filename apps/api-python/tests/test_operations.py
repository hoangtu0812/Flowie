import asyncio
from dataclasses import replace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI

from app.core.config import Settings
from app.core.readiness import bounded_probe
from app.modules.operations.api import ClientError
from app.modules.operations.diagnostics import install_diagnostics, logger
from app.storage.minio import MinioStorage


def test_dependency_probe_is_bounded_and_reports_failures_as_false():
    async def failing():
        raise ConnectionError('refused')
    async def verify():
        assert await bounded_probe(asyncio.sleep(0,True),.5) is True
        assert await bounded_probe(failing(),.5) is False
        assert await bounded_probe(asyncio.sleep(1),.01) is False
    asyncio.run(verify())


def test_storage_readiness_requires_bucket_access_without_mutation():
    async def verify():
        settings=replace(Settings.from_environment(),s3_bucket='restricted')
        storage=MinioStorage(settings)
        for status,expected in [(200,True),(403,False),(404,False),(503,False)]:
            with patch.object(storage,'_request',AsyncMock(return_value=httpx.Response(status))) as request:
                assert await storage.ready() is expected
                request.assert_awaited_once_with('HEAD','/restricted')
    asyncio.run(verify())


def test_request_diagnostics_hide_query_body_and_exception_secrets(caplog,monkeypatch):
    monkeypatch.setenv('FLOWIE_REVISION','a'*40)
    async def verify():
        app=FastAPI()
        install_diagnostics(app)
        @app.get('/resource/{identifier}')
        async def resource(identifier:str):
            raise RuntimeError('sensitive-exception-details')
        logger.addHandler(caplog.handler)
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
                response=await client.get('/resource/private-resource?token=sensitive-query',headers={'authorization':'Bearer sensitive-auth','x-request-id':'review-reference'})
            assert response.status_code==500
            assert response.json()['requestId']=='review-reference'
            assert response.headers['x-flowie-revision']=='a'*40
            messages=' '.join(record.getMessage() for record in caplog.records if record.name=='flowie.requests')
            for secret in ['sensitive-exception-details','private-resource','sensitive-query','sensitive-auth']:
                assert secret not in messages and secret not in response.text
        finally:
            logger.removeHandler(caplog.handler)
    asyncio.run(verify())


def test_browser_error_contract_rejects_free_form_payloads():
    with pytest.raises(ValueError):
        ClientError(workspaceId='workspace',category='render',routeKind='issue',message='private content')
    with pytest.raises(ValueError):
        ClientError(workspaceId='workspace',category='render',routeKind='issue',digest='https://private?token=secret')
