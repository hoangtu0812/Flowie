from __future__ import annotations

import json
from datetime import timedelta
from hmac import compare_digest
from secrets import token_urlsafe

from sqlalchemy import text

from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ...core.clock import _utcnow
from ..mcp.policy import AccessPolicy
from ..mcp.queries import QueryService
from ..work_items.comments import create_comment
from ..work_items.contracts import CreateCommentInput


def present(row, principal) -> dict:
    result = {
        "id": row["id"],
        "issueId": row["issue_id"],
        "connectionId": row["connection_id"],
        "state": row["state"],
        "fencingToken": row["fencing_token"],
        "leaseUntil": row["lease_until"],
        "startedAt": row["started_at"],
        "finishedAt": row["finished_at"],
        "result": row["result"],
    }
    if (
        row["connection_id"] == principal.connection_id
        and "runs:write" in principal.scopes
    ):
        result["leaseToken"] = row["lease_token"]
    return result


class RunService:
    def __init__(self, db, principal, settings):
        self.db, self.principal, self.settings = db, principal, settings
        self.policy = AccessPolicy(db, principal)
        self.target = None

    async def prepare(self, name: str, payload) -> None:
        self.principal.require("issues:read")
        if name == "claim_issue":
            self.target = await self.policy.issue(payload.issueId, lock=True)
        else:
            row = (
                (
                    await self.db.execute(
                        text(
                            "SELECT * FROM agent_runs WHERE id=:id AND workspace_id=:workspace"
                        ),
                        {"id": payload.runId, "workspace": self.principal.workspace_id},
                    )
                )
                .mappings()
                .first()
            )
            if not row:
                raise ApiError(404, "Agent run not found.", "Not Found")
            await self.policy.issue(row["issue_id"], lock=True)
            self.target = dict(
                (
                    await self.db.execute(
                        text("SELECT * FROM agent_runs WHERE id=:id FOR UPDATE"),
                        {"id": payload.runId},
                    )
                )
                .mappings()
                .one()
            )
            if name != "cancel_run":
                if (
                    self.target["connection_id"] != self.principal.connection_id
                    or self.target["fencing_token"] != payload.fencingToken
                    or not compare_digest(
                        self.target["lease_token"] or "", payload.leaseToken
                    )
                ):
                    raise ApiError(
                        409, "This agent no longer owns the run.", "Conflict"
                    )

    def active_lease(self) -> None:
        if (
            self.target["state"] != "RUNNING"
            or not self.target["lease_until"]
            or self.target["lease_until"] <= _utcnow()
        ):
            raise ApiError(
                409, "The lease expired or the run is no longer running.", "Conflict"
            )

    async def execute(self, name, payload) -> dict:
        now = _utcnow()
        if name == "claim_issue":
            row = (
                (
                    await self.db.execute(
                        text(
                            "SELECT * FROM agent_runs WHERE issue_id=:issue AND state IN ('PENDING','RUNNING') FOR UPDATE"
                        ),
                        {"issue": self.target["id"]},
                    )
                )
                .mappings()
                .first()
            )
            # A queued or live run is directed at exactly one connection: automation
            # routes a run to its rule's connection, and an ad-hoc claim creates the run
            # for the claiming connection. Only that connection may claim or reclaim it,
            # so an expired lease is not a takeover window for another agent. Returning
            # the issue to the shared pool requires an explicit cancel.
            if row and row["connection_id"] != self.principal.connection_id:
                raise ApiError(
                    409,
                    "This issue is assigned to another agent connection. Cancel that run before claiming it here.",
                    "Conflict",
                )
            if row and row["state"] == "RUNNING" and row["lease_until"] > now:
                raise ApiError(
                    409,
                    "This connection already holds a live run for this issue.",
                    "Conflict",
                )
            lease = token_urlsafe(32)
            if row:
                run_id = row["id"]
                await self.db.execute(
                    text("""UPDATE agent_runs SET state='RUNNING',connection_id=:connection,
                    fencing_token=fencing_token+1,lease_token=:token,lease_until=:until,started_at=:now,updated_at=:now
                    WHERE id=:id"""),
                    {
                        "id": run_id,
                        "connection": self.principal.connection_id,
                        "token": lease,
                        "until": now + timedelta(minutes=5),
                        "now": now,
                    },
                )
            else:
                run_id = _cuid()
                await self.db.execute(
                    text("""INSERT INTO agent_runs (id,workspace_id,issue_id,connection_id,state,fencing_token,lease_token,lease_until,started_at)
                    VALUES (:id,:workspace,:issue,:connection,'RUNNING',1,:token,:until,:now)"""),
                    {
                        "id": run_id,
                        "workspace": self.principal.workspace_id,
                        "issue": self.target["id"],
                        "connection": self.principal.connection_id,
                        "token": lease,
                        "until": now + timedelta(minutes=5),
                        "now": now,
                    },
                )
            result = dict(
                (
                    await self.db.execute(
                        text("SELECT * FROM agent_runs WHERE id=:id"), {"id": run_id}
                    )
                )
                .mappings()
                .one()
            )
            return present(result, self.principal)
        if name == "cancel_run":
            if self.target["connection_id"] != self.principal.connection_id:
                raise ApiError(
                    403, "Only the owning connection can cancel this run.", "Forbidden"
                )
            if self.target["state"] not in {"PENDING", "RUNNING"}:
                raise ApiError(409, "This run is already finished.", "Conflict")
            state = "CANCELED"
        elif name == "heartbeat_run":
            self.active_lease()
            if self.target["started_at"] < now - timedelta(hours=2):
                raise ApiError(
                    409,
                    "The run exceeded its two-hour budget. Release it before starting again.",
                    "Conflict",
                )
            await self.db.execute(
                text(
                    "UPDATE agent_runs SET lease_until=:until,updated_at=:now WHERE id=:id"
                ),
                {
                    "id": self.target["id"],
                    "until": now + timedelta(minutes=5),
                    "now": now,
                },
            )
            return {
                "id": self.target["id"],
                "leaseUntil": now + timedelta(minutes=5),
                "fencingToken": self.target["fencing_token"],
            }
        else:
            self.active_lease()
            state = payload.outcome if name == "report_run_result" else "CANCELED"
        evidence = (
            payload.model_dump(
                exclude={"idempotencyKey", "leaseToken", "runId", "fencingToken"}
            )
            if name == "report_run_result"
            else None
        )
        await self.db.execute(
            text("""UPDATE agent_runs SET state=:state,finished_at=:now,updated_at=:now,
            lease_until=NULL,result=CAST(:result AS jsonb) WHERE id=:id"""),
            {
                "id": self.target["id"],
                "state": state,
                "now": now,
                "result": json.dumps(evidence) if evidence else None,
            },
        )
        if evidence:
            self.principal.require("comments:write")
            summary = f"Agent run {self.target['id']}: {state}\n\n{payload.summary}"
            if payload.commit:
                summary += f"\n\nCommit reported by agent: {payload.commit}"
            if payload.pullRequestUrl:
                summary += f"\nPR reported by agent: {payload.pullRequestUrl}"
            if payload.tests:
                summary += "\n\nTest evidence reported by agent:"
                for test in payload.tests:
                    summary += (
                        f"\n- {test.name}: {test.result}"
                        f" (exit {test.exitCode}, {test.durationMs} ms)"
                        f" {json.dumps(test.command, ensure_ascii=False)}"
                    )
                    # Only a failure's output earns comment space; the full evidence,
                    # including every log tail, stays on the run record.
                    if test.result != "passed" and test.log:
                        summary += f"\n  log tail: {test.log[:1000]}"
            await create_comment(
                CreateCommentInput(
                    workspaceId=self.principal.workspace_id,
                    issueId=self.target["issue_id"],
                    content=summary[:20000],
                ),
                self.principal.user,
                self.db,
            )
        return {
            "id": self.target["id"],
            "state": state,
            "issueId": self.target["issue_id"],
        }

    async def get(self, payload) -> dict:
        row = (
            (
                await self.db.execute(
                    text(
                        "SELECT * FROM agent_runs WHERE id=:id AND workspace_id=:workspace"
                    ),
                    {"id": payload.runId, "workspace": self.principal.workspace_id},
                )
            )
            .mappings()
            .first()
        )
        if not row:
            raise ApiError(404, "Agent run not found.", "Not Found")
        await self.policy.issue(row["issue_id"])
        return present(row, self.principal)

    async def list(self, payload) -> dict:
        return await QueryService(self.db, self.principal, self.settings).page(
            "list_runs",
            payload,
            f"""SELECT r.id,r.issue_id AS "issueId",i.identifier AS "issueIdentifier",i.title AS "issueTitle",r.state,r.connection_id AS "connectionId",r.created_at AS "createdAt",
            EXISTS(SELECT 1 FROM mcp_connections own WHERE own.id=r.connection_id AND own.user_id=:user) AS "ownedByCurrentUser",
            r.connection_id=:connection AS "assignedToThisConnection"
            FROM agent_runs r JOIN issues i ON i.id=r.issue_id WHERE {self.policy.issue_clause()}
            AND (CAST(:state AS text) IS NULL OR r.state=CAST(:state AS text))
            AND (CAST(:project AS text) IS NULL OR i.project_id=CAST(:project AS text))
            AND (CAST(:assigned AS boolean) IS NULL OR (r.connection_id=:connection)=CAST(:assigned AS boolean))""",
            {
                "state": payload.state,
                "project": payload.projectId,
                "connection": self.principal.connection_id,
                "assigned": payload.assignedToThisConnection,
            },
            time_field="createdAt",
        )

    async def repositories(self, payload) -> dict:
        await self.policy.project(payload.projectId)
        rows = (
            await self.db.execute(
                text("""SELECT id,name,repository_url AS "repositoryUrl",base_branch AS "baseBranch",
            test_commands AS "testCommands",instructions FROM project_repositories
            WHERE workspace_id=:workspace AND project_id=:project ORDER BY name,id LIMIT 100"""),
                {
                    "workspace": self.principal.workspace_id,
                    "project": payload.projectId,
                },
            )
        ).mappings()
        return {"items": [dict(row) for row in rows]}
