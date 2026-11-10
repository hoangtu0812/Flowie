"""Every HTTP router the API serves, in registration order.

FastAPI matches routes in the order they were registered, so the order of
these lists is behaviour: reordering can change which handler answers when
two paths overlap. The lists are written out by hand instead of discovered by
scanning `app/modules`, so mypy and readers see every import statically. A new
module adds its router here; `create_app` registers both lists.

VI: Mọi router HTTP mà API phục vụ, theo đúng thứ tự đăng ký.
VI: FastAPI khớp route theo thứ tự đăng ký, nên thứ tự các danh sách này là hành
VI: vi: đảo thứ tự có thể đổi handler trả lời khi hai đường dẫn chồng nhau. Danh
VI: sách được viết tay thay vì quét `app/modules`, để mypy và người đọc thấy mọi
VI: import một cách tĩnh. Module mới thêm router của mình vào đây; `create_app`
VI: đăng ký cả hai danh sách.
"""
from __future__ import annotations

from fastapi import APIRouter

from .modules.agent.api import router as agent_router
from .modules.agent_runs.api import router as agent_runs_router
from .modules.agent_runs.operations import router as operations_router
from .modules.archive.api import router as archive_router
from .modules.attachments.api import public_router as attachments_router
from .modules.attachments.api import router as native_attachments_router
from .modules.audit.api import router as audit_router
from .modules.cycles.api import public_router as cycles_router
from .modules.cycles.api import router as native_cycles_router
from .modules.data_exchange.api import router as data_exchange_router
from .modules.emojis.api import router as emojis_router
from .modules.identity.admin_api import router as admin_router
from .modules.identity.api import router as password_reset_router
from .modules.identity.auth import router as auth_router
from .modules.identity.preferences import router as preferences_router
from .modules.identity.security.api import router as account_security_router
from .modules.identity.security.mfa.api import router as mfa_router
from .modules.identity.users_api import router as users_router
from .modules.integrations.api import router as integrations_router
from .modules.labels.api import router as labels_router
from .modules.link_metadata.api import router as link_metadata_router
from .modules.mcp.api import router as mcp_management_router
from .modules.mcp.uploads import router as mcp_upload_router
from .modules.news.api import router as news_router
from .modules.notifications.api import router as notifications_router
from .modules.notifications.channels import router as channels_router
from .modules.operations.api import router as operations_admin_router
from .modules.portfolio.initiatives_api import public_router as initiatives_router
from .modules.portfolio.initiatives_api import router as native_initiatives_router
from .modules.portfolio.projects_api import public_router as projects_router
from .modules.portfolio.projects_api import router as native_projects_router
from .modules.recurring.api import router as recurring_router
from .modules.releases.api import router as releases_router
from .modules.reporting.api import router as reporting_router
from .modules.reviews.api import router as reviews_router
from .modules.scm.router import router as scm_router
from .modules.scm.router import webhook_router as scm_webhook_router
from .modules.search.api import router as search_router
from .modules.service_desk.api import router as asks_router
from .modules.service_desk.customer_requests_api import (
    router as customer_requests_router,
)
from .modules.sharepoint.api import router as sharepoint_router
from .modules.sla.api import router as slas_router
from .modules.teams.api import router as teams_router
from .modules.teams.dispatcher_api import router as team_dispatcher_router
from .modules.teams.insights_api import digest_router
from .modules.teams.insights_api import router as team_insights_router
from .modules.views.api import router as views_router
from .modules.work_items.activity_api import public_router as activities_router
from .modules.work_items.activity_api import router as native_activities_router
from .modules.work_items.approvals_api import router as approvals_router
from .modules.work_items.bulk_api import router as bulk_router
from .modules.work_items.comments_api import public_router as comments_router
from .modules.work_items.comments_api import router as native_comments_router
from .modules.work_items.documents_api import router as native_documents_router
from .modules.work_items.issues_api import public_router as issues_router
from .modules.work_items.issues_api import router as native_issues_router
from .modules.work_items.manual_order import router as manual_order_router
from .modules.work_items.pulse_api import router as pulse_router
from .modules.work_items.workflow_api import router as workflow_router
from .modules.workspaces.api import router as workspaces_router

# Registered before the `/mcp` transport mount, so they come ahead of it in
# `app.routes`; this keeps the route table identical to the hand-written order.
# VI: Đăng ký trước khi gắn transport `/mcp`, nên đứng trước nó trong
# VI: `app.routes`; nhờ vậy bảng route giữ nguyên thứ tự viết tay trước đây.
PRE_MCP_ROUTERS: list[APIRouter] = [
    mcp_management_router,
    mcp_upload_router,
    agent_runs_router,
    operations_router,
]

# Registered after the `/mcp` mount. Each `_native/...` router stays directly
# before its public `/api/v1/...` twin, as before.
# VI: Đăng ký sau khi gắn `/mcp`. Mỗi router `_native/...` vẫn đứng ngay trước
# VI: router public `/api/v1/...` tương ứng, như trước.
ROUTERS: list[APIRouter] = [
    auth_router,
    preferences_router,
    search_router,
    password_reset_router,
    agent_router,
    admin_router,
    native_activities_router,
    activities_router,
    native_attachments_router,
    attachments_router,
    native_comments_router,
    comments_router,
    native_cycles_router,
    cycles_router,
    native_issues_router,
    issues_router,
    workflow_router,
    bulk_router,
    archive_router,
    audit_router,
    data_exchange_router,
    recurring_router,
    operations_admin_router,
    native_initiatives_router,
    initiatives_router,
    native_documents_router,
    sharepoint_router,
    news_router,
    customer_requests_router,
    asks_router,
    slas_router,
    reporting_router,
    account_security_router,
    mfa_router,
    pulse_router,
    emojis_router,
    link_metadata_router,
    notifications_router,
    channels_router,
    integrations_router,
    views_router,
    manual_order_router,
    native_projects_router,
    projects_router,
    releases_router,
    labels_router,
    teams_router,
    team_insights_router,
    digest_router,
    team_dispatcher_router,
    users_router,
    workspaces_router,
    scm_router,
    scm_webhook_router,
    reviews_router,
    approvals_router,
]
