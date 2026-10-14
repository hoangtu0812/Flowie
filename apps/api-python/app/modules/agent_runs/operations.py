from fastapi import Depends, Query
from pydantic import BaseModel, Field, ConfigDict, StrictInt, model_validator
from sqlalchemy import text
from ...core.utc_responses import UtcAPIRouter
from ...core.clock import _utcnow
from ...db.session import get_session
from ...domains.auth import current_user
from ..access.membership import _manager
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
    runs = (
        await db.execute(
            text("""SELECT state,count(*)::int AS count,count(*) FILTER(WHERE state='RUNNING' AND lease_until<:now)::int AS "expiredLeases"
        FROM agent_runs WHERE workspace_id=:workspace GROUP BY state"""),
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
    awaiting = (
        await db.execute(
            text(
                "SELECT id FROM agent_runs WHERE workspace_id=:workspace AND state='AWAITING_REVIEW' ORDER BY finished_at DESC LIMIT 25"
            ),
            params,
        )
    ).mappings()
    return {
        "data": {
            "limits": await limits(db, workspaceId),
            "usage": usage or 0,
            "tools": [dict(row) for row in tools],
            "runs": [dict(row) for row in runs],
            "recentErrors": [dict(row) for row in recent],
            "awaitingReview": [dict(row) for row in awaiting],
            "evidencePolicy": "Agent-reported commits and tests are unverified until independently checked against the repository and CI.",
        }
    }
