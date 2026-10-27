from __future__ import annotations

import json

from fastapi import Depends, Query, Request
from ...core.utc_responses import UtcAPIRouter as APIRouter
from sqlalchemy import text

from ...core.errors import ApiError
from ...db.session import get_session
from ...domains.auth import current_user
from ...core.identifiers import _cuid
from ...core.clock import _utcnow
from ..access.membership import _manager, _workspace_role
from ..mcp.connections import load_principal
from ..mcp.domain import Principal
from ..mcp.policy import AccessPolicy
from .contracts import RepositoryInput, AutomationInput
from .contracts import RunPageInput
from .contracts import RunInput
from .service import RunService, notify_run_finished
from .audit import management_audit

router = APIRouter(prefix="/api/v1/agent-runs", tags=["agent-run-management"])


@router.get('/runs/{run_id}')
async def run_evidence(run_id: str, request: Request, workspaceId: str = Query(min_length=1), user=Depends(current_user), db=Depends(get_session)):
    await _workspace_role(db, workspaceId, user['id'])
    principal = Principal('', workspaceId, user, frozenset(), (), ())
    return {'data': await RunService(db, principal, request.app.state.settings).get(RunInput(runId=run_id))}


@router.get("/runs")
async def list_runs(
    request: Request,
    workspaceId: str = Query(min_length=1),
    limit: int = Query(default=25, ge=1, le=100),
    cursor: str | None = None,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _workspace_role(db, workspaceId, user["id"])
    principal = Principal("", workspaceId, user, frozenset(), (), ())
    return {
        "data": await RunService(db, principal, request.app.state.settings).list(
            RunPageInput(limit=limit, cursor=cursor)
        )
    }


async def manager_policy(db, workspace, user):
    await _manager(db, workspace, user["id"])
    return AccessPolicy(db, Principal("", workspace, user, frozenset(), (), ()))


@router.post("/repositories", status_code=201)
async def configure_repository(
    payload: RepositoryInput,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    policy = await manager_policy(db, workspaceId, user)
    await policy.project(payload.projectId)
    row = (
        await db.execute(
            text("""INSERT INTO project_repositories (id,workspace_id,project_id,name,repository_url,base_branch,test_commands,instructions)
        VALUES (:id,:workspace,:project,:name,:url,:branch,CAST(:commands AS jsonb),:instructions)
        ON CONFLICT (project_id,repository_url) DO UPDATE SET name=EXCLUDED.name,base_branch=EXCLUDED.base_branch,
            test_commands=EXCLUDED.test_commands,instructions=EXCLUDED.instructions RETURNING id"""),
            {
                "id": _cuid(),
                "workspace": workspaceId,
                "project": payload.projectId,
                "name": payload.name,
                "url": payload.repositoryUrl,
                "branch": payload.baseBranch,
                "commands": json.dumps(payload.testCommands),
                "instructions": payload.instructions,
            },
        )
    ).scalar_one()
    await management_audit(db, workspaceId, user["id"], "repository.configured", row)
    await db.commit()
    return {"data": {"id": row}}


@router.get("/repositories")
async def list_repositories(
    projectId: str = Query(min_length=1),
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _workspace_role(db, workspaceId, user["id"])
    policy = AccessPolicy(db, Principal("", workspaceId, user, frozenset(), (), ()))
    await policy.project(projectId)
    rows = (
        await db.execute(
            text("""SELECT id,name,repository_url AS "repositoryUrl",base_branch AS "baseBranch"
        FROM project_repositories WHERE project_id=:project AND workspace_id=:workspace ORDER BY name,id LIMIT 100"""),
            {"project": projectId, "workspace": workspaceId},
        )
    ).mappings()
    return {"data": [dict(row) for row in rows]}


@router.post("/automations", status_code=201)
async def configure_automation(
    payload: AutomationInput,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await manager_policy(db, workspaceId, user)
    principal = await load_principal(db, payload.connectionId)
    if principal.workspace_id != workspaceId or principal.user["id"] != user["id"]:
        raise ApiError(
            403,
            "Only your own workspace connection can authorize an automation.",
            "Forbidden",
        )
    principal.require("runs:write", "issues:read")
    await AccessPolicy(db, principal).project(payload.projectId)
    if not (
        await db.execute(
            text("SELECT id FROM labels WHERE id=:id AND workspace_id=:workspace"),
            {"id": payload.labelId, "workspace": workspaceId},
        )
    ).first():
        raise ApiError(404, "Label not found.", "Not Found")
    identifier = _cuid()
    await db.execute(
        text("""INSERT INTO agent_automations (id,workspace_id,connection_id,name,project_id,label_id,enabled,daily_limit)
        VALUES (:id,:workspace,:connection,:name,:project,:label,:enabled,:limit)"""),
        {
            "id": identifier,
            "workspace": workspaceId,
            "connection": payload.connectionId,
            "name": payload.name,
            "project": payload.projectId,
            "label": payload.labelId,
            "enabled": payload.enabled,
            "limit": payload.dailyLimit,
        },
    )
    await management_audit(
        db, workspaceId, user["id"], "automation.created", identifier
    )
    await db.commit()
    return {"data": {"id": identifier, "enabled": payload.enabled}}


@router.get("/automations")
async def list_automations(
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await manager_policy(db, workspaceId, user)
    rows = (
        await db.execute(
            text(
                'SELECT id,name,enabled,daily_limit AS "dailyLimit",project_id AS "projectId" FROM agent_automations WHERE workspace_id=:workspace ORDER BY created_at DESC LIMIT 100'
            ),
            {"workspace": workspaceId},
        )
    ).mappings()
    return {"data": [dict(row) for row in rows]}


@router.delete("/automations/{automation_id}")
async def disable_automation(
    automation_id: str,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await manager_policy(db, workspaceId, user)
    row = (
        await db.execute(
            text(
                "UPDATE agent_automations SET enabled=false WHERE id=:id AND workspace_id=:workspace RETURNING id"
            ),
            {"id": automation_id, "workspace": workspaceId},
        )
    ).first()
    if not row:
        raise ApiError(404, "Automation not found.", "Not Found")
    await management_audit(
        db, workspaceId, user["id"], "automation.disabled", automation_id
    )
    await db.commit()
    return {"data": {"id": automation_id, "enabled": False}}


@router.post("/runs/{run_id}/cancel")
async def cancel_run(
    run_id: str,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    role = await _workspace_role(db, workspaceId, user["id"])
    target = (await db.execute(text('SELECT issue_id FROM agent_runs WHERE id=:id AND workspace_id=:workspace'), {'id': run_id, 'workspace': workspaceId})).mappings().first()
    if not target:
        raise ApiError(404, 'Agent run not found.', 'Not Found')
    await AccessPolicy(db, Principal('', workspaceId, user, frozenset(), (), ())).issue(target['issue_id'], lock=True)
    row = (
        await db.execute(
            text("""UPDATE agent_runs r SET state='CANCELED',finished_at=:now,updated_at=:now,lease_until=NULL
        FROM mcp_connections c WHERE r.id=:id AND r.workspace_id=:workspace AND r.connection_id=c.id
        AND (:manager OR c.user_id=:user) AND r.state IN ('PENDING','RUNNING') RETURNING r.id"""),
            {
                "id": run_id,
                "workspace": workspaceId,
                "user": user["id"],
                "manager": role in {"OWNER", "ADMIN"},
                "now": _utcnow(),
            },
        )
    ).first()
    if not row:
        raise ApiError(404, "Active run not found.", "Not Found")
    await management_audit(db, workspaceId, user["id"], "run.canceled", run_id)
    await notify_run_finished(db, {"id": run_id}, "CANCELED", user)
    await db.commit()
    return {"data": {"id": run_id, "state": "CANCELED"}}


@router.get("/summary")
async def summary(
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _workspace_role(db, workspaceId, user["id"])
    policy = AccessPolicy(db, Principal("", workspaceId, user, frozenset(), (), ()))
    rows = (
        await db.execute(
            text(f"""SELECT r.state,COUNT(*)::int AS count,
        AVG(EXTRACT(EPOCH FROM (r.finished_at-r.started_at))) AS "averageSeconds"
        FROM agent_runs r JOIN issues i ON i.id=r.issue_id WHERE {policy.issue_clause()} GROUP BY r.state"""),
            policy.params,
        )
    ).mappings()
    return {"data": [dict(row) for row in rows]}
