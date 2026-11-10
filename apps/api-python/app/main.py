from __future__ import annotations

import asyncio
import logging
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import Settings
from .core.errors import ApiError, api_error_handler, validation_error_handler
from .core.readiness import dependency_status
from .db.session import create_session_factory
from .domains.agent import router as agent_router
from .domains.native_asks import router as asks_router
from .domains.native_customer_requests import router as customer_requests_router
from .domains.native_integrations import router as integrations_router
from .domains.scm.router import router as scm_router
from .domains.scm.router import webhook_router as scm_webhook_router
from .jobs.digest import digest_loop
from .jobs.dispatcher import dispatcher_loop
from .jobs.reminders import reminder_loop
from .jobs.scm_deliveries import scm_delivery_loop
from .jobs.scm_sync import scm_sync_loop
from .modules.agent_runs.api import router as agent_runs_router
from .modules.attachments.api import public_router as attachments_router
from .modules.attachments.api import router as native_attachments_router
from .modules.cycles.api import public_router as cycles_router
from .modules.cycles.api import router as native_cycles_router
from .modules.emojis.api import router as emojis_router
from .modules.identity.admin_api import router as admin_router
from .modules.identity.api import router as password_reset_router
from .modules.identity.auth import router as auth_router
from .modules.identity.users_api import router as users_router
from .modules.labels.api import router as labels_router
from .modules.link_metadata.api import router as link_metadata_router
from .modules.mcp.api import router as mcp_management_router
from .modules.mcp.maintenance import maintenance_loop
from .modules.mcp.uploads import router as mcp_upload_router
from .modules.notifications.api import router as notifications_router
from .modules.notifications.outbox import outbox_loop
from .modules.operations.heartbeats import supervise
from .modules.portfolio.initiatives_api import public_router as initiatives_router
from .modules.portfolio.initiatives_api import router as native_initiatives_router
from .modules.portfolio.projects_api import public_router as projects_router
from .modules.portfolio.projects_api import router as native_projects_router
from .modules.releases.api import router as releases_router
from .modules.reviews.api import router as reviews_router
from .modules.sla.api import router as slas_router
from .modules.teams.api import router as teams_router
from .modules.teams.dispatcher_api import router as team_dispatcher_router
from .modules.teams.insights_api import digest_router as digest_router
from .modules.teams.insights_api import router as team_insights_router
from .modules.views.api import router as views_router
from .modules.work_items.activity_api import public_router as activities_router
from .modules.work_items.activity_api import router as native_activities_router
from .modules.work_items.approvals_api import router as approvals_router
from .modules.work_items.comments_api import public_router as comments_router
from .modules.work_items.comments_api import router as native_comments_router
from .modules.work_items.documents_api import router as native_documents_router
from .modules.work_items.issues_api import public_router as issues_router
from .modules.work_items.issues_api import router as native_issues_router
from .modules.work_items.manual_order import router as manual_order_router
from .modules.work_items.pulse_api import router as pulse_router
from .modules.workspaces.api import router as workspaces_router


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime = settings or Settings.from_environment()
    # Uvicorn configures only its own `uvicorn.*` loggers, leaving the root
    # logger at WARNING with no handler, so every `logger.info` under `app/`
    # went nowhere. `basicConfig` attaches a handler only when the root has
    # none, so a host that already configured logging keeps its own setup.
    # VI: Uvicorn chỉ cấu hình các logger `uvicorn.*` của nó và để root ở mức
    # VI: WARNING không có handler, nên mọi `logger.info` dưới `app/` đều rơi vào
    # VI: hư không. `basicConfig` chỉ gắn handler khi root chưa có cái nào, nên
    # VI: một môi trường đã tự cấu hình logging vẫn giữ nguyên thiết lập riêng.
    logging.basicConfig(
        level=runtime.log_level,
        format='%(asctime)s %(levelname)s %(name)s %(message)s',
    )
    logging.getLogger().setLevel(runtime.log_level)

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
        from .jobs.ticket_status import ticket_status_loop
        ticket_status_task=tracked('ticket-status',ticket_status_loop(session_factory,outbox_stop),outbox_stop)
        from .modules.sharepoint.worker import sharepoint_loop
        sharepoint_task=tracked('sharepoint-publish',sharepoint_loop(session_factory,runtime,outbox_stop),outbox_stop)
        from .modules.news.worker import news_loop
        news_task=tracked('news',news_loop(session_factory,outbox_stop,runtime),outbox_stop)
        reminder_stop = asyncio.Event()
        reminder_task = tracked('reminders',reminder_loop(session_factory, reminder_stop),reminder_stop)
        digest_stop = asyncio.Event()
        digest_task = tracked('digest',digest_loop(session_factory, digest_stop),digest_stop)
        from .jobs.team_policies import team_policy_loop
        team_policy_stop = asyncio.Event()
        team_policy_task = tracked('team-policies', team_policy_loop(
            session_factory, team_policy_stop,
            interval_seconds=runtime.team_policy_scan_interval_seconds,
            writes_enabled=runtime.team_policy_writes_enabled), team_policy_stop)
        dispatch_stop = asyncio.Event()
        dispatch_task = tracked('team-dispatcher',dispatcher_loop(session_factory, dispatch_stop),dispatch_stop)
        scm_stop = asyncio.Event()
        scm_task = tracked('scm-delivery',scm_delivery_loop(session_factory, runtime, scm_stop),scm_stop)
        scm_sync_task = tracked('scm-sync',scm_sync_loop(session_factory, runtime, scm_stop),scm_stop) if runtime.scm_sync_interval_seconds > 0 else None
        try:
            yield
        finally:
            outbox_stop.set()
            reminder_stop.set()
            digest_stop.set()
            dispatch_stop.set()
            team_policy_stop.set()
            scm_stop.set()
            await asyncio.gather(*[task for task in [reminder_task,digest_task,dispatch_task,team_policy_task,scm_task,scm_sync_task,outbox_task,channel_task,maintenance_task,bulk_task,import_task,recurring_task,sla_task,ticket_status_task,sharepoint_task,news_task] if task],return_exceptions=True)
            await mcp_stack.aclose()
            await engine.dispose()

    from fastapi import Depends

    from .modules.access.read_only import enforce_read_only_role
    # Read-only workspace admins are refused every write in one place (DTD-190).
    # VI: Quản trị workspace chỉ đọc bị từ chối mọi thao tác ghi tại một chỗ (DTD-190).
    app = FastAPI(title='Flowie Python API', version='0.1.0', lifespan=lifespan, dependencies=[Depends(enforce_read_only_role)])
    from .modules.operations.diagnostics import build_identity, install_diagnostics
    install_diagnostics(app)
    app.state.settings = runtime
    app.include_router(mcp_management_router)
    app.include_router(mcp_upload_router)
    app.include_router(agent_runs_router)
    from .modules.agent_runs.operations import router as operations_router
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
    # Starlette types every handler as taking a bare Exception even though it
    # dispatches by the registered class, so a narrower handler needs the ignore.
    # VI: Starlette khai mọi handler nhận Exception chung dù nó phân phối theo đúng
    # VI: lớp đã đăng ký, nên handler cho lớp hẹp hơn cần bỏ qua kiểm tra này.
    app.add_exception_handler(ApiError, api_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
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
    app.include_router(manual_order_router)
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
    app.include_router(approvals_router)

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
