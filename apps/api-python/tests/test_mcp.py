from __future__ import annotations

import asyncio
import os
import sys
import unittest
from dataclasses import replace
from datetime import timedelta
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings, _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.main import create_app
from app.modules.mcp.application import ToolApplication
from app.modules.mcp.connections import authenticate, create, revoke
from app.modules.mcp.contracts import ConnectionInput, UpdateIssueTool
from app.modules.mcp.domain import ALL_SCOPES
from app.modules.mcp.pagination import CursorCodec
from app.modules.mcp.registry import visible_tools
from app.modules.work_items.contracts import CreateIssueInput
from app.modules.work_items.issues import create_issue


class McpContractTests(unittest.TestCase):
    def test_cursor_is_bound_to_connection_and_query(self):
        codec = CursorCodec("secret", "connection", "search_issues", {"projectId": "A"})
        cursor = codec.encode(_utcnow(), "issue")
        self.assertEqual(codec.decode(cursor)[1], "issue")
        for other in [
            CursorCodec("secret", "other", "search_issues", {"projectId": "A"}),
            CursorCodec("secret", "connection", "search_issues", {"projectId": "B"}),
        ]:
            with self.assertRaises(ApiError):
                other.decode(cursor)
        with self.assertRaises(ApiError):
            codec.decode("broken cursor")

    def test_update_cannot_bypass_transition_scope(self):
        from pydantic import ValidationError

        with self.assertRaises(ValidationError):
            UpdateIssueTool.model_validate(
                {
                    "issueId": "i",
                    "expectedVersion": 1,
                    "idempotencyKey": "test-key",
                    "statusId": "done",
                }
            )

    def test_required_patch_values_cannot_be_null(self):
        from pydantic import ValidationError

        for field in ("title", "priority"):
            with self.assertRaises(ValidationError):
                UpdateIssueTool.model_validate(
                    {
                        "issueId": "issue",
                        "expectedVersion": 1,
                        "idempotencyKey": "test-key",
                        field: None,
                    }
                )


@unittest.skipUnless(
    os.getenv("MCP_TEST_DATABASE_URL"), "MCP_TEST_DATABASE_URL is not configured"
)
class McpIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_upgrade_backfills_existing_documents(self):
        import asyncpg

        url = _async_database_url(os.environ["MCP_TEST_DATABASE_URL"]).replace(
            "postgresql+asyncpg://", "postgresql://"
        )
        connection = await asyncpg.connect(url)
        transaction = connection.transaction()
        await transaction.start()
        try:
            schema = "upgrade_" + _cuid()
            await connection.execute(f'CREATE SCHEMA "{schema}"')
            await connection.execute(f'SET LOCAL search_path TO "{schema}"')
            migrations = sorted(
                (
                    Path(__file__).resolve().parents[3]
                    / "packages/database/prisma/migrations"
                ).glob("*/migration.sql")
            )
            for path in migrations:
                if path.parent.name >= "20261014":
                    continue
                await connection.execute(path.read_text(encoding="utf-8"))
            await connection.execute(
                "INSERT INTO users (id,email,name,status,created_at,updated_at) VALUES ('user','upgrade@example.test','Upgrade','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
            )
            await connection.execute(
                "INSERT INTO organizations (id,name,slug,owner_id,created_at,updated_at) VALUES ('org','Upgrade','upgrade','user',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
            )
            await connection.execute(
                "INSERT INTO workspaces (id,organization_id,name,slug,created_at,updated_at) VALUES ('workspace','org','Upgrade','upgrade',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
            )
            await connection.execute(
                "INSERT INTO documents (id,workspace_id,title,content,created_by,updated_by,created_at,updated_at) VALUES ('document','workspace','Existing','Original text','user','user',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
            )
            await connection.execute(
                "INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES ('team','workspace','Upgrade','UPGRADE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
            )
            await connection.execute(
                "INSERT INTO issue_statuses(id,workspace_id,name,category,color,created_at,updated_at) VALUES ('status','workspace','Existing status','STARTED','gray',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"
            )
            await connection.execute(
                "INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,priority,creator_id,created_at,updated_at) VALUES ('issue','workspace','team','status','UPGRADE-1',1,'Existing task','NONE','user',CURRENT_TIMESTAMP-INTERVAL '30 days',CURRENT_TIMESTAMP)"
            )
            await connection.execute("INSERT INTO sla_policies(id,workspace_id,team_id,name,deadline_minutes,created_by,created_at,updated_at) VALUES ('policy','workspace','team','Existing SLA',60,'user',CURRENT_TIMESTAMP-INTERVAL '30 days',CURRENT_TIMESTAMP)")
            for path in migrations:
                if path.parent.name >= "20261014":
                    await connection.execute(path.read_text(encoding="utf-8"))
            self.assertEqual(
                await connection.fetchval(
                    "SELECT version FROM documents WHERE id='document'"
                ),
                1,
            )
            baseline = await connection.fetchrow(
                "SELECT e.kind,e.from_category,e.source,e.sla_processed_at,e.occurred_at>i.created_at AS observed_later FROM issue_lifecycle_events e JOIN issues i ON i.id=e.issue_id WHERE e.issue_id='issue'"
            )
            self.assertEqual(baseline["kind"], "BASELINE")
            self.assertIsNone(baseline["from_category"])
            self.assertEqual(baseline["source"], "UNKNOWN")
            self.assertIsNotNone(baseline["sla_processed_at"])
            self.assertTrue(baseline["observed_later"])
            policy_baseline = await connection.fetchrow("SELECT r.kind,r.snapshot->>'name' AS name,r.created_at>p.created_at AS observed_later FROM sla_policy_revisions r JOIN sla_policies p ON p.id=r.policy_id WHERE p.id='policy'")
            self.assertEqual(policy_baseline['kind'], 'BASELINE')
            self.assertEqual(policy_baseline['name'], 'Existing SLA')
            self.assertTrue(policy_baseline['observed_later'])
            self.assertEqual(await connection.fetchval("SELECT COUNT(*) FROM issue_sla_cycles WHERE issue_id='issue'"), 0)
            self.assertEqual(
                await connection.fetchval(
                    "SELECT content FROM document_revisions WHERE document_id='document' AND version=1"
                ),
                "Original text",
            )
            await connection.execute(
                "UPDATE documents SET content='Edited text' WHERE id='document'"
            )
            self.assertEqual(
                await connection.fetchval(
                    "SELECT version FROM documents WHERE id='document'"
                ),
                2,
            )
            self.assertEqual(
                await connection.fetchval(
                    "SELECT count(*) FROM document_revisions WHERE document_id='document'"
                ),
                2,
            )
        finally:
            await transaction.rollback()
            await connection.close()

    async def asyncSetUp(self):
        self.engine = create_async_engine(
            _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
        )
        self.factory = async_sessionmaker(self.engine, expire_on_commit=False)
        self.settings = replace(
            Settings.from_environment(),
            mcp_enabled=True,
            mcp_writes_enabled=True,
            mcp_allowed_hosts=("testserver", "localhost:*", "127.0.0.1:*"),
            mcp_rate_limit=1000,
            auth_jwt_secret="test-only-mcp-jwt-secret-with-at-least-32-characters",
        )
        self.user = {
            "id": _cuid(),
            "name": "MCP integration test",
            "email": f"{_cuid()}@example.test",
            "avatarUrl": None,
        }
        self.project, self.other_project, self.private_team = _cuid(), _cuid(), _cuid()
        async with self.factory() as db:
            now = _utcnow()
            await db.execute(
                text("""INSERT INTO users (id,name,email,status,created_at,updated_at)
                VALUES (:id,:name,:email,'ACTIVE',:now,:now)"""),
                {**self.user, "now": now},
            )
            self.seed = await create_workspace_bootstrap(
                db,
                user_id=self.user["id"],
                organization_name="MCP test",
                workspace_name=f"MCP test {_cuid()}",
                now=now,
            )
            self.workspace, self.team = self.seed["workspace_id"], self.seed["team_id"]
            await db.execute(
                text("""INSERT INTO document_folders (id,workspace_id,team_id,name,created_at,updated_at)
                VALUES (:id,:workspace,:team,'General',:now,:now)"""),
                {
                    "id": _cuid(),
                    "workspace": self.workspace,
                    "team": self.team,
                    "now": now,
                },
            )
            for identifier in [self.project, self.other_project]:
                await db.execute(
                    text("""INSERT INTO projects (id,workspace_id,team_id,name,identifier,created_at,updated_at)
                    VALUES (:id,:workspace,:team,:id,:id,:now,:now)"""),
                    {
                        "id": identifier,
                        "workspace": self.workspace,
                        "team": self.team,
                        "now": now,
                    },
                )
            await db.execute(
                text("""INSERT INTO teams (id,workspace_id,name,identifier,created_at,updated_at)
                VALUES (:id,:workspace,'Private','PRIVATE',:now,:now)"""),
                {"id": self.private_team, "workspace": self.workspace, "now": now},
            )
            self.status = (
                await db.execute(
                    text(
                        "SELECT id FROM issue_statuses WHERE workspace_id=:workspace AND category='UNSTARTED' LIMIT 1"
                    ),
                    {"workspace": self.workspace},
                )
            ).scalar_one()
            self.issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=self.workspace,
                        teamId=self.team,
                        projectId=self.project,
                        statusId=self.status,
                        title="Investigate MCP bug",
                    ),
                    self.user,
                    db,
                )
            )["data"]
            self.other_issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=self.workspace,
                        teamId=self.team,
                        projectId=self.other_project,
                        statusId=self.status,
                        title="Other project secret",
                    ),
                    self.user,
                    db,
                )
            )["data"]
            self.connection = await create(
                db,
                self.workspace,
                self.user,
                ConnectionInput(
                    name="Integration test",
                    scopes=sorted(ALL_SCOPES),
                    projectIds=[self.project],
                ),
            )
            self.principal = await authenticate(db, self.connection["token"])
            await db.commit()
        self.application = ToolApplication(self.factory, self.settings)

    async def asyncTearDown(self):
        async with self.factory() as db:
            await db.execute(
                text("DELETE FROM workspaces WHERE id=:id"), {"id": self.workspace}
            )
            await db.execute(
                text("DELETE FROM organizations WHERE id=:id"),
                {"id": self.seed["organization_id"]},
            )
            await db.execute(
                text("DELETE FROM users WHERE id=:id"), {"id": self.user["id"]}
            )
            await db.commit()
        await self.engine.dispose()

    async def call(self, name, **arguments):
        return await self.application.call(self.principal, name, arguments)

    async def test_read_tools_respect_project_scope(self):
        for name, args in [
            ("get_my_access", {}),
            ("list_workspaces", {}),
            ("list_teams", {}),
            ("list_projects", {}),
            ("get_project", {"projectId": self.project}),
            ("list_issue_options", {"teamId": self.team}),
            ("search_documents", {}),
            ("list_activities", {"issueId": self.issue["id"]}),
            ("list_issue_reviews", {"issueId": self.issue["id"]}),
            ("get_issue_context", {"issueId": self.issue["identifier"]}),
        ]:
            with self.subTest(tool=name):
                self.assertIsInstance(
                    await self.application.call(self.principal, name, args), dict
                )
        rows = await self.call("search_issues", projectId=self.project)
        self.assertEqual([item["id"] for item in rows["items"]], [self.issue["id"]])
        with self.assertRaises(ApiError) as error:
            await self.call("get_issue", issueId=self.other_issue["id"])
        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(
            (await self.call("search_issues", projectId=self.other_project))["items"],
            [],
        )

    async def test_comment_retries_and_version_conflicts(self):
        args = {
            "issueId": self.issue["id"],
            "content": "Progress recorded",
            "idempotencyKey": "comment-retry-key",
        }
        first, second = await asyncio.gather(
            self.application.call(self.principal, "add_comment", args),
            self.application.call(self.principal, "add_comment", args),
        )
        self.assertEqual(first, second)
        self.assertEqual(
            len((await self.call("list_comments", issueId=self.issue["id"]))["items"]),
            1,
        )
        with self.assertRaises(ApiError) as error:
            await self.application.call(
                self.principal, "add_comment", {**args, "content": "Different"}
            )
        self.assertEqual(error.exception.status_code, 409)

        comment = first["data"]
        update = await self.call(
            "update_comment",
            commentId=comment["id"],
            content="Edited",
            expectedVersion=1,
            idempotencyKey="comment-update-key",
        )
        self.assertEqual(update["data"]["version"], 2)
        with self.assertRaises(ApiError) as error:
            await self.call(
                "update_comment",
                commentId=comment["id"],
                content="Stale",
                expectedVersion=1,
                idempotencyKey="comment-stale-key",
            )
        self.assertEqual(error.exception.status_code, 409)

    async def test_web_issue_pages_preserve_scope_filters_and_direct_lookup(self):
        from app.domains.auth import current_user

        bug = (
            await self.call(
                "create_issue",
                teamId=self.team,
                projectId=self.project,
                statusId=self.status,
                title="Đồng bộ tài liệu",
                issueType="BUG",
                severity="CRITICAL",
                idempotencyKey="web-query-bug",
            )
        )["data"]
        host = create_app(self.settings)
        host.state.session_factory = self.factory
        host.dependency_overrides[current_user] = lambda: self.user
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=host), base_url="http://testserver"
        ) as client:
            query = {
                "workspaceId": self.workspace,
                "projectId": self.project,
                "limit": 1,
            }
            first = await client.get("/api/v1/issues", params=query)
            self.assertEqual(first.status_code, 200, first.text)
            self.assertEqual(first.json()["meta"]["total"], 2)
            cursor = first.json()["meta"]["nextCursor"]
            second = await client.get(
                "/api/v1/issues", params={**query, "cursor": cursor}
            )
            self.assertNotEqual(
                first.json()["data"][0]["id"], second.json()["data"][0]["id"]
            )
            changed = await client.get(
                "/api/v1/issues",
                params={**query, "cursor": cursor, "scope": "assigned"},
            )
            self.assertEqual(changed.status_code, 400)
            result = await client.get(
                "/api/v1/issues",
                params={
                    **query,
                    "query": "dong bo tai lieu",
                    "filters": '[{"columnId":"issueType","type":"option","operator":"is","values":["BUG"]}]',
                },
            )
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual([row["id"] for row in result.json()["data"]], [bug["id"]])
            lookup = await client.get(
                "/api/v1/issues/lookup/" + bug["identifier"],
                params={"workspaceId": self.workspace},
            )
            self.assertEqual(lookup.json()["data"]["id"], bug["id"])
            report = await client.get(
                "/api/v1/issues/bug-report", params={"workspaceId": self.workspace}
            )
            self.assertEqual(report.status_code, 200, report.text)
            self.assertEqual(report.json()["data"]["total"], 1)

    async def test_run_evidence_web_read_excludes_lease_secrets(self):
        from app.domains.auth import current_user

        run = (
            await self.call(
                "claim_issue",
                issueId=self.issue["id"],
                idempotencyKey="web-evidence-run",
            )
        )["data"]
        host = create_app(self.settings)
        host.state.session_factory = self.factory
        host.dependency_overrides[current_user] = lambda: self.user
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=host), base_url="http://testserver"
        ) as client:
            response = await client.get(
                f"/api/v1/agent-runs/runs/{run['id']}",
                params={"workspaceId": self.workspace},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotIn("leaseToken", response.json()["data"])
            canceled = await client.post(
                f"/api/v1/agent-runs/runs/{run['id']}/cancel",
                params={"workspaceId": self.workspace},
            )
            self.assertEqual(canceled.status_code, 200, canceled.text)
            self.assertEqual(canceled.json()["data"]["state"], "CANCELED")

    async def test_password_reset_http_does_not_disclose_accounts_and_invalidates_access_cookie(
        self,
    ):
        from unittest.mock import AsyncMock, patch
        from app.domains.auth import password_hasher

        host = create_app(
            replace(
                self.settings,
                smtp_host="mail.example.test",
                smtp_from="flowie@example.test",
            )
        )
        host.state.session_factory = self.factory
        async with self.factory() as db:
            await db.execute(
                text("UPDATE users SET password_hash=:password WHERE id=:id"),
                {
                    "id": self.user["id"],
                    "password": password_hasher.hash("Original-Password-2026!"),
                },
            )
            await db.commit()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=host), base_url="http://testserver"
        ) as client:
            login = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": self.user["email"],
                    "password": "Original-Password-2026!",
                },
            )
            self.assertEqual(login.status_code, 200, login.text)
            with patch(
                "app.modules.identity.api.deliver_reset", new=AsyncMock()
            ) as delivery:
                known = await client.post(
                    "/api/v1/auth/password-reset/request",
                    json={"email": self.user["email"]},
                )
                unknown = await client.post(
                    "/api/v1/auth/password-reset/request",
                    json={"email": "unknown-" + self.user["email"]},
                )
                self.assertEqual(known.status_code, 202)
                self.assertEqual(known.json(), unknown.json())
                token = delivery.call_args.args[2]
            confirmed = await client.post(
                "/api/v1/auth/password-reset/confirm",
                json={"token": token, "password": "Replacement-Password-2026!"},
            )
            self.assertEqual(confirmed.status_code, 200, confirmed.text)
            denied = await client.get("/api/v1/workspaces/me")
            self.assertEqual(denied.status_code, 401)

    async def test_password_reset_expires_is_single_use_and_revokes_credentials(self):
        from app.modules.identity.password_reset import (
            issue_reset,
            consume_reset,
            limit_request,
        )
        from app.domains.auth import password_hasher
        from app.core.identifiers import _hash_token

        async with self.factory() as db:
            await db.execute(
                text("UPDATE users SET password_hash=:password WHERE id=:id"),
                {
                    "id": self.user["id"],
                    "password": password_hasher.hash("Original-Password-2026!"),
                },
            )
            await db.commit()
            self.assertIsNone(await issue_reset(db, "unknown@example.test"))
            token = await issue_reset(db, self.user["email"])
            stored = (
                await db.execute(
                    text(
                        "SELECT token_hash FROM password_reset_tokens WHERE user_id=:id"
                    ),
                    {"id": self.user["id"]},
                )
            ).scalar_one()
            self.assertEqual(stored, _hash_token(token))
            self.assertNotEqual(stored, token)
            await db.execute(
                text(
                    "UPDATE password_reset_tokens SET expires_at=:expired WHERE user_id=:id"
                ),
                {"expired": _utcnow() - timedelta(seconds=1), "id": self.user["id"]},
            )
            await db.commit()
            with self.assertRaises(ApiError):
                await consume_reset(db, token, "Replacement-Password-2026!")
            await db.rollback()
            token = await issue_reset(db, self.user["email"])
            await consume_reset(db, token, "Replacement-Password-2026!")
            with self.assertRaises(ApiError):
                await consume_reset(db, token, "Another-Password-2026!")
            await db.rollback()
            user = (
                (
                    await db.execute(
                        text(
                            "SELECT password_hash,auth_version FROM users WHERE id=:id"
                        ),
                        {"id": self.user["id"]},
                    )
                )
                .mappings()
                .one()
            )
            self.assertTrue(
                password_hasher.verify(
                    user["password_hash"], "Replacement-Password-2026!"
                )
            )
            self.assertEqual(user["auth_version"], 1)
            self.assertEqual(
                (
                    await db.execute(
                        text(
                            "SELECT count(*) FROM mcp_connections WHERE user_id=:id AND revoked_at IS NULL"
                        ),
                        {"id": self.user["id"]},
                    )
                ).scalar_one(),
                0,
            )
            await limit_request(db, "test-secret", "test", self.user["id"], 1)
            with self.assertRaises(ApiError) as limited:
                await limit_request(db, "test-secret", "test", self.user["id"], 1)
            self.assertEqual(limited.exception.status_code, 429)

    async def test_web_comment_retry_is_deduplicated_after_commit(self):
        from app.modules.work_items.comments import create_comment
        from app.modules.work_items.contracts import CreateCommentInput
        from app.db.mutations import commit_mutation

        payload = CreateCommentInput(
            workspaceId=self.workspace,
            issueId=self.issue["id"],
            content="Web retry",
            clientRequestKey="web-retry-test-key",
        )

        async def submit():
            async with self.factory() as db:
                return await commit_mutation(
                    db, lambda: create_comment(payload, self.user, db)
                )

        first, second = await asyncio.gather(submit(), submit())
        self.assertEqual(first["data"]["id"], second["data"]["id"])
        async with self.factory() as db:
            self.assertEqual(
                (
                    await db.execute(
                        text(
                            "SELECT count(*) FROM comments WHERE issue_id=:id AND content=:content"
                        ),
                        {"id": self.issue["id"], "content": "Web retry"},
                    )
                ).scalar_one(),
                1,
            )

    async def test_comment_replies_mentions_and_revision_history(self):
        parent = (
            await self.call(
                "add_comment",
                issueId=self.issue["id"],
                content="Parent",
                mentionIds=[self.user["id"]],
                idempotencyKey="comment-parent-key",
            )
        )["data"]
        reply = (
            await self.call(
                "add_comment",
                issueId=self.issue["id"],
                content="Reply",
                parentCommentId=parent["id"],
                idempotencyKey="comment-reply-key",
            )
        )["data"]
        self.assertEqual(reply["parentCommentId"], parent["id"])
        with self.assertRaises(ApiError):
            await self.call(
                "add_comment",
                issueId=self.issue["id"],
                content="Invalid nested reply",
                parentCommentId=reply["id"],
                idempotencyKey="comment-nested-key",
            )
        with self.assertRaises(ApiError):
            await self.call(
                "add_comment",
                issueId=self.issue["id"],
                content="Invalid mention",
                mentionIds=["not-a-member"],
                idempotencyKey="comment-mention-key",
            )
        await self.call(
            "update_comment",
            commentId=parent["id"],
            content="Parent edited",
            expectedVersion=parent["version"],
            idempotencyKey="comment-edit-history",
        )
        async with self.factory() as db:
            revisions = (
                (
                    await db.execute(
                        text(
                            "SELECT content FROM comment_revisions WHERE comment_id=:id ORDER BY version"
                        ),
                        {"id": parent["id"]},
                    )
                )
                .scalars()
                .all()
            )
            self.assertEqual(revisions, ["Parent", "Parent edited"])

    async def test_structured_bugs_share_web_and_mcp_contracts(self):
        created = await self.call(
            "create_issue",
            teamId=self.team,
            projectId=self.project,
            statusId=self.status,
            title="Structured bug",
            issueType="BUG",
            severity="CRITICAL",
            environment="Windows / Chrome",
            reproductionSteps="Open the editor",
            expectedResult="Save succeeds",
            actualResult="Draft is lost",
            idempotencyKey="structured-bug-create",
        )
        bug = created["data"]
        self.assertEqual(bug["issueType"], "BUG")
        self.assertEqual(bug["severity"], "CRITICAL")
        results = await self.call("search_issues", issueType="BUG", severity="CRITICAL")
        self.assertEqual([row["id"] for row in results["items"]], [bug["id"]])
        updated = await self.call(
            "update_issue",
            issueId=bug["id"],
            expectedVersion=bug["version"],
            reproductionSteps="Open and close the editor",
            idempotencyKey="structured-bug-edit",
        )
        self.assertEqual(
            updated["data"]["reproductionSteps"], "Open and close the editor"
        )
        legacy = await self.call("get_issue", issueId=self.issue["id"])
        self.assertEqual(legacy["issueType"], "TASK")

    async def test_issue_mutations_and_pagination(self):
        created = await self.call(
            "create_issue",
            teamId=self.team,
            projectId=self.project,
            statusId=self.status,
            title="Second bug",
            idempotencyKey="issue-create-key",
        )
        page = await self.call("search_issues", projectId=self.project, limit=1)
        next_page = await self.call(
            "search_issues", projectId=self.project, limit=1, cursor=page["nextCursor"]
        )
        self.assertNotEqual(page["items"][0]["id"], next_page["items"][0]["id"])
        updated = await self.call(
            "update_issue",
            issueId=created["data"]["id"],
            title="Updated bug",
            expectedVersion=1,
            idempotencyKey="issue-update-key",
        )
        self.assertEqual(updated["data"]["version"], 2)
        transition = await self.call(
            "transition_issue",
            issueId=created["data"]["id"],
            statusId=self.status,
            reason="Verified current state",
            expectedVersion=2,
            idempotencyKey="transition-key",
        )
        self.assertEqual(transition["data"]["version"], 3)
        with self.assertRaises(ApiError):
            await self.call(
                "update_issue",
                issueId=created["data"]["id"],
                projectId=self.other_project,
                expectedVersion=3,
                idempotencyKey="move-outside-key",
            )

    async def test_document_links_history_restore_and_isolation(self):
        created = await self.call(
            "create_document",
            projectId=self.project,
            title="Bug analysis",
            content="First",
            idempotencyKey="document-create-key",
        )
        document = created["data"]
        await self.call(
            "update_document",
            documentId=document["id"],
            content="Second",
            expectedVersion=1,
            idempotencyKey="document-update-key",
        )
        revisions = await self.call(
            "list_document_revisions", documentId=document["id"]
        )
        self.assertEqual([r["version"] for r in revisions["items"]], [2, 1])
        revision = await self.call(
            "get_document_revision", documentId=document["id"], revisionVersion=1
        )
        self.assertEqual(revision["content"], "First")
        diff = await self.call(
            "get_document_diff", documentId=document["id"], fromVersion=1
        )
        self.assertIn("-First", diff["diff"])
        self.assertIn("+Second", diff["diff"])
        restored = await self.call(
            "restore_document",
            documentId=document["id"],
            revisionVersion=1,
            expectedVersion=2,
            idempotencyKey="document-restore-key",
        )
        self.assertEqual(restored["data"]["content"], "First")
        self.assertEqual(restored["data"]["version"], 3)
        await self.call(
            "link_document",
            documentId=document["id"],
            issueId=self.issue["id"],
            idempotencyKey="document-link-key",
        )
        self.assertEqual(
            (await self.call("search_documents", issueId=self.issue["id"]))["items"][0][
                "id"
            ],
            document["id"],
        )
        private_doc = _cuid()
        async with self.factory() as db:
            await db.execute(
                text("""INSERT INTO documents (id,workspace_id,team_id,title,content,created_by,updated_by,created_at,updated_at)
                VALUES (:id,:workspace,:team,'Secret','Private content',:user,:user,:now,:now)"""),
                {
                    "id": private_doc,
                    "workspace": self.workspace,
                    "team": self.private_team,
                    "user": self.user["id"],
                    "now": _utcnow(),
                },
            )
            await db.commit()
        with self.assertRaises(ApiError):
            await self.call("get_document", documentId=private_doc)

    async def test_revocation_and_membership_change(self):
        async with self.factory() as db:
            await revoke(db, self.workspace, self.user, self.connection["id"])
        with self.assertRaises(ApiError) as error:
            await self.call("get_issue", issueId=self.issue["id"])
        self.assertEqual(error.exception.status_code, 401)

    async def test_expired_token_and_write_kill_switch(self):
        read_only_app = ToolApplication(
            self.factory, replace(self.settings, mcp_writes_enabled=False)
        )
        self.assertTrue(
            all(not tool.write for tool in visible_tools(self.principal, False))
        )
        with self.assertRaises(ApiError):
            await read_only_app.call(
                self.principal,
                "add_comment",
                {
                    "issueId": self.issue["id"],
                    "content": "Denied",
                    "idempotencyKey": "disabled-write-key",
                },
            )
        async with self.factory() as db:
            await db.execute(
                text("UPDATE mcp_connections SET expires_at=:expired WHERE id=:id"),
                {"id": self.connection["id"], "expired": _utcnow() - timedelta(days=1)},
            )
            await db.commit()
            with self.assertRaises(ApiError):
                await authenticate(db, self.connection["token"])

    async def test_http_protocol_discovery_call_and_auth(self):
        host = create_app(self.settings)
        host.state.session_factory = self.factory
        async with host.state.mcp_server.session_manager.run():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=host), base_url="http://testserver"
            ) as client:
                self.assertEqual((await client.post("/mcp/", json={})).status_code, 401)
                headers = {
                    "Authorization": f"Bearer {self.connection['token']}",
                    "Accept": "application/json, text/event-stream",
                    "MCP-Protocol-Version": "2025-11-25",
                }
                initialized = await client.post(
                    "/mcp/",
                    headers=headers,
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "initialize",
                        "params": {
                            "protocolVersion": "2025-11-25",
                            "capabilities": {},
                            "clientInfo": {"name": "Flowie-test", "version": "1"},
                        },
                    },
                )
                self.assertEqual(initialized.status_code, 200, initialized.text)
                discovered = await client.post(
                    "/mcp/",
                    headers=headers,
                    json={
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/list",
                        "params": {},
                    },
                )
                self.assertEqual(discovered.status_code, 200, discovered.text)
                self.assertIn(
                    "get_issue",
                    [tool["name"] for tool in discovered.json()["result"]["tools"]],
                )
                called = await client.post(
                    "/mcp/",
                    headers=headers,
                    json={
                        "jsonrpc": "2.0",
                        "id": 3,
                        "method": "tools/call",
                        "params": {
                            "name": "get_issue",
                            "arguments": {"issueId": self.issue["id"]},
                        },
                    },
                )
                self.assertEqual(called.status_code, 200, called.text)
                self.assertEqual(
                    called.json()["result"]["structuredContent"]["id"], self.issue["id"]
                )
                denied = await client.post(
                    "/mcp/",
                    headers=headers,
                    json={
                        "jsonrpc": "2.0",
                        "id": 4,
                        "method": "tools/call",
                        "params": {
                            "name": "get_issue",
                            "arguments": {"issueId": self.other_issue["id"]},
                        },
                    },
                )
                self.assertTrue(denied.json()["result"]["isError"])

    async def test_official_sdk_client_round_trip(self):
        import httpx2
        from mcp.client.session import ClientSession
        from mcp.client.streamable_http import streamable_http_client

        host = create_app(self.settings)
        host.state.session_factory = self.factory
        async with host.state.mcp_server.session_manager.run():
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=host),
                headers={"Authorization": f"Bearer {self.connection['token']}"},
            ) as http_client:
                async with streamable_http_client(
                    "http://testserver/mcp/", http_client=http_client
                ) as streams:
                    async with ClientSession(*streams) as session:
                        initialized = await session.initialize()
                        self.assertEqual(initialized.server_info.name, "Flowie")
                        result = await session.call_tool(
                            "get_issue", {"issueId": self.issue["id"]}
                        )
                        self.assertFalse(result.is_error)
                        self.assertEqual(
                            result.structured_content["id"], self.issue["id"]
                        )

    async def test_run_lease_reclaim_fencing_and_results(self):
        first = (
            await self.call(
                "claim_issue",
                issueId=self.issue["id"],
                idempotencyKey="first-claim-key",
            )
        )["data"]
        with self.assertRaises(ApiError):
            await self.call(
                "claim_issue",
                issueId=self.issue["id"],
                idempotencyKey="second-claim-key",
            )
        await self.call(
            "heartbeat_run",
            runId=first["id"],
            leaseToken=first["leaseToken"],
            fencingToken=1,
            idempotencyKey="heartbeat-key",
        )
        async with self.factory() as db:
            await db.execute(
                text("UPDATE agent_runs SET lease_until=:expired WHERE id=:id"),
                {"id": first["id"], "expired": _utcnow() - timedelta(minutes=1)},
            )
            await db.commit()
        second = (
            await self.call(
                "claim_issue",
                issueId=self.issue["id"],
                idempotencyKey="reclaim-issue-key",
            )
        )["data"]
        self.assertEqual(second["id"], first["id"])
        self.assertEqual(second["fencingToken"], 2)
        with self.assertRaises(ApiError):
            await self.call(
                "report_run_result",
                runId=first["id"],
                leaseToken=first["leaseToken"],
                fencingToken=1,
                outcome="FAILED",
                summary="Stale result",
                idempotencyKey="stale-result-key",
            )
        result = await self.call(
            "report_run_result",
            runId=second["id"],
            leaseToken=second["leaseToken"],
            fencingToken=2,
            outcome="AWAITING_REVIEW",
            summary="Fixed in a branch; pending review",
            commit="a" * 40,
            tests=[{"command": "pytest", "result": "passed"}],
            idempotencyKey="run-result-key",
        )
        self.assertEqual(result["data"]["state"], "AWAITING_REVIEW")
        self.assertEqual(
            (await self.call("get_issue", issueId=self.issue["id"]))["statusId"],
            self.status,
        )
        self.assertEqual(
            (await self.call("get_run", runId=second["id"]))["state"], "AWAITING_REVIEW"
        )
        self.assertEqual(
            (await self.call("list_runs", projectId=self.project))["items"][0]["id"],
            second["id"],
        )

    async def test_modern_sdk_transport(self):
        import httpx2
        from mcp.client.session import ClientSession
        from mcp.client.streamable_http import streamable_http_client
        from mcp.types import DiscoverResult, ServerCapabilities, ToolsCapability

        host = create_app(self.settings)
        host.state.session_factory = self.factory
        async with host.state.mcp_server.session_manager.run():
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=host),
                headers={"Authorization": f"Bearer {self.connection['token']}"},
            ) as http_client:
                async with streamable_http_client(
                    "http://testserver/mcp/", http_client=http_client
                ) as streams:
                    async with ClientSession(*streams) as session:
                        session.adopt(
                            DiscoverResult(
                                supported_versions=["2026-07-28"],
                                capabilities=ServerCapabilities(
                                    tools=ToolsCapability()
                                ),
                            )
                        )
                        tools = await session.list_tools()
                        self.assertIn("get_issue", [tool.name for tool in tools.tools])
                        result = await session.call_tool(
                            "get_issue", {"issueId": self.issue["id"]}
                        )
                        self.assertFalse(result.is_error)
                        self.assertEqual(
                            result.structured_content["id"], self.issue["id"]
                        )

    async def test_management_cookie_auth_and_rate_limit(self):
        import jwt

        host = create_app(replace(self.settings, mcp_rate_limit=1))
        host.state.session_factory = self.factory
        async with host.state.mcp_server.session_manager.run():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=host), base_url="http://testserver"
            ) as client:
                headers = {"Authorization": f"Bearer {self.connection['token']}"}
                response = await client.get(
                    "/api/v1/mcp/connections",
                    params={"workspaceId": self.workspace},
                    headers=headers,
                )
                self.assertEqual(response.status_code, 401)
                client.cookies.set(
                    "flowie_access",
                    jwt.encode(
                        {
                            "sub": self.user["id"],
                            "exp": _utcnow() + timedelta(minutes=10),
                        },
                        self.settings.auth_jwt_secret,
                        algorithm="HS256",
                    ),
                )
                for path in [
                    "/api/v1/mcp/resources",
                    "/api/v1/mcp/connections",
                    "/api/v1/agent-runs/runs",
                    "/api/v1/agent-runs/summary",
                ]:
                    response = await client.get(
                        path, params={"workspaceId": self.workspace}
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                headers["Accept"] = "application/json, text/event-stream"
                body = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-11-25",
                        "capabilities": {},
                        "clientInfo": {"name": "test", "version": "1"},
                    },
                }
                self.assertEqual(
                    (
                        await client.post("/mcp/", headers=headers, json=body)
                    ).status_code,
                    200,
                )
                limited = await client.post("/mcp/", headers=headers, json=body)
                self.assertEqual(limited.status_code, 429)
                self.assertIn("Retry-After", limited.headers)

    async def test_web_writer_versions(self):
        async with self.factory() as db:
            await db.execute(
                text("UPDATE issues SET title=:title WHERE id=:id"),
                {"title": "Web edit retained", "id": self.issue["id"]},
            )
            await db.commit()
        with self.assertRaises(ApiError) as error:
            await self.call(
                "update_issue",
                issueId=self.issue["id"],
                title="Stale AI edit",
                expectedVersion=1,
                idempotencyKey="stale-web-conflict",
            )
        self.assertEqual(error.exception.status_code, 409)
        current = await self.call("get_issue", issueId=self.issue["id"])
        self.assertEqual(current["title"], "Web edit retained")
        self.assertEqual(current["version"], 2)

    async def test_removed_workspace_membership_blocks_web_and_mcp(self):
        from app.domains.native_issues import update_issue
        from app.modules.work_items.contracts import UpdateIssueInput

        async with self.factory() as db:
            await db.execute(
                text(
                    "DELETE FROM workspace_members WHERE workspace_id=:workspace AND user_id=:user"
                ),
                {"workspace": self.workspace, "user": self.user["id"]},
            )
            await db.commit()
            with self.assertRaises(ApiError):
                await update_issue(
                    self.issue["id"],
                    UpdateIssueInput(title="Denied Web mutation"),
                    self.workspace,
                    self.user,
                    db,
                )
        with self.assertRaises(ApiError):
            await self.call("get_issue", issueId=self.issue["id"])

    async def test_scope_discovery_rejects_unauthorized_tools(self):
        from dataclasses import replace as replace_principal

        restricted = replace_principal(
            self.principal, scopes=frozenset({"issues:read"})
        )
        names = {tool.name for tool in visible_tools(restricted, True)}
        self.assertNotIn("add_comment", names)
        self.assertNotIn("get_document", names)
        with self.assertRaises(ApiError):
            await self.application.call(
                restricted,
                "add_comment",
                {
                    "issueId": self.issue["id"],
                    "content": "Denied",
                    "idempotencyKey": "denied-scope-key",
                },
            )

    async def test_automation_deduplication_and_repository_mapping(self):
        from app.modules.agent_runs.api import (
            configure_automation,
            configure_repository,
        )
        from app.modules.agent_runs.contracts import AutomationInput, RepositoryInput
        from app.modules.agent_runs.dispatcher import process_event

        async with self.factory() as db:
            label = _cuid()
            await db.execute(
                text(
                    "INSERT INTO labels (id,workspace_id,name,color,created_at,updated_at) VALUES (:id,:workspace,:name,:color,:now,:now)"
                ),
                {
                    "id": label,
                    "workspace": self.workspace,
                    "name": "AI requested",
                    "color": "#ffffff",
                    "now": _utcnow(),
                },
            )
            await db.execute(
                text(
                    "INSERT INTO issue_labels (issue_id,label_id) VALUES (:issue,:label)"
                ),
                {"issue": self.issue["id"], "label": label},
            )
            await db.commit()
            await configure_repository(
                RepositoryInput(
                    projectId=self.project,
                    name="Repository",
                    repositoryUrl="https://github.com/example/example.git",
                    baseBranch="main",
                    testCommands=[["python", "-m", "pytest"]],
                ),
                self.workspace,
                self.user,
                db,
            )
            await configure_automation(
                AutomationInput(
                    name="AI queue",
                    connectionId=self.connection["id"],
                    projectId=self.project,
                    labelId=label,
                    enabled=True,
                    dailyLimit=1,
                ),
                self.workspace,
                self.user,
                db,
            )
            await db.execute(
                text("UPDATE issues SET title=title WHERE id=:issue"),
                {"issue": self.issue["id"]},
            )
            await db.execute(
                text("UPDATE issues SET title=title WHERE id=:issue"),
                {"issue": self.issue["id"]},
            )
            await db.commit()
        for _ in range(10):
            if not await process_event(self.factory):
                break
        runs = await self.call("list_runs", state="PENDING")
        self.assertEqual(len(runs["items"]), 1)
        repositories = await self.call(
            "get_project_repositories", projectId=self.project
        )
        self.assertEqual(
            repositories["items"][0]["testCommands"], [["python", "-m", "pytest"]]
        )
        async with self.factory() as db:
            before = (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM agent_issue_events WHERE workspace_id=:workspace"
                    ),
                    {"workspace": self.workspace},
                )
            ).scalar_one()
        await self.call(
            "update_issue",
            issueId=self.issue["id"],
            title="AI update",
            expectedVersion=3,
            idempotencyKey="no-recursion-key",
        )
        async with self.factory() as db:
            after = (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM agent_issue_events WHERE workspace_id=:workspace"
                    ),
                    {"workspace": self.workspace},
                )
            ).scalar_one()
        self.assertEqual(before, after)

    async def test_transactional_outbox_failure_retry_and_success(self):
        from unittest.mock import AsyncMock, patch
        from app.modules.notifications.outbox import process_one

        async with self.factory() as db:
            identifier = _cuid()
            await db.execute(
                text(
                    "INSERT INTO notification_outbox (id,workspace_id,payload) VALUES (:id,:workspace,'{}'::jsonb)"
                ),
                {"id": identifier, "workspace": self.workspace},
            )
            await db.commit()
        with patch(
            "app.modules.notifications.outbox.deliver",
            AsyncMock(side_effect=RuntimeError("temporary")),
        ):
            self.assertTrue(await process_one(self.factory, identifier))
        async with self.factory() as db:
            row = (
                (
                    await db.execute(
                        text("SELECT * FROM notification_outbox WHERE id=:id"),
                        {"id": identifier},
                    )
                )
                .mappings()
                .one()
            )
            self.assertIsNone(row["delivered_at"])
            self.assertEqual(row["attempts"], 1)
            await db.execute(
                text("UPDATE notification_outbox SET available_at=:now WHERE id=:id"),
                {"id": identifier, "now": _utcnow()},
            )
            await db.commit()
        with patch("app.modules.notifications.outbox.deliver", AsyncMock()):
            self.assertTrue(await process_one(self.factory, identifier))
        async with self.factory() as db:
            row = (
                (
                    await db.execute(
                        text("SELECT * FROM notification_outbox WHERE id=:id"),
                        {"id": identifier},
                    )
                )
                .mappings()
                .one()
            )
            self.assertIsNotNone(row["delivered_at"])
            self.assertEqual(row["payload"], {})

    async def test_large_search_and_web_document_isolation(self):
        from app.domains.native_documents import list_documents

        async with self.factory() as db:
            await db.execute(
                text("""INSERT INTO issues (id,workspace_id,team_id,status_id,project_id,identifier,number,title,creator_id,created_at,updated_at)
                SELECT :prefix||n,:workspace,:team,:status,:project,:prefix||'-'||n,1000+n,'Bulk issue '||n,:user,:now,:now
                FROM generate_series(1,1000) n"""),
                {
                    "prefix": _cuid(),
                    "workspace": self.workspace,
                    "team": self.team,
                    "status": self.status,
                    "project": self.project,
                    "user": self.user["id"],
                    "now": _utcnow(),
                },
            )
            private_doc = _cuid()
            await db.execute(
                text("""INSERT INTO documents (id,workspace_id,team_id,title,content,created_by,updated_by,created_at,updated_at)
                VALUES (:id,:workspace,:team,'Private','Never expose',:user,:user,:now,:now)"""),
                {
                    "id": private_doc,
                    "workspace": self.workspace,
                    "team": self.private_team,
                    "user": self.user["id"],
                    "now": _utcnow(),
                },
            )
            await db.commit()
            documents = await list_documents(self.workspace, None, self.user, db)
            self.assertNotIn(private_doc, [item["id"] for item in documents["data"]])
        identifiers, cursor = set(), None
        for _ in range(11):
            page = await self.call(
                "search_issues", projectId=self.project, limit=100, cursor=cursor
            )
            for item in page["items"]:
                self.assertNotIn(item["id"], identifiers)
                identifiers.add(item["id"])
            cursor = page["nextCursor"]
            if not cursor:
                break
        self.assertEqual(len(identifiers), 1001)

    async def test_team_membership_routes_revoke_mcp_access(self):
        from app.domains.teams import update_member, remove_member, TeamMemberRoleInput

        async with self.factory() as db:
            result = await update_member(
                self.team,
                self.user["id"],
                TeamMemberRoleInput(role="MEMBER"),
                self.workspace,
                self.user,
                db,
            )
            self.assertEqual(result["data"]["role"], "MEMBER")
            result = await remove_member(
                self.team, self.user["id"], self.workspace, self.user, db
            )
            self.assertTrue(result["data"]["removed"])
        with self.assertRaises(ApiError):
            await self.call("get_issue", issueId=self.issue["id"])

    async def test_attachment_authorization_before_storage_and_chunks(self):
        from unittest.mock import AsyncMock, patch

        allowed, denied = _cuid(), _cuid()
        async with self.factory() as db:
            for identifier, issue in [
                (allowed, self.issue),
                (denied, self.other_issue),
            ]:
                await db.execute(
                    text("""INSERT INTO attachments (id,workspace_id,uploaded_by,entity_type,entity_id,object_key,filename,mime_type,size,created_at)
                    VALUES (:id,:workspace,:user,'issue',:issue,:id,'debug.log','text/plain',12,:now)"""),
                    {
                        "id": identifier,
                        "workspace": self.workspace,
                        "user": self.user["id"],
                        "issue": issue["id"],
                        "now": _utcnow(),
                    },
                )
            await db.commit()
        with patch(
            "app.storage.minio.MinioStorage.get",
            AsyncMock(return_value=b"one\ntwo\nthree"),
        ) as storage:
            with self.assertRaises(ApiError):
                await self.call("read_attachment_text", attachmentId=denied)
            storage.assert_not_called()
            result = await self.call(
                "read_attachment_text", attachmentId=allowed, limit=4
            )
            self.assertEqual(result["text"], "one\n")
            self.assertEqual(result["nextOffset"], 4)

    async def test_mutation_budget_replays_and_inactive_retention(self):
        from app.modules.mcp.maintenance import cleanup

        bounded = ToolApplication(
            self.factory, replace(self.settings, mcp_max_idempotency_keys=1)
        )
        args = {
            "issueId": self.issue["id"],
            "content": "One mutation",
            "idempotencyKey": "bounded-key",
        }
        result = await bounded.call(self.principal, "add_comment", args)
        self.assertEqual(
            await bounded.call(self.principal, "add_comment", args), result
        )
        with self.assertRaises(ApiError) as error:
            await bounded.call(
                self.principal,
                "add_comment",
                {**args, "idempotencyKey": "second-bounded-key"},
            )
        self.assertEqual(error.exception.status_code, 429)
        async with self.factory() as db:
            await db.execute(
                text("UPDATE mcp_connections SET expires_at=:expired WHERE id=:id"),
                {
                    "id": self.principal.connection_id,
                    "expired": _utcnow() - timedelta(days=8),
                },
            )
            await db.commit()
        await cleanup(self.factory)
        async with self.factory() as db:
            count = (
                await db.execute(
                    text("SELECT COUNT(*) FROM mcp_requests WHERE connection_id=:id"),
                    {"id": self.principal.connection_id},
                )
            ).scalar_one()
            self.assertEqual(count, 0)
