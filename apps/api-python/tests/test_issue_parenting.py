import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.native_issues import list_sub_issues
from app.modules.work_items.contracts import CreateIssueInput, UpdateIssueInput
from app.modules.work_items.issues import create_issue, update_issue


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_issue_parent_can_be_set_moved_and_removed_without_cycles():
    asyncio.run(verify_issue_parenting())


async def verify_issue_parenting():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = _utcnow()
    owner = {"id": _cuid(), "name": "Owner"}
    outsider = {"id": _cuid(), "name": "Workspace member outside the team"}
    async with factory() as db:
        for user in (owner, outsider):
            await db.execute(
                text("""INSERT INTO users(id,name,email,status,created_at,updated_at)
                        VALUES (:id,:name,:email,'ACTIVE',:now,:now)"""),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
        seed = await create_workspace_bootstrap(
            db, user_id=owner["id"], organization_name="Parenting",
            workspace_name=_cuid(), now=now,
        )
        workspace, team = seed["workspace_id"], seed["team_id"]
        other_team = _cuid()
        await db.execute(
            text("""INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at)
                    VALUES (:id,:workspace,:user,'MEMBER','ACTIVE',:now,:now)"""),
            {"id": _cuid(), "workspace": workspace, "user": outsider["id"], "now": now},
        )
        await db.execute(
            text("""INSERT INTO teams (id,workspace_id,name,identifier,created_at,updated_at)
                    VALUES (:id,:workspace,'Other','OTHER',:now,:now)"""),
            {"id": other_team, "workspace": workspace, "now": now},
        )
        await db.execute(
            text("INSERT INTO team_members(team_id,user_id,created_at) VALUES (:team,:user,:now)"),
            {"team": other_team, "user": owner["id"], "now": now},
        )

        async def new_issue(title, team_id=team, parent=None):
            return (await create_issue(
                CreateIssueInput(workspaceId=workspace, teamId=team_id, title=title,
                                 parentIssueId=parent),
                owner, db,
            ))["data"]

        async def set_parent(issue, parent, user=owner, session=db):
            return (await update_issue(
                issue["id"], UpdateIssueInput(parentIssueId=parent), workspace, user, session
            ))["data"]

        async def parent_of(issue, session=db):
            return (await session.execute(
                text("SELECT parent_issue_id FROM issues WHERE id=:id"), {"id": issue["id"]}
            )).scalar_one()

        async def children(issue):
            return [row["id"] for row in (await list_sub_issues(issue["id"], workspace, owner, db))["data"]]

        async def rejected(status, issue, parent, user=owner):
            with pytest.raises(ApiError) as error:
                await set_parent(issue, parent, user)
            assert error.value.status_code == status
            return error.value

        try:
            a, b, d = await new_issue("Task A"), await new_issue("Task B"), await new_issue("Task D")
            c = await new_issue("Task C", parent=b["id"])
            other = await new_issue("Other team", team_id=other_team)
            archived = await new_issue("Archived")
            await db.execute(
                text("UPDATE issues SET archived_at=:now WHERE id=:id"),
                {"now": now, "id": archived["id"]},
            )

            # Attach an existing issue: A → B → C, and the row reports its parent.
            attached = await set_parent(b, a["id"])
            assert attached["parent"] == {"id": a["id"], "identifier": a["identifier"], "title": "Task A"}
            assert await children(a) == [b["id"]] and await children(b) == [c["id"]]

            # Moving B keeps its subtree and updates both parents' lists.
            await set_parent(b, d["id"])
            assert await children(a) == [] and await children(d) == [b["id"]]
            assert await parent_of(c) == b["id"]
            change = (await db.execute(
                text("""SELECT data->'changes' FROM activities WHERE issue_id=:id
                        AND type='issue.updated' ORDER BY created_at DESC LIMIT 1"""),
                {"id": b["id"]},
            )).scalar_one()
            assert {"field": "Parent", "change": f"{a['identifier']} → {d['identifier']}"} in change

            # Rejections leave the hierarchy untouched.
            assert "own parent" in (await rejected(400, a, a["id"])).message
            assert "own sub-issue" in (await rejected(400, d, c["id"])).message
            for parent in (other["id"], archived["id"], "missing-issue"):
                await rejected(404, b, parent)
            await rejected(404, b, a["id"], user=outsider)
            assert await parent_of(b) == d["id"] and await parent_of(d) is None

            # Removing the parent makes B a root issue that keeps C.
            removed = await set_parent(b, None)
            assert removed["parent"] is None and await parent_of(c) == b["id"]
            await db.commit()

            # The trigger guards writes that bypass the API.
            with pytest.raises(DBAPIError):
                await db.execute(
                    text("UPDATE issues SET parent_issue_id=:c WHERE id=:b"),
                    {"c": c["id"], "b": b["id"]},
                )
            await db.rollback()

            # Two concurrent opposite moves: the second waits for the first and is rejected.
            p, q = await new_issue("Task P"), await new_issue("Task Q")
            await db.commit()
            async with factory() as first, factory() as second:
                await set_parent(p, q["id"], session=first)
                racing = asyncio.create_task(set_parent(q, p["id"], session=second))
                await asyncio.sleep(0.5)
                assert not racing.done()
                await first.commit()
                with pytest.raises(ApiError) as error:
                    await racing
                assert error.value.status_code == 400
                await second.rollback()
            assert await parent_of(p) == q["id"] and await parent_of(q) is None
        finally:
            await db.rollback()
            await db.execute(text("DELETE FROM workspaces WHERE id=:id"), {"id": workspace})
            await db.execute(
                text("DELETE FROM organizations WHERE id=:id"), {"id": seed["organization_id"]}
            )
            await db.execute(
                text("DELETE FROM users WHERE id = ANY(CAST(:ids AS text[]))"),
                {"ids": [owner["id"], outsider["id"]]},
            )
            await db.commit()
            await engine.dispose()
