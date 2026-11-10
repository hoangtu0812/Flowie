import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.native_asks import (
    AskTransitionInput,
    CreateAskInput,
    UpdateAskInput,
    archive_ask,
    convert_ask,
    create_ask,
    list_asks,
    list_service_desk_projects,
    ticket_status,
    transition_ask,
    update_ask,
)
from app.modules.portfolio.projects_api import UpdateProjectInput, update_project
from tests.document_review_support import add_member


@pytest.mark.parametrize(
    "ask_status,category,expected",
    [
        ("open", None, "received"),
        ("accepted", None, "received"),
        ("accepted", "TRIAGE", "received"),
        ("accepted", "BACKLOG", "received"),
        ("accepted", "UNSTARTED", "received"),
        ("accepted", "STARTED", "in_progress"),
        ("accepted", "COMPLETED", "done"),
        ("accepted", "CANCELED", "canceled"),
        ("declined", None, "declined"),
        ("declined", "STARTED", "declined"),
        ("resolved", None, "done"),
        ("resolved", "STARTED", "done"),
        ("canceled", None, "canceled"),
    ],
)
def test_ticket_status_labels(ask_status, category, expected):
    assert ticket_status(ask_status, category) == expected


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_service_desk_intake_keeps_requesters_away_from_issues():
    asyncio.run(verify_intake())


async def forbidden(call):
    with pytest.raises(ApiError) as error:
        await call
    assert error.value.status_code == 403


async def add_project(db, workspace, team, *, enabled):
    project_id = _cuid()
    await db.execute(
        text(
            """INSERT INTO projects(id,workspace_id,team_id,name,identifier,slug,service_desk_enabled,created_at,updated_at)
            VALUES (:id,:workspace,:team,:name,:identifier,:slug,:enabled,:now,:now)"""
        ),
        {
            "id": project_id,
            "workspace": workspace,
            "team": team,
            "name": "Project " + project_id[-6:],
            "identifier": project_id[-6:].upper(),
            "slug": project_id[-12:],
            "enabled": enabled,
            "now": _utcnow(),
        },
    )
    await db.commit()
    return project_id


async def verify_intake():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            now = _utcnow()
            owner = {"id": _cuid(), "name": "Owner"}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**owner, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=owner["id"], organization_name="Desk", workspace_name=_cuid(), now=now
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            handler = await add_member(db, workspace, team, name="Handler")
            requester = await add_member(db, workspace, None, name="Requester")
            other = await add_member(db, workspace, None, name="Other")
            stranger = {"id": _cuid(), "name": "Stranger"}
            await db.commit()

            enabled = await add_project(db, workspace, team, enabled=True)
            closed = await add_project(db, workspace, team, enabled=False)
            teamless = await add_project(db, workspace, None, enabled=False)

            listed = (await list_service_desk_projects(workspace, requester, db))["data"]
            assert [row["id"] for row in listed] == [enabled]
            assert set(listed[0]) == {"id", "name", "teamId"}
            await forbidden(list_service_desk_projects(workspace, stranger, db))

            ticket = CreateAskInput(workspaceId=workspace, teamId=team, projectId=enabled, title="Cannot sign in")
            created = (await create_ask(ticket, requester, db))["data"]
            assert created["ticketStatus"] == "received"
            ask_id = created["id"]

            await forbidden(create_ask(ticket, stranger, db))
            await forbidden(create_ask(ticket.model_copy(update={"projectId": closed}), requester, db))
            await forbidden(create_ask(ticket.model_copy(update={"projectId": None}), requester, db))
            handled = (await create_ask(ticket.model_copy(update={"projectId": closed}), handler, db))["data"]
            assert handled["projectId"] == closed

            assert [row["id"] for row in (await list_asks(workspace, "mine", requester, db))["data"]] == [ask_id]
            assert (await list_asks(workspace, "mine", other, db))["data"] == []
            assert (await list_asks(workspace, "team", requester, db))["data"] == []
            team_view = {row["id"] for row in (await list_asks(workspace, "team", handler, db))["data"]}
            assert team_view == {ask_id, handled["id"]}

            # A requester rewords a ticket but leaves every decision to the team.
            # VI: Người yêu cầu sửa được nội dung ticket nhưng mọi quyết định thuộc về team.
            updated = await update_ask(ask_id, UpdateAskInput(title="Cannot sign in on mobile"), workspace, requester, db)
            assert updated["data"]["title"] == "Cannot sign in on mobile"
            await forbidden(transition_ask(ask_id, AskTransitionInput(action="decline", message="No"), workspace, requester, db))
            await forbidden(update_ask(ask_id, UpdateAskInput(title="Taken over"), workspace, other, db))
            await forbidden(convert_ask(ask_id, workspace, requester, db))
            await forbidden(convert_ask(ask_id, workspace, other, db))
            await forbidden(archive_ask(ask_id, workspace, other, db))

            declined = await transition_ask(handled["id"], AskTransitionInput(action="decline", message="Out of scope"), workspace, owner, db)
            assert declined["data"]["ticketStatus"] == "declined"

            converted = (await convert_ask(ask_id, workspace, handler, db))["data"]
            assert converted["status"] == "accepted" and converted["convertedIssue"]
            assert converted["ticketStatus"] == "received"

            # Re-converting returns the issue, so the idempotent path must stay closed to requesters.
            # VI: Chuyển lại sẽ trả về Issue, nên nhánh idempotent phải đóng với người yêu cầu.
            await forbidden(convert_ask(ask_id, workspace, requester, db))

            issue_id = converted["convertedIssueId"]
            for category, expected in (("STARTED", "in_progress"), ("COMPLETED", "done"), ("CANCELED", "canceled")):
                await db.execute(
                    text(
                        """UPDATE issues SET status_id = (SELECT id FROM issue_statuses WHERE workspace_id = :workspace
                        AND category = CAST(:category AS "IssueStatusCategory") ORDER BY position LIMIT 1) WHERE id = :id"""
                    ),
                    {"workspace": workspace, "category": category, "id": issue_id},
                )
                await db.commit()
                mine = (await list_asks(workspace, "mine", requester, db))["data"][0]
                assert mine["ticketStatus"] == expected
                assert "convertedIssue" not in mine and "convertedIssueId" not in mine

            await db.execute(text("UPDATE projects SET service_desk_enabled = false WHERE id = :id"), {"id": enabled})
            await db.commit()
            assert len((await list_asks(workspace, "mine", requester, db))["data"]) == 1

            enable = UpdateProjectInput(serviceDeskEnabled=True)
            result = await update_project(closed, enable, workspace, handler, db)
            assert result["data"]["serviceDeskEnabled"] is True
            with pytest.raises(ApiError) as error:
                await update_project(teamless, enable, workspace, owner, db)
            assert error.value.status_code == 400

            await forbidden(archive_ask(ask_id, workspace, requester, db))
            await archive_ask(ask_id, workspace, handler, db)
            assert (await list_asks(workspace, "mine", requester, db))["data"] == []
    finally:
        await engine.dispose()
