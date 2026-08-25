from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
from typing import Final

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .core.config import Settings
from .core.errors import ApiError, api_error_handler, validation_error_handler
from .core.readiness import dependency_status
from .db.session import create_session_factory
from .domains.auth import router as auth_router
from .domains.native_activities import router as native_activities_router
from .domains.native_attachments import router as native_attachments_router
from .domains.native_comments import router as native_comments_router
from .domains.native_cycles import router as native_cycles_router
from .domains.native_issues import router as native_issues_router
from .domains.native_projects import public_router as projects_router
from .domains.native_projects import router as native_projects_router
from .domains.teams import router as teams_router
from .domains.users import router as users_router
from .domains.workspaces import router as workspaces_router
from .legacy.proxy import proxy_legacy_request
from .jobs.reminders import reminder_loop

API_METHODS: Final = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']


def create_app(
    settings: Settings | None = None,
    *,
    legacy_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    runtime = settings or Settings.from_environment()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        session_factory, engine = create_session_factory(runtime)
        app.state.session_factory = session_factory
        reminder_stop = asyncio.Event()
        reminder_task = asyncio.create_task(reminder_loop(session_factory, reminder_stop))
        async with httpx.AsyncClient(
            base_url=runtime.legacy_api_url,
            timeout=runtime.legacy_timeout_seconds,
            transport=legacy_transport,
        ) as client:
            app.state.legacy_client = client
            try:
                yield
            finally:
                reminder_stop.set()
                await reminder_task
                await engine.dispose()

    app = FastAPI(title='Flowie Python API', version='0.1.0', lifespan=lifespan)
    app.state.settings = runtime
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(runtime.cors_origins),
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.include_router(auth_router)
    app.include_router(native_activities_router)
    app.include_router(native_attachments_router)
    app.include_router(native_comments_router)
    app.include_router(native_cycles_router)
    app.include_router(native_issues_router)
    app.include_router(native_projects_router)
    app.include_router(projects_router)
    app.include_router(teams_router)
    app.include_router(users_router)
    app.include_router(workspaces_router)

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
