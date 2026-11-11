from fastapi import Depends, Query
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from ...core.clock import utcnow
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ..access.membership import manager
from ..identity.auth import current_user
from ..mcp.quotas import limits, update_limits
from ..mcp.registry import TOOLS
from .audit import management_audit
from .queries import (
    LIMITS_SELECT_AI_TOOL_WINDOWS,
    OVERVIEW_SELECT_AI_PROVIDER_CALLS,
    OVERVIEW_SELECT_AI_PROVIDER_CALLS_2,
)

router = UtcAPIRouter(prefix="/api/v1/ai-operations", tags=["ai-operations"])


class LimitsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    totalPerMinute: StrictInt = Field(ge=1, le=10000)
    perTool: dict[str, StrictInt] = Field(default_factory=dict)

    @model_validator(mode="after")
    def bounded_tools(self):
        if len(self.perTool) > len(TOOLS) or any(
            name not in TOOLS or isinstance(value, bool) or not 1 <= value <= 10000
            for name, value in self.perTool.items()
        ):
            raise ValueError(
                "Tool budgets must use known tools and values between 1 and 10000."
            )
        return self


@router.put("/limits")
async def put_limits(
    payload: LimitsInput,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await manager(db, workspaceId, user["id"])
    await update_limits(db, workspaceId, payload.totalPerMinute, payload.perTool)
    await management_audit(db, workspaceId, user["id"], "budgets.updated", workspaceId)
    await db.commit()
    return {"data": payload.model_dump()}


@router.get("/limits")
async def get_limits(
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    """MCP tool-call budgets for the limits form: the saved limits, the workspace calls
    used in the current minute and every tool name a per-tool limit may use.
    VI: Giới hạn lời gọi tool MCP cho form giới hạn: giới hạn đã lưu, số lời gọi của
    VI: workspace trong phút hiện tại và mọi tên tool được đặt giới hạn riêng."""
    await manager(db, workspaceId, user["id"])
    usage = (
        await db.execute(
            LIMITS_SELECT_AI_TOOL_WINDOWS, {"workspace": workspaceId, "now": utcnow()}
        )
    ).scalar_one_or_none()
    return {
        "data": {
            **await limits(db, workspaceId),
            "usage": usage or 0,
            "tools": sorted(TOOLS),
        }
    }


@router.get("")
async def overview(
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    """AI provider usage of the last 7 days and its latest failures. MCP tool calls are
    reported by Settings → MCP logs (`/mcp/audit/summary`), not here.
    VI: Mức dùng AI provider 7 ngày qua và các lỗi gần nhất. Lời gọi tool MCP được báo cáo
    VI: ở Settings → MCP logs (`/mcp/audit/summary`), không ở đây."""
    await manager(db, workspaceId, user["id"])
    params = {"workspace": workspaceId, "now": utcnow()}
    provider_calls = (
        await db.execute(OVERVIEW_SELECT_AI_PROVIDER_CALLS, params)
    ).mappings()
    provider_errors = (
        await db.execute(OVERVIEW_SELECT_AI_PROVIDER_CALLS_2, params)
    ).mappings()
    return {
        "data": {
            "providerCalls": [dict(row) for row in provider_calls],
            "recentProviderErrors": [dict(row) for row in provider_errors],
        }
    }
