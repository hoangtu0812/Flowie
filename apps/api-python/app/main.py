from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Final

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import Settings
from .core.readiness import dependency_status
from .legacy.proxy import proxy_legacy_request

API_METHODS: Final = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']


def create_app(
    settings: Settings | None = None,
    *,
    legacy_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    runtime = settings or Settings.from_environment()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient(
            base_url=runtime.legacy_api_url,
            timeout=runtime.legacy_timeout_seconds,
            transport=legacy_transport,
        ) as client:
            app.state.legacy_client = client
            yield

    app = FastAPI(title='Flowie Python API', version='0.1.0', lifespan=lifespan)
    app.state.settings = runtime
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(runtime.cors_origins),
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

    @app.get('/readyz')
    async def readyz(request: Request) -> JSONResponse:
        dependencies = await dependency_status(runtime)
        try:
            legacy = await request.app.state.legacy_client.get('/api/v1/health')
            legacy_ready = legacy.is_success
        except httpx.RequestError:
            legacy_ready = False
        status = 'ok' if legacy_ready and all(dependencies.values()) else 'degraded'
        return JSONResponse(
            status_code=200 if status == 'ok' else 503,
            content={'status': status, 'service': 'api-python', 'dependencies': {**dependencies, 'legacy': legacy_ready}},
        )

    @app.api_route('/api/v1/{path:path}', methods=API_METHODS)
    async def legacy_facade(request: Request, path: str) -> Response:
        return await proxy_legacy_request(request, path)

    return app


app = create_app()
