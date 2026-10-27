import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.contracts import CreateIssueInput, UpdateIssueInput
from app.modules.work_items.issues import create_issue, update_issue
from app.modules.work_items.workflow_statuses import mutate_status, statuses


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_work_starts_only_from_the_reviewed_status_with_an_end_date():
    asyncio.run(verify_start_gate())


async def verify_start_gate():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            user = {"id": _cuid(), "name": "Gate owner"}
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user["id"],
                organization_name="Gate",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            rows = await statuses(db, workspace, user)
            by_name = {row["name"]: row["id"] for row in rows}
            todo, started = by_name["Todo"], by_name["In Progress"]

            async def create(status, **values):
                return (
                    await create_issue(
                        CreateIssueInput(
                            workspaceId=workspace,
                            teamId=team,
                            title="Gated work",
                            statusId=status,
                            **values,
                        ),
                        user,
                        db,
                    )
                )["data"]["id"]

            async def move(issue, **values):
                await update_issue(
                    issue, UpdateIssueInput(**values), workspace, user, db
                )

            async def rejected(action):
                with pytest.raises(ApiError) as error:
                    await action
                return error.value.status_code

            # Without a gate status the workflow stays free.
            free = await create(todo)
            await move(free, statusId=started)

            gate = {"name": "Ready", "category": "UNSTARTED", "color": "#123456", "position": 5}
            assert await rejected(
                mutate_status(
                    db,
                    workspace,
                    user,
                    {**gate, "category": "STARTED", "requiredBeforeStart": True},
                )
            ) == 400
            ready = await mutate_status(
                db, workspace, user, {**gate, "requiredBeforeStart": True}
            )
            assert next(
                row for row in await statuses(db, workspace, user) if row["id"] == ready
            )["requiredBeforeStart"]

            assert await rejected(create(started, targetDate="2026-11-05")) == 409
            issue = await create(todo, targetDate="2026-11-05")
            assert await rejected(move(issue, statusId=started)) == 409
            await move(issue, statusId=ready, targetDate=None)
            assert await rejected(move(issue, statusId=started)) == 409
            await move(issue, statusId=started, targetDate="2026-11-05")
            # Moving between STARTED statuses is not a new start.
            await move(issue, statusId=by_name["Technical Review"])
            await move(free, statusId=by_name["Blocked"])
            await db.rollback()
    finally:
        await engine.dispose()
