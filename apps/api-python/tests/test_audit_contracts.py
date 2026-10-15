import asyncio
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI

from app.core.audit_context import audit_source
from app.db.session import get_session
from app.domains.auth import current_user
from app.modules.audit.api import router
from app.modules.operations.diagnostics import install_diagnostics


def test_transport_attribution_cannot_be_set_by_a_request_header():
    async def verify():
        app = FastAPI()
        install_diagnostics(app)

        @app.get("/mcp/test")
        @app.get("/api/v1/test")
        async def source():
            return {"source": audit_source.get()}

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            assert (
                await client.get("/api/v1/test", headers={"x-audit-source": "AI"})
            ).json() == {"source": "WEB"}
            assert (
                await client.get("/mcp/test", headers={"x-audit-source": "WEB"})
            ).json() == {"source": "AI"}
        assert audit_source.get() == "SYSTEM"

    asyncio.run(verify())


def test_http_filter_validation_prevents_invalid_queries():
    async def verify():
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[current_user] = lambda: {"id": "user"}
        app.dependency_overrides[get_session] = lambda: None
        with patch("app.modules.audit.api.audit_page", AsyncMock()) as query:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                for parameters in [
                    "source=spoofed",
                    "entityType=project;DROP",
                    "limit=101",
                    "since=not-a-date",
                ]:
                    assert (
                        await client.get(
                            "/api/v1/audit?workspaceId=workspace&" + parameters
                        )
                    ).status_code == 422
            query.assert_not_called()

    asyncio.run(verify())
