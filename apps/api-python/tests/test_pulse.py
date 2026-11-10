"""Pulse merges activities and project updates newest first, within what the viewer may see.
VI: Pulse gộp activity và project update, mới nhất trước, trong phạm vi người xem được thấy.
"""
import asyncio
import os
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.core.clock import utcnow
from app.core.identifiers import cuid
from app.modules.work_items.pulse_api import pulse
from tests.seeded_workspace import seeded_workspace

pytestmark = pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)


def test_pulse_merges_orders_and_hides_other_teams_issues():
    asyncio.run(verify())


async def verify():
    async with seeded_workspace() as (factory, workspace, member):
        async with factory() as db:
            seed, owner = await workspace(db)
            ws, team = seed["workspace_id"], seed["team_id"]
            # In the workspace but not in its only team.
            # VI: Ở trong workspace nhưng không ở trong team duy nhất của nó.
            outsider = await member(db, ws, name="Outsider")
            now = utcnow()
            status = (await db.execute(
                text("SELECT id FROM issue_statuses WHERE workspace_id=:ws ORDER BY position LIMIT 1"), {"ws": ws}
            )).scalar_one()
            issue, project = cuid(), cuid()
            await db.execute(
                text("""INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,created_at,updated_at)
                VALUES (:id,:ws,:team,:status,'PUL-1',1,'Team only',:user,:now,:now)"""),
                {"id": issue, "ws": ws, "team": team, "status": status, "user": owner["id"], "now": now},
            )
            await db.execute(
                text("INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:ws,'Open project','OPN',:now,:now)"),
                {"id": project, "ws": ws, "now": now},
            )
            activities = [
                (issue, None, "issue.created", now - timedelta(minutes=30)),
                (None, project, "project.created", now - timedelta(minutes=20)),
            ]
            for issue_id, project_id, kind, at in activities:
                await db.execute(
                    text("""INSERT INTO activities(id,workspace_id,issue_id,project_id,actor_id,type,created_at)
                    VALUES (:id,:ws,:issue,:project,:user,:type,:at)"""),
                    {"id": cuid(), "ws": ws, "issue": issue_id, "project": project_id,
                     "user": owner["id"], "type": kind, "at": at},
                )
            update = cuid()
            await db.execute(
                text("""INSERT INTO project_updates(id,workspace_id,project_id,author_id,body,health,created_at,updated_at)
                VALUES (:id,:ws,:project,:user,'On track',:health,:at,:at)"""),
                {"id": update, "ws": ws, "project": project, "user": owner["id"],
                 "health": "on-track", "at": now - timedelta(minutes=10)},
            )
            await db.commit()

            seen = (await pulse(ws, 100, owner, db))["data"]
            assert [item["kind"] for item in seen] == ["project-update", "activity", "activity"]
            assert seen[0]["id"] == f"project-update:{update}" and seen[0]["health"] == "on-track"
            assert seen[1]["entity"] == {"type": "project", "id": project, "label": "Open project"}
            assert seen[2]["entity"]["id"] == issue
            assert seen[2]["title"].endswith("created an issue")

            # Someone outside the team sees the project but not the team's issue.
            # VI: Người ngoài team thấy project nhưng không thấy issue của team.
            hidden = (await pulse(ws, 100, outsider, db))["data"]
            assert [item["entity"]["type"] for item in hidden] == ["project", "project"]
            assert (await pulse(ws, 1, owner, db))["data"][0]["kind"] == "project-update"
