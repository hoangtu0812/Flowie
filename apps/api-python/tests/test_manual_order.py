import asyncio
import os
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.portfolio.projects import project_page
from app.modules.work_items.issue_search import search_page
from app.modules.work_items.manual_order import ReorderInput, reorder


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_manual_order_scope_conflicts_and_pagination():
    asyncio.run(verify_order())


async def verify_order():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    owner, reader = _cuid(), _cuid()
    workspace = None
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            for user in [owner, reader]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Order user',:email,'ACTIVE',:now,:now)"
                    ),
                    {"id": user, "email": _cuid() + "@example.test", "now": now},
                )
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner,
                organization_name="Order",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.execute(
                text(
                    "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:w,:u,'MEMBER','ACTIVE',:now,:now)"
                ),
                {"id": _cuid(), "w": workspace, "u": reader, "now": now},
            )
            status = (
                await db.execute(
                    text(
                        "SELECT id FROM issue_statuses WHERE workspace_id=:w ORDER BY position LIMIT 1"
                    ),
                    {"w": workspace},
                )
            ).scalar_one()
            issues = [_cuid() for _ in range(105)]
            for index, identifier in enumerate(issues):
                await db.execute(
                    text("""INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,manual_order,created_at,updated_at)
                  VALUES (:id,:w,:team,:status,:ref,:number,:title,:u,:rank,:now,:now)"""),
                    {
                        "id": identifier,
                        "w": workspace,
                        "team": team,
                        "status": status,
                        "ref": f"ORD-{index}",
                        "number": index + 1,
                        "title": f"Queue {index}",
                        "u": owner,
                        "rank": (index + 1) * 1024,
                        "now": now + timedelta(seconds=index),
                    },
                )
            projects = [_cuid() for _ in range(3)]
            for index, identifier in enumerate(projects):
                await db.execute(
                    text(
                        "INSERT INTO projects(id,workspace_id,team_id,name,identifier,manual_order,created_at,updated_at) VALUES (:id,:w,:team,:id,:id,:rank,:now,:now)"
                    ),
                    {
                        "id": identifier,
                        "w": workspace,
                        "team": team,
                        "rank": (index + 1) * 1024,
                        "now": now,
                    },
                )
            child = _cuid()
            await db.execute(
                text("""INSERT INTO issues(id,workspace_id,team_id,parent_issue_id,status_id,identifier,number,title,creator_id,created_at,updated_at)
                VALUES (:id,:w,:team,:parent,:status,'ORD-child',106,'Child',:u,:now,:now)"""),
                {
                    "id": child,
                    "w": workspace,
                    "team": team,
                    "parent": issues[0],
                    "status": status,
                    "u": owner,
                    "now": now,
                },
            )
            await db.commit()
            options = {"limit": 100, "ordering": "manual", "query": "Queue"}
            page = await search_page(db, workspace, owner, "order-secret", options)
            more = await search_page(
                db,
                workspace,
                owner,
                "order-secret",
                {**options, "cursor": page["meta"]["nextCursor"]},
            )
            assert [row["id"] for row in page["data"] + more["data"]] == issues
            assert page["meta"]["total"] == 105 and len(more["data"]) == 5

            def payload(
                source, target, rank, target_rank, entity="issue", placement="before"
            ):
                return ReorderInput(
                    workspaceId=workspace,
                    entityType=entity,
                    sourceId=source,
                    targetId=target,
                    expectedOrder=str(rank),
                    expectedTargetOrder=str(target_rank),
                    placement=placement,
                )

            request = payload(issues[-1], issues[0], 105 * 1024, 1024)
            with pytest.raises(ApiError) as caught:
                await reorder(request, {"id": reader}, db)
            assert caught.value.status_code == 404
            await reorder(request, {"id": owner}, db)
            reordered = await search_page(db, workspace, owner, "order-secret", options)
            assert reordered["data"][0]["id"] == issues[-1]
            assert reordered["data"][1]["id"] == issues[0]
            with pytest.raises(ApiError) as caught:
                await reorder(request, {"id": owner}, db)
            assert caught.value.status_code == 409
            with pytest.raises(ApiError) as caught:
                await search_page(
                    db,
                    workspace,
                    owner,
                    "order-secret",
                    {**options, "cursor": page["meta"]["nextCursor"]},
                )
            assert caught.value.status_code == 409
            with pytest.raises(ApiError) as caught:
                await reorder(payload(child, issues[0], 0, 2048), {"id": owner}, db)
            assert caught.value.status_code == 400
            with pytest.raises(ApiError) as caught:
                await reorder(
                    payload(issues[0], issues[0], 2048, 2048), {"id": owner}, db
                )
            assert caught.value.status_code == 400
            await reorder(
                payload(projects[2], projects[0], 3072, 1024, entity="project"),
                {"id": owner},
                db,
            )
            project_list = await project_page(
                db, workspace, owner, "order-secret", ordering="manual", limit=2
            )
            project_more = await project_page(
                db,
                workspace,
                owner,
                "order-secret",
                ordering="manual",
                limit=2,
                cursor=project_list["meta"]["nextCursor"],
            )
            assert [
                row["id"] for row in project_list["data"] + project_more["data"]
            ] == [projects[2], projects[0], projects[1]]
            with pytest.raises(ApiError):
                await project_page(
                    db,
                    workspace,
                    owner,
                    "other-secret",
                    ordering="manual",
                    cursor=project_list["meta"]["nextCursor"],
                )
            unchanged = (
                (
                    await db.execute(
                        text(
                            "SELECT parent_issue_id,team_id,status_id FROM issues WHERE id=:id"
                        ),
                        {"id": issues[-1]},
                    )
                )
                .mappings()
                .one()
            )
            assert (
                unchanged["parent_issue_id"] is None
                and unchanged["team_id"] == team
                and unchanged["status_id"] == status
            )
            assert (
                await db.execute(
                    text("SELECT parent_issue_id FROM issues WHERE id=:id"),
                    {"id": child},
                )
            ).scalar_one() == issues[0]
    finally:
        if workspace:
            async with async_sessionmaker(engine)() as cleanup:
                await cleanup.execute(
                    text("DELETE FROM workspaces WHERE id=:id"), {"id": workspace}
                )
                await cleanup.execute(
                    text("DELETE FROM organizations WHERE owner_id=:id"), {"id": owner}
                )
                await cleanup.execute(
                    text("DELETE FROM users WHERE id=ANY(CAST(:ids AS text[]))"),
                    {"ids": [owner, reader]},
                )
                await cleanup.commit()
        await engine.dispose()
