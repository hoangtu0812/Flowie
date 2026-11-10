from fastapi import Depends, Query
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator
from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ..access.membership import _manager
from ..identity.auth import current_user
from ..mcp.quotas import limits, update_limits
from ..mcp.registry import TOOLS
from .audit import management_audit

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
    await _manager(db, workspaceId, user["id"])
    await update_limits(db, workspaceId, payload.totalPerMinute, payload.perTool)
    await management_audit(db, workspaceId, user["id"], "budgets.updated", workspaceId)
    await db.commit()
    return {"data": payload.model_dump()}


@router.get("")
async def overview(
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _manager(db, workspaceId, user["id"])
    params = {"workspace": workspaceId, "now": _utcnow()}
    tools = (
        await db.execute(
            text("""SELECT metadata->>'tool' AS tool,count(*)::int AS calls,
        count(*) FILTER(WHERE metadata->>'outcome'<>'succeeded')::int AS errors,
        percentile_cont(0.95) WITHIN GROUP(ORDER BY (metadata->>'durationMs')::int) AS "p95Ms"
        FROM audit_logs WHERE workspace_id=:workspace AND entity_type='mcp-tool' AND created_at>CAST(:now AS timestamp)-INTERVAL '24 hours'
        GROUP BY metadata->>'tool' ORDER BY count(*) DESC LIMIT 100"""),
            params,
        )
    ).mappings()
    recent = (
        await db.execute(
            text("""SELECT metadata->>'tool' AS tool,metadata->>'outcome' AS outcome,created_at AS "createdAt"
        FROM audit_logs WHERE workspace_id=:workspace AND entity_type='mcp-tool' AND metadata->>'outcome'<>'succeeded'
        ORDER BY created_at DESC LIMIT 25"""),
            params,
        )
    ).mappings()
    usage = (
        await db.execute(
            text(
                "SELECT used FROM ai_tool_windows WHERE workspace_id=:workspace AND tool='*' AND window_start=date_trunc('minute',CAST(:now AS timestamp))"
            ),
            params,
        )
    ).scalar_one_or_none()
    provider_calls = (
        await db.execute(
            text("""SELECT feature,count(*)::int AS calls,count(*) FILTER(WHERE outcome<>'ok')::int AS failed,
        COALESCE(sum(input_tokens),0)::bigint AS "inputTokens",COALESCE(sum(output_tokens),0)::bigint AS "outputTokens",
        percentile_cont(0.95) WITHIN GROUP(ORDER BY duration_ms) AS "p95Ms"
        FROM ai_provider_calls WHERE workspace_id=:workspace AND created_at>CAST(:now AS timestamp)-INTERVAL '7 days'
        GROUP BY feature ORDER BY COALESCE(sum(input_tokens),0)+COALESCE(sum(output_tokens),0) DESC"""),
            params,
        )
    ).mappings()
    provider_errors = (
        await db.execute(
            text("""SELECT feature,outcome,status_code AS "statusCode",model,created_at AS "createdAt"
        FROM ai_provider_calls WHERE workspace_id=:workspace AND outcome<>'ok'
        ORDER BY created_at DESC LIMIT 10"""),
            params,
        )
    ).mappings()
    return {
        "data": {
            "limits": await limits(db, workspaceId),
            "usage": usage or 0,
            "tools": [dict(row) for row in tools],
            "recentErrors": [dict(row) for row in recent],
            "providerCalls": [dict(row) for row in provider_calls],
            "recentProviderErrors": [dict(row) for row in provider_errors],
        }
    }
