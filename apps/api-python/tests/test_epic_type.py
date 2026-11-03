import asyncio
import json
import os
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.contracts import CreateIssueInput, UpdateIssueInput
from app.modules.work_items.issues import create_issue, update_issue
from app.modules.work_items.issue_search import search_page
from app.modules.work_items.query_contract import IssueSelectionQuery
from app.modules.work_items.saved_view_config import IssueViewConfig
from app.modules.mcp.contracts import (
    CreateIssueTool,
    UpdateIssueTool,
    SearchIssuesInput,
)
from app.modules.recurring.contracts import RecurringTemplate


def test_epic_contracts_remain_independent_of_status():
    base = {"workspaceId": "workspace", "title": "Large goal", "issueType": "EPIC"}
    assert CreateIssueInput(**base).issueType == "EPIC"
    assert IssueSelectionQuery(issueType="EPIC").issueType == "EPIC"
    assert IssueViewConfig(query={"issueType": "EPIC"}).query.issueType == "EPIC"
    assert (
        CreateIssueTool(
            title="Large goal",
            issueType="EPIC",
            teamId="team",
            statusId="status",
            idempotencyKey="epic-create",
        ).issueType
        == "EPIC"
    )
    assert (
        UpdateIssueTool(
            issueId="DTD-1",
            expectedVersion=1,
            idempotencyKey="epic-test",
            issueType="EPIC",
        ).issueType
        == "EPIC"
    )
    assert SearchIssuesInput(issueType="EPIC").issueType == "EPIC"
    assert RecurringTemplate(title="Large goal", issueType="EPIC").issueType == "EPIC"


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_epic_persists_with_workflow_hierarchy_and_bug_metadata():
    asyncio.run(verify_epic())


async def verify_epic():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            (now, user_id) = (_utcnow(), _cuid())
            user = {"id": user_id, "name": "Epic owner"}
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Epic owner',:email,'ACTIVE',:now,:now)"
                ),
                {"id": user_id, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user_id,
                organization_name="Epic",
                workspace_name=_cuid(),
                now=now,
            )
            (workspace, team) = (seed["workspace_id"], seed["team_id"])
            statuses = dict(
                (
                    await db.execute(
                        text(
                            "SELECT DISTINCT ON (category) category::text,id FROM issue_statuses WHERE workspace_id=:w ORDER BY category,position"
                        ),
                        {"w": workspace},
                    )
                ).all()
            )
            epic = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace,
                        teamId=team,
                        title="Large goal",
                        issueType="EPIC",
                        statusId=statuses["BACKLOG"],
                    ),
                    user,
                    db,
                )
            )["data"]
            assert (
                epic["issueType"] == "EPIC" and epic["status"]["category"] == "BACKLOG"
            )
            child = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace,
                        teamId=team,
                        title="Child task",
                        parentIssueId=epic["id"],
                    ),
                    user,
                    db,
                )
            )["data"]
            changed = (
                await update_issue(
                    issue_id=epic["id"],
                    payload=UpdateIssueInput(
                        workspaceId=workspace, statusId=statuses["STARTED"]
                    ),
                    workspaceId=workspace,
                    user=user,
                    db=db,
                )
            )["data"]
            assert (
                changed["issueType"] == "EPIC"
                and changed["status"]["category"] == "STARTED"
            )
            await update_issue(
                issue_id=epic["id"],
                payload=UpdateIssueInput(workspaceId=workspace, issueType="TASK"),
                workspaceId=workspace,
                user=user,
                db=db,
            )
            await update_issue(
                issue_id=epic["id"],
                payload=UpdateIssueInput(workspaceId=workspace, issueType="EPIC"),
                workspaceId=workspace,
                user=user,
                db=db,
            )
            result = await search_page(
                db, workspace, user_id, "secret", {"issueType": "EPIC"}
            )
            assert [row["id"] for row in result["data"]] == [epic["id"]]
            assert (
                result["data"][0]["subIssueCount"] == 1
                and child["parentIssueId"] == epic["id"]
            )
            filtered = await search_page(
                db,
                workspace,
                user_id,
                "secret",
                {
                    "filters": json.dumps(
                        [
                            {
                                "columnId": "issueType",
                                "type": "option",
                                "operator": "is",
                                "values": ["EPIC"],
                            }
                        ]
                    )
                },
            )
            assert [row["id"] for row in filtered["data"]] == [epic["id"]]
            bug = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace,
                        teamId=team,
                        title="Original bug",
                        issueType="BUG",
                        severity="HIGH",
                        reproductionSteps="Keep these steps",
                    ),
                    user,
                    db,
                )
            )["data"]
            for kind in ["EPIC", "BUG"]:
                row = (
                    await update_issue(
                        issue_id=bug["id"],
                        payload=UpdateIssueInput(workspaceId=workspace, issueType=kind),
                        workspaceId=workspace,
                        user=user,
                        db=db,
                    )
                )["data"]
                assert (
                    row["issueType"] == kind
                    and row["severity"] == "HIGH"
                    and (row["reproductionSteps"] == "Keep these steps")
                )
            await db.rollback()
    finally:
        await engine.dispose()
