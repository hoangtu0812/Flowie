from __future__ import annotations

from contextlib import AsyncExitStack, asynccontextmanager
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
from .modules.identity.api import router as password_reset_router
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
from .domains.link_metadata import router as link_metadata_router
from .domains.native_notifications import router as notifications_router
from .domains.native_integrations import router as integrations_router
from .domains.native_views import router as views_router
from .domains.native_projects import public_router as projects_router
from .domains.native_projects import router as native_projects_router
from .domains.native_releases import router as releases_router
from .domains.labels import router as labels_router
from .domains.teams import router as teams_router
from .domains.team_insights import digest_router as digest_router
from .domains.team_insights import router as team_insights_router
from .domains.team_dispatcher import router as team_dispatcher_router
from .domains.users import router as users_router
from .domains.workspaces import router as workspaces_router
from .jobs.reminders import reminder_loop
from .jobs.digest import digest_loop
from .jobs.dispatcher import dispatcher_loop
from .domains.scm.router import router as scm_router
from .domains.scm.router import webhook_router as scm_webhook_router
from .jobs.scm_deliveries import scm_delivery_loop
from .jobs.scm_sync import scm_sync_loop
from .domains.reviews import router as reviews_router
from .modules.mcp.api import router as mcp_management_router
from .modules.notifications.outbox import outbox_loop
from .modules.agent_runs.api import router as agent_runs_router
from .modules.agent_runs.dispatcher import dispatcher_loop as agent_run_dispatcher_loop
from .modules.mcp.maintenance import maintenance_loop
from .modules.operations.heartbeats import supervise


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime = settings or Settings.from_environment()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        session_factory, engine = create_session_factory(runtime)
        app.state.session_factory = session_factory
        def tracked(job,operation,stop):
            return asyncio.create_task(supervise(session_factory,job,operation,stop))
        mcp_stack = AsyncExitStack()
        if runtime.mcp_enabled:
            await mcp_stack.enter_async_context(app.state.mcp_server.session_manager.run())
        outbox_stop = asyncio.Event()
        outbox_task = tracked('notification-outbox',outbox_loop(session_factory, outbox_stop),outbox_stop)
        from .modules.notifications.delivery_worker import delivery_loop
        channel_task=tracked('notification-channels',delivery_loop(session_factory,runtime,outbox_stop),outbox_stop)
        maintenance_task=tracked('maintenance',maintenance_loop(session_factory,outbox_stop),outbox_stop)
        from .modules.work_items.bulk_worker import bulk_loop
        bulk_task=tracked('bulk-issues',bulk_loop(session_factory,outbox_stop),outbox_stop)
        from .modules.data_exchange.import_worker import import_loop
        import_task=tracked('issue-import',import_loop(session_factory,outbox_stop),outbox_stop)
        from .modules.recurring.worker import recurring_loop
        recurring_task=tracked('recurring-issues',recurring_loop(session_factory,outbox_stop),outbox_stop)
        from .modules.sla.worker import sla_loop
        sla_task=tracked('sla-clocks',sla_loop(session_factory,outbox_stop),outbox_stop)
        from .modules.sharepoint.worker import sharepoint_loop
        sharepoint_task=tracked('sharepoint-publish',sharepoint_loop(session_factory,runtime,outbox_stop),outbox_stop)
        from .modules.news.worker import news_loop
        news_task=tracked('news',news_loop(session_factory,outbox_stop,runtime),outbox_stop)
        agent_runs_stop = asyncio.Event()
        agent_runs_task = tracked('agent-dispatcher',agent_run_dispatcher_loop(session_factory, agent_runs_stop),agent_runs_stop) if runtime.mcp_enabled and runtime.mcp_writes_enabled else None
        reminder_stop = asyncio.Event()
        reminder_task = tracked('reminders',reminder_loop(session_factory, reminder_stop),reminder_stop)
        digest_stop = asyncio.Event()
        digest_task = tracked('digest',digest_loop(session_factory, digest_stop),digest_stop)
        dispatch_stop = asyncio.Event()
        dispatch_task = tracked('team-dispatcher',dispatcher_loop(session_factory, dispatch_stop),dispatch_stop)
        scm_stop = asyncio.Event()
        scm_task = tracked('scm-delivery',scm_delivery_loop(session_factory, runtime, scm_stop),scm_stop)
        scm_sync_task = tracked('scm-sync',scm_sync_loop(session_factory, runtime, scm_stop),scm_stop) if runtime.scm_sync_interval_seconds > 0 else None
        try:
            yield
        finally:
            outbox_stop.set()
            agent_runs_stop.set()
            reminder_stop.set()
            digest_stop.set()
            dispatch_stop.set()
            scm_stop.set()
            await asyncio.gather(*[task for task in [reminder_task,digest_task,dispatch_task,scm_task,scm_sync_task,outbox_task,channel_task,maintenance_task,agent_runs_task,bulk_task,import_task,recurring_task,sla_task,sharepoint_task,news_task] if task],return_exceptions=True)
            await mcp_stack.aclose()
            await engine.dispose()

    app = FastAPI(title='Flowie Python API', version='0.1.0', lifespan=lifespan)
    from .modules.operations.diagnostics import install_diagnostics, build_identity
    install_diagnostics(app)
    app.state.settings = runtime
    app.include_router(mcp_management_router)
    app.include_router(agent_runs_router)
    from .modules.agent_runs.evidence import router as operations_router
    app.include_router(operations_router)
    if runtime.mcp_enabled:
        from .modules.mcp.transport import build_server
        server, transport = build_server(app)
        app.state.mcp_server = server
        app.mount('/mcp', transport)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(runtime.cors_origins),
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
        expose_headers=['x-request-id','x-flowie-revision'],
    )
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.include_router(auth_router)
    from .modules.identity.preferences import router as preferences_router
    app.include_router(preferences_router)
    from .modules.search.api import router as search_router
    app.include_router(search_router)
    app.include_router(password_reset_router)
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
    from .modules.work_items.workflow_api import router as workflow_router
    app.include_router(workflow_router)
    from .modules.work_items.bulk_api import router as bulk_router
    app.include_router(bulk_router)
    from .modules.archive.api import router as archive_router
    app.include_router(archive_router)
    from .modules.audit.api import router as audit_router
    app.include_router(audit_router)
    from .modules.data_exchange.api import router as data_exchange_router
    app.include_router(data_exchange_router)
    from .modules.recurring.api import router as recurring_router
    app.include_router(recurring_router)
    from .modules.operations.api import router as operations_admin_router
    app.include_router(operations_admin_router)
    app.include_router(native_initiatives_router)
    app.include_router(initiatives_router)
    app.include_router(native_documents_router)
    from .modules.sharepoint.api import router as sharepoint_router
    app.include_router(sharepoint_router)
    from .modules.news.api import router as news_router
    app.include_router(news_router)
    app.include_router(customer_requests_router)
    app.include_router(asks_router)
    app.include_router(slas_router)
    from .modules.reporting.api import router as reporting_router
    app.include_router(reporting_router)
    from .modules.identity.security.api import router as account_security_router
    app.include_router(account_security_router)
    from .modules.identity.security.mfa.api import router as mfa_router
    app.include_router(mfa_router)
    app.include_router(pulse_router)
    app.include_router(emojis_router)
    app.include_router(link_metadata_router)
    app.include_router(notifications_router)
    from .modules.notifications.channels import router as channels_router
    app.include_router(channels_router)
    app.include_router(integrations_router)
    app.include_router(views_router)
    app.include_router(native_projects_router)
    app.include_router(projects_router)
    app.include_router(releases_router)
    app.include_router(labels_router)
    app.include_router(teams_router)
    app.include_router(team_insights_router)
    app.include_router(digest_router)
    app.include_router(team_dispatcher_router)
    app.include_router(users_router)
    app.include_router(workspaces_router)
    app.include_router(scm_router)
    app.include_router(scm_webhook_router)
    app.include_router(reviews_router)

    @app.get('/readyz')
    async def readyz(request: Request) -> JSONResponse:
        dependencies = await dependency_status(runtime,getattr(request.app.state,'session_factory',None))
        status = 'ok' if all(dependencies.values()) else 'degraded'
        return JSONResponse(
            status_code=200 if status == 'ok' else 503,
            content={'status': status, 'service': 'api-python', 'dependencies': dependencies, **build_identity()},
        )

    @app.get('/livez')
    async def livez():
        return {'status':'ok','service':'api-python',**build_identity()}

    return app


app = create_app()
