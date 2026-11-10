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
from .jobs.digest import digest_loop
from .jobs.dispatcher import dispatcher_loop
from .jobs.reminders import reminder_loop
from .jobs.scm_deliveries import scm_delivery_loop
from .jobs.scm_sync import scm_sync_loop
from .modules.mcp.maintenance import maintenance_loop
from .modules.notifications.outbox import outbox_loop
from .modules.operations.heartbeats import supervise
from .routers import PRE_MCP_ROUTERS, ROUTERS


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
    for router in PRE_MCP_ROUTERS:
        app.include_router(router)
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
    for router in ROUTERS:
        app.include_router(router)

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
