"""Worklogs: who may log and edit, actual effort from hours, and the weekly timesheet scope.
VI: Worklog: ai được ghi và sửa, actual effort tính từ số giờ, và phạm vi của timesheet tuần.
"""
import asyncio
import os
from datetime import timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import text

from app.core.clock import utcnow
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.worklogs import api, service
from app.modules.worklogs.service import WorklogInput
from tests.seeded_workspace import seeded_workspace

pytestmark = pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)


def test_worklog_input_rejects_non_quarter_hours_and_blank_notes():
    with pytest.raises(ValidationError):
        WorklogInput(workspaceId="w", workDate="2026-11-17", hours=1.1)
    with pytest.raises(ValidationError):
        WorklogInput(workspaceId="w", workDate="2026-11-17", hours=25)
    assert WorklogInput(workspaceId="w", workDate="2026-11-17", hours=1.25, note="  ").note is None


def test_week_bounds_start_on_monday():
    start, end = service.week_bounds(utcnow().date().replace(year=2026, month=11, day=19))
    assert (start.isoformat(), end.isoformat()) == ("2026-11-16", "2026-11-23")


def test_worklogs_permissions_effort_and_timesheet():
    asyncio.run(verify())


async def verify():
    async with seeded_workspace() as (factory, workspace, member):
        async with factory() as db:
            seed, owner = await workspace(db)
            ws, team = seed["workspace_id"], seed["team_id"]
            teammate = await member(db, ws, team=team, name="Teammate")
            # In the workspace but outside its only team, so the issue is invisible to them.
            # VI: Ở trong workspace nhưng ngoài team duy nhất, nên không thấy issue.
            outsider = await member(db, ws, name="Outsider")
            status = (await db.execute(
                text("SELECT id FROM issue_statuses WHERE workspace_id=:ws ORDER BY position LIMIT 1"), {"ws": ws}
            )).scalar_one()
            issue, now = cuid(), utcnow()
            await db.execute(
                text("""INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,created_at,updated_at)
                VALUES (:id,:ws,:team,:status,'WRK-1',1,'Worklog fixture',:user,:now,:now)"""),
                {"id": issue, "ws": ws, "team": team, "status": status, "user": owner["id"], "now": now},
            )
            await db.commit()

            today = now.date()
            log = await service.create_worklog(
                db, issue, WorklogInput(workspaceId=ws, workDate=today, hours=6, note="Build"), teammate["id"]
            )
            await db.commit()
            assert log["totalHours"] == 6 and log["actualEffort"] == 0.75
            assert log["items"][0]["canEdit"] is True and log["items"][0]["user"]["name"] == "Teammate"
            entry = log["items"][0]["id"]

            log = await service.create_worklog(
                db, issue, WorklogInput(workspaceId=ws, workDate=today, hours=2), owner["id"]
            )
            await db.commit()
            assert log["totalHours"] == 8 and log["actualEffort"] == 1

            # The teammate sees the owner's entry but may not change it; the owner may change theirs.
            # VI: Teammate thấy bản ghi của owner nhưng không sửa được; owner sửa được bản ghi của teammate.
            seen = await service.list_worklogs(db, issue, ws, teammate["id"])
            other = next(item for item in seen["items"] if item["user"]["id"] == owner["id"])
            assert other["canEdit"] is False
            with pytest.raises(ApiError) as denied:
                await service.delete_worklog(db, issue, other["id"], ws, teammate["id"])
            assert denied.value.status_code == 403
            await db.rollback()

            log = await service.update_worklog(
                db, issue, entry, WorklogInput(workspaceId=ws, workDate=today, hours=4), owner["id"]
            )
            await db.commit()
            assert log["totalHours"] == 6 and log["actualEffort"] == 0.75

            with pytest.raises(ApiError) as hidden:
                await service.create_worklog(
                    db, issue, WorklogInput(workspaceId=ws, workDate=today, hours=1), outsider["id"]
                )
            assert hidden.value.status_code == 404
            await db.rollback()

            with pytest.raises(ApiError) as future:
                await service.create_worklog(
                    db, issue, WorklogInput(workspaceId=ws, workDate=today + timedelta(days=3), hours=1), owner["id"]
                )
            assert future.value.status_code == 400
            await db.rollback()

            sheet = await service.timesheet(db, ws, owner["id"], today)
            column = sheet["days"].index(today.isoformat())
            assert sheet["total"] == 6 and sheet["totals"][column] == 6
            assert {person["user"]["name"]: person["total"] for person in sheet["people"]} == {"Owner": 2, "Teammate": 4}
            assert (await service.timesheet(db, ws, outsider["id"], today))["people"] == []
            assert (await service.timesheet(db, ws, owner["id"], today, project_id=cuid()))["total"] == 0

            _, rows = await service.timesheet_entries(db, ws, owner["id"], today)
            assert sorted(row[6] for row in rows) == [2, 4] and rows[0][3] == "WRK-1"
            for format, magic in (("xlsx", b"PK"), ("csv", b"\xef\xbb\xbf")):
                download = await api.export_timesheet(
                    workspaceId=ws, format=format, weekStart=today, teamId=None, projectId=None, user=owner, db=db
                )
                assert bytes(download.body).startswith(magic)
                assert f"flowie-timesheet-{sheet['weekStart']}.{format}" in download.headers["content-disposition"]

            for item in (await service.list_worklogs(db, issue, ws, owner["id"]))["items"]:
                log = await service.delete_worklog(db, issue, item["id"], ws, owner["id"])
            await db.commit()
            assert log["items"] == [] and log["actualEffort"] is None
