from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import Settings
from .core.errors import ApiError, api_error_handler, validation_error_handler
from .core.readiness import dependency_status
from .db.session import create_session_factory
from .domains.auth import router as auth_router
from .domains.agent import router as agent_router
from .domains.native_admin import router as admin_router
from .domains.native_activities import router as native_activities_router
from .domains.native_activities import public_router as activities_router
from .domains.native_attachments import router as native_attachments_router
from .domains.native_attachments import public_router as attachments_router
from .domains.native_comments import router as native_comments_router
from .domains.native_comments import public_router as comments_router
from .domains.native_cycles import router as native_cycles_router
from .domains.native_cycles import public_router as cycles_router
from .domains.native_issues import public_router as issues_router
from .domains.native_issues import router as native_issues_router
from .domains.native_initiatives import public_router as initiatives_router
from .domains.native_initiatives import router as native_initiatives_router
from .domains.native_documents import router as native_documents_router
from .domains.native_customer_requests import router as customer_requests_router
from .domains.native_asks import router as asks_router
from .domains.native_slas import router as slas_router
from .domains.native_pulse import router as pulse_router
from .domains.native_emojis import router as emojis_router
from .domains.native_notifications import router as notifications_router
from .domains.native_integrations import router as integrations_router
from .domains.native_views import router as views_router
from .domains.native_projects import public_router as projects_router
from .domains.native_projects import router as native_projects_router
from .domains.native_releases import router as releases_router
from .domains.labels import router as labels_router
from .domains.teams import router as teams_router
from .domains.users import router as users_router
from .domains.workspaces import router as workspaces_router
from .jobs.reminders import reminder_loop
from .domains.scm.router import router as scm_router
from .domains.scm.router import webhook_router as scm_webhook_router
from .jobs.scm_deliveries import scm_delivery_loop
from .domains.reviews import router as reviews_router


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime = settings or Settings.from_environment()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        session_factory, engine = create_session_factory(runtime)
        app.state.session_factory = session_factory
        reminder_stop = asyncio.Event()
        reminder_task = asyncio.create_task(reminder_loop(session_factory, reminder_stop))
        scm_stop = asyncio.Event()
        scm_task = asyncio.create_task(scm_delivery_loop(session_factory, runtime, scm_stop))
        try:
            yield
        finally:
            reminder_stop.set()
            scm_stop.set()
            await reminder_task
            await scm_task
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
    app.include_router(agent_router)
    app.include_router(admin_router)
    app.include_router(native_activities_router)
    app.include_router(activities_router)
    app.include_router(native_attachments_router)
    app.include_router(attachments_router)
    app.include_router(native_comments_router)
    app.include_router(comments_router)
    app.include_router(native_cycles_router)
    app.include_router(cycles_router)
    app.include_router(native_issues_router)
    app.include_router(issues_router)
    app.include_router(native_initiatives_router)
    app.include_router(initiatives_router)
    app.include_router(native_documents_router)
    app.include_router(customer_requests_router)
    app.include_router(asks_router)
    app.include_router(slas_router)
    app.include_router(pulse_router)
    app.include_router(emojis_router)
    app.include_router(notifications_router)
    app.include_router(integrations_router)
    app.include_router(views_router)
    app.include_router(native_projects_router)
    app.include_router(projects_router)
    app.include_router(releases_router)
    app.include_router(labels_router)
    app.include_router(teams_router)
    app.include_router(users_router)
    app.include_router(workspaces_router)
    app.include_router(scm_router)
    app.include_router(scm_webhook_router)
    app.include_router(reviews_router)

    @app.get('/readyz')
    async def readyz(request: Request) -> JSONResponse:
        del request
        dependencies = await dependency_status(runtime)
        status = 'ok' if all(dependencies.values()) else 'degraded'
        return JSONResponse(
            status_code=200 if status == 'ok' else 503,
            content={'status': status, 'service': 'api-python', 'dependencies': dependencies},
        )

    return app


app = create_app()
