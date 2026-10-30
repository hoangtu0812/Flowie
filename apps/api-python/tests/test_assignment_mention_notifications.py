import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.comments import create_comment, update_comment
from app.modules.work_items.contracts import (
    CommentInput,
    CreateCommentInput,
    CreateIssueInput,
    UpdateIssueInput,
)
from app.modules.work_items.issues import create_issue, update_issue
from app.services import notification_events

WORKSPACE_HOOK = "https://prod-01.westus.logic.azure.com/workflows/workspace/triggers/manual/paths/invoke"
PROJECT_HOOK = "https://prod-01.westus.logic.azure.com/workflows/project/triggers/manual/paths/invoke"


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_assignments_and_mentions_reach_people_who_can_read_the_issue(monkeypatch):
    monkeypatch.setattr(notification_events, "teams_available", lambda settings=None: True)
    asyncio.run(verify_assignment_and_mention_notifications())


async def verify_assignment_and_mention_notifications():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            people = {
                name: {"id": _cuid(), "name": name, "avatar_url": None}
                for name in ["Owner", "Bao", "Outsider", "Quiet", "Local"]
            }
            for person in people.values():
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                    ),
                    {**person, "email": person["id"] + "@example.test", "now": now},
                )
            owner = people["Owner"]
            seed = await create_workspace_bootstrap(
                db, user_id=owner["id"], organization_name="Mentions", workspace_name=_cuid(), now=now
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            for name, person in people.items():
                if name == "Owner":
                    continue
                await db.execute(
                    text(
                        "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,'MEMBER','ACTIVE',:now,:now)"
                    ),
                    {"id": _cuid(), "workspace": workspace, "user": person["id"], "now": now},
                )
                if name != "Outsider":
                    await db.execute(
                        text("INSERT INTO team_members(team_id,user_id) VALUES (:team,:user)"),
                        {"team": team, "user": person["id"]},
                    )
                if name != "Local":
                    await db.execute(
                        text(
                            "INSERT INTO user_identities(id,user_id,provider,provider_account_id,created_at,updated_at) VALUES (:id,:user,'MICROSOFT',:account,:now,:now)"
                        ),
                        {"id": _cuid(), "user": person["id"], "account": f"tenant:oid-{name.lower()}", "now": now},
                    )
            await db.execute(
                text(
                    "INSERT INTO notification_preferences(workspace_id,user_id,teams_enabled,created_at,updated_at) VALUES (:workspace,:user,false,:now,:now)"
                ),
                {"workspace": workspace, "user": people["Quiet"]["id"], "now": now},
            )
            await db.execute(
                text(
                    "INSERT INTO teams_webhooks(id,workspace_id,webhook_url,enabled,created_at,updated_at) VALUES (:id,:workspace,:url,true,:now,:now)"
                ),
                {"id": _cuid(), "workspace": workspace, "url": WORKSPACE_HOOK, "now": now},
            )

            async def cards():
                rows = await db.execute(
                    text(
                        "SELECT payload FROM notification_outbox WHERE workspace_id=:workspace ORDER BY created_at,id"
                    ),
                    {"workspace": workspace},
                )
                found = [card for (payload,) in rows for card in payload.get("teams_cards", [])]
                await db.execute(
                    text("DELETE FROM notification_outbox WHERE workspace_id=:workspace"),
                    {"workspace": workspace},
                )
                return found

            def mentioned(card):
                return sorted(
                    entity["mentioned"]["id"]
                    for entity in card["message"]["attachments"][0]["content"]["msteams"]["entities"]
                )

            async def inbox(person, event):
                return (
                    await db.execute(
                        text("SELECT count(*) FROM notifications WHERE user_id=:user AND type=:type"),
                        {"user": people[person]["id"], "type": event},
                    )
                ).scalar_one()

            # Assigning someone else: Inbox plus a workspace-channel card that @mentions them.
            issue = (
                await create_issue(
                    CreateIssueInput(
                        workspaceId=workspace, teamId=team, title="Mention work", assigneeId=people["Bao"]["id"]
                    ),
                    owner,
                    db,
                )
            )["data"]
            assert issue["reporter"]["id"] == owner["id"]
            assert await inbox("Bao", "issue.assignment") == 1
            (card,) = await cards()
            assert card["url"] == WORKSPACE_HOOK and mentioned(card) == ["oid-bao"]

            # A project channel wins over the workspace channel.
            project = _cuid()
            await db.execute(
                text("INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Mentions','MEN',:now,:now)"),
                {"id": project, "workspace": workspace, "now": now},
            )
            await db.execute(
                text(
                    "INSERT INTO project_teams_channels(id,project_id,webhook_url,enabled,created_at,updated_at) VALUES (:id,:project,:url,true,:now,:now)"
                ),
                {"id": _cuid(), "project": project, "url": PROJECT_HOOK, "now": now},
            )
            await db.execute(
                text("UPDATE issues SET project_id=:project WHERE id=:id"), {"project": project, "id": issue["id"]}
            )

            # Self-assignment, an outsider who cannot read the issue and a person who turned Teams
            # off produce no card; the last still gets the Inbox row.
            for assignee in ["Owner", "Outsider", "Quiet"]:
                await update_issue(issue["id"], UpdateIssueInput(assigneeId=people[assignee]["id"]), workspace, owner, db)
            assert await cards() == []
            assert await inbox("Owner", "issue.assignment") == 0
            assert await inbox("Outsider", "issue.assignment") == 0
            assert await inbox("Quiet", "issue.assignment") == 1

            # Comment mentions: one project-channel card for everyone reachable on Teams.
            comment = (
                await create_comment(
                    CreateCommentInput(
                        workspaceId=workspace, issueId=issue["id"], content="Please check",
                        mentionIds=[people["Bao"]["id"], people["Owner"]["id"], people["Local"]["id"]],
                    ),
                    owner,
                    db,
                )
            )["data"]
            (card,) = await cards()
            assert card["url"] == PROJECT_HOOK and mentioned(card) == ["oid-bao"]
            assert await inbox("Local", "issue.comment_mention") == 1
            assert await inbox("Owner", "issue.comment_mention") == 0

            # Editing without new mentions repeats nothing; adding one notifies only that person.
            await update_comment(comment["id"], CommentInput(content="Please check again"), workspace, owner, db)
            assert await cards() == []
            assert await inbox("Bao", "issue.comment_mention") == 1
            await update_comment(
                comment["id"],
                CommentInput(content="Quiet too", mentionIds=[people["Bao"]["id"], people["Quiet"]["id"]]),
                workspace,
                owner,
                db,
            )
            assert await cards() == []
            assert await inbox("Bao", "issue.comment_mention") == 1
            assert await inbox("Quiet", "issue.comment_mention") == 1

            # The reporter can be changed and reset to the creator with null.
            changed = (
                await update_issue(issue["id"], UpdateIssueInput(reporterId=people["Bao"]["id"]), workspace, owner, db)
            )["data"]
            assert changed["reporter"]["id"] == people["Bao"]["id"]
            reset = (await update_issue(issue["id"], UpdateIssueInput(reporterId=None), workspace, owner, db))["data"]
            assert reset["reporter"]["id"] == owner["id"]
            await db.rollback()
    finally:
        await engine.dispose()
