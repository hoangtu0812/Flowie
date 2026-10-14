import re
from urllib.parse import urlsplit

import httpx
from fastapi import Depends, Query, Request
from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...db.session import get_session
from ...domains.auth import current_user
from ...domains.scm.service import provider_for
from ...domains.scm.providers.github_checks import GitHubChecks
from ..access.membership import _manager
from ..mcp.domain import Principal
from ..mcp.policy import AccessPolicy
from .audit import management_audit
from .operations import router


def github_pull(value):
    parsed = urlsplit(value or "")
    match = re.fullmatch(
        r"/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/pull/([1-9][0-9]*)/?", parsed.path
    )
    if (
        parsed.scheme != "https"
        or parsed.netloc != "github.com"
        or parsed.query
        or parsed.fragment
        or not match
    ):
        raise ApiError(
            422,
            "Verification requires a GitHub pull request URL.",
            "Unprocessable Entity",
        )
    return f"{match[1]}/{match[2]}", match[3]


async def check_github_evidence(provider, repository, number, commit):
    if not re.fullmatch(r"[a-fA-F0-9]{40}", commit or ""):
        return {"status": "UNVERIFIED", "reason": "A full commit SHA is required."}
    reader = GitHubChecks(provider, repository)
    pull = await reader.pull(number)
    head = pull.get("head", {}).get("sha")
    if (
        head != commit
        or pull.get("base", {}).get("repo", {}).get("full_name", "").lower()
        != repository.lower()
    ):
        return {
            "status": "MISMATCH",
            "reason": "The reported commit does not match the current pull request head.",
        }
    checks, statuses, workflows = await reader.snapshot(commit)
    if any(data.get("total_count", 0) > 100 for data in (checks, statuses, workflows)):
        return {
            "status": "UNVERIFIED",
            "reason": "Check coverage exceeds the bounded verification limit.",
        }
    observed = [
        {
            "name": row.get("name", "check"),
            "state": row.get("conclusion")
            if row.get("status") == "completed"
            else "pending",
        }
        for row in checks.get("check_runs", [])
    ]
    observed += [
        {"name": row.get("context", "status"), "state": row.get("state")}
        for row in statuses.get("statuses", [])
    ]
    observed += [
        {
            "name": row.get("name", "workflow"),
            "state": row.get("conclusion")
            if row.get("status") == "completed"
            else "pending",
        }
        for row in workflows.get("workflow_runs", [])
        if row.get("head_sha") == commit
    ]
    # Re-read the head after provider calls to reject evidence collected across a push.
    latest = await reader.pull(number)
    if latest.get("head", {}).get("sha") != commit:
        return {
            "status": "MISMATCH",
            "reason": "The pull request changed during verification.",
        }
    state = (
        "NO_CHECKS"
        if not observed
        else "VERIFIED"
        if all(row["state"] == "success" for row in observed)
        else "PENDING"
        if any(row["state"] in {None, "pending"} for row in observed)
        else "FAILED"
    )
    return {
        "status": state,
        "commit": commit,
        "checks": observed,
        "checkedAt": _utcnow(),
        "scope": "Observed checks only; branch protection and review approval are separate.",
    }


@router.post("/runs/{run_id}/verify-evidence")
async def verify_evidence(
    run_id: str,
    request: Request,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    await _manager(db, workspaceId, user["id"])
    row = (
        (
            await db.execute(
                text(
                    "SELECT r.result,i.project_id,i.id AS issue_id FROM agent_runs r JOIN issues i ON i.id=r.issue_id WHERE r.id=:run AND r.workspace_id=:workspace"
                ),
                {"run": run_id, "workspace": workspaceId},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(404, "Agent run not found.", "Not Found")
    policy = AccessPolicy(db, Principal("", workspaceId, user, frozenset(), (), ()))
    await policy.issue(row["issue_id"])
    result = row["result"] or {}
    repository, number = github_pull(result.get("pullRequestUrl"))
    registered = (
        await db.execute(
            text(
                "SELECT id FROM project_repositories WHERE project_id=:project AND workspace_id=:workspace AND lower(rtrim(repository_url,'/')) IN (:plain,:git)"
            ),
            {
                "project": row["project_id"],
                "workspace": workspaceId,
                "plain": f"https://github.com/{repository}".lower(),
                "git": f"https://github.com/{repository}.git".lower(),
            },
        )
    ).first()
    connection = (
        (
            await db.execute(
                text(
                    "SELECT c.*,r.team_id AS repository_team_id FROM scm_repositories r JOIN scm_connections c ON c.id=r.connection_id WHERE r.workspace_id=:workspace AND lower(r.full_name)=lower(:repository) AND r.enabled AND r.archived_at IS NULL AND c.provider='GITHUB' AND c.status='ACTIVE' ORDER BY c.id LIMIT 1"
                ),
                {"workspace": workspaceId, "repository": repository},
            )
        )
        .mappings()
        .first()
    )
    if not registered or not connection:
        raise ApiError(
            409,
            "Configure an enabled GitHub App repository for this project before verification.",
            "Conflict",
        )
    if connection["repository_team_id"]:
        await policy.team(connection["repository_team_id"])
    provider = provider_for(connection, request.app.state.settings, {})
    try:
        evidence = await check_github_evidence(
            provider, repository, number, result.get("commit")
        )
    except httpx.HTTPError as error:
        raise ApiError(
            502,
            "The source-control provider could not verify this evidence.",
            "Bad Gateway",
        ) from error
    await management_audit(db, workspaceId, user["id"], "evidence.checked", run_id)
    await db.commit()
    return {"data": evidence}
