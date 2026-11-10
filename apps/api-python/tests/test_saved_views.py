import asyncio
import json
import os
from datetime import timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.views.api import (
    CreateViewInput,
    UpdateViewInput,
    create_view,
    delete_view,
    get_view,
    list_views,
    update_view,
)
from app.modules.work_items.issue_search import search_page
from app.modules.work_items.saved_view_config import issue_view_config


def test_legacy_views_preserve_their_filter_meaning():
    config = issue_view_config(
        {
            "teamId": "team",
            "statusCategories": ["started"],
            "priorityIds": ["high"],
            "unassigned": True,
            "hasProject": True,
        }
    )
    assert config["teamId"] == "team"
    assert config["query"]["categories"] == ["started"]
    assert config["query"]["filters"] == [
        {
            "columnId": "priority",
            "type": "option",
            "operator": "is any of",
            "values": ["high"],
        },
        {
            "columnId": "assignee",
            "type": "option",
            "operator": "is",
            "values": ["unassigned"],
        },
        {"columnId": "project", "type": "option", "operator": "is not", "values": [""]},
    ]
    assert issue_view_config({})["query"]["filters"] == []


@pytest.mark.parametrize(
    "config",
    [
        [],
        None,
        {"version": 1.0},
        {"daysOverdue": 3},
        {"version": 2, "query": {}},
        {"version": True, "query": {}},
        {"version": 1, "query": {"scope": "assigned"}},
        {"version": 1, "query": {"cursor": "x"}},
        {"version": 1, "teamId": "team", "query": {"noTeam": True}},
        {"statusIds": "bad"},
        {"unassigned": "true"},
        {
            "version": 1,
            "query": {
                "filters": [
                    {
                        "columnId": "status",
                        "type": "option",
                        "operator": "contains",
                        "values": ["x"],
                    }
                ]
            },
        },
        {
            "version": 1,
            "query": {
                "filters": [
                    {
                        "columnId": "unknown",
                        "type": "option",
                        "operator": "is",
                        "values": ["x"],
                    }
                ]
            },
        },
        {
            "version": 1,
            "query": {
                "filters": [
                    {
                        "columnId": "priority",
                        "type": "option",
                        "operator": "is",
                        "values": [],
                    }
                ]
            },
        },
        {
            "version": 1,
            "query": {
                "filters": [
                    {
                        "columnId": "priority",
                        "type": "option",
                        "operator": "is",
                        "values": ["x" * 101],
                    }
                ]
            },
        },
    ],
)
def test_invalid_configs_never_silently_drop_conditions(config):
    with pytest.raises(ApiError) as caught:
        issue_view_config(config)
    assert caught.value.status_code == 400


def test_view_names_are_validated_after_trimming():
    with pytest.raises(ValidationError):
        CreateViewInput(workspaceId="w", name="  ", entityType="issue")
    assert (
        CreateViewInput(workspaceId="w", name="  Valid  ", entityType="issue").name
        == "Valid"
    )


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_saved_view_permissions_conflicts_and_paginated_queries():
    asyncio.run(verify_saved_views())


async def verify_saved_views():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    workspace = None
    users = [cuid() for _ in range(3)]
    try:
        async with async_sessionmaker(engine)() as db:
            now = utcnow()
            for user in users:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'View user',:email,'ACTIVE',:now,:now)"
                    ),
                    {"id": user, "email": cuid() + "@example.test", "now": now},
                )
            seed = await create_workspace_bootstrap(
                db,
                user_id=users[0],
                organization_name="Saved views",
                workspace_name=cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.execute(
                text(
                    "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,joined_at,created_at,updated_at) VALUES (:id,:w,:u,'MEMBER','ACTIVE',:now,:now,:now)"
                ),
                {"id": cuid(), "w": workspace, "u": users[1], "now": now},
            )
            status = (
                await db.execute(
                    text(
                        "SELECT id FROM issue_statuses WHERE workspace_id=:w ORDER BY position LIMIT 1"
                    ),
                    {"w": workspace},
                )
            ).scalar_one()
            for index in range(105):
                await db.execute(
                    text("""INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,priority,creator_id,created_at,updated_at)
                    VALUES (:id,:w,:team,:status,:identifier,:number,'Matching task','HIGH',:creator,:now,:now)"""),
                    {
                        "id": cuid(),
                        "w": workspace,
                        "team": team,
                        "status": status,
                        "identifier": f"SV-{index}",
                        "number": index + 1,
                        "creator": users[0],
                        "now": now - timedelta(seconds=index),
                    },
                )
            await db.commit()
            owner, reader, outsider = ({"id": user} for user in users)
            config = {
                "version": 1,
                "teamId": team,
                "query": {
                    "filters": [
                        {
                            "columnId": "priority",
                            "type": "option",
                            "operator": "is",
                            "values": ["high"],
                        },
                        {
                            "columnId": "assignee",
                            "type": "option",
                            "operator": "is",
                            "values": ["unassigned"],
                        },
                    ]
                },
            }
            created = (
                await create_view(
                    CreateViewInput(
                        workspaceId=workspace,
                        name="Team queue",
                        entityType="issue",
                        filters=config,
                    ),
                    owner,
                    db,
                )
            )["data"]
            view_id = created["id"]
            assert (await get_view(view_id, workspace, owner, db))["data"]["filters"][
                "teamId"
            ] == team
            assert not (await list_views(workspace, None, reader, db))["data"]
            with pytest.raises(ApiError) as caught:
                await get_view(view_id, workspace, outsider, db)
            assert caught.value.status_code == 403
            payload = UpdateViewInput(
                name="Shared queue",
                filters=config,
                isShared=True,
                expectedUpdatedAt=created["updatedAt"],
            )
            shared = (await update_view(view_id, payload, workspace, owner, db))["data"]
            assert (await get_view(view_id, workspace, reader, db))["data"]["isShared"]
            assert len((await list_views(workspace, team, owner, db))["data"]) == 1
            with pytest.raises(ApiError) as caught:
                await list_views(workspace, team, reader, db)
            assert caught.value.status_code == 403
            with pytest.raises(ApiError) as caught:
                await update_view(view_id, payload, workspace, reader, db)
            assert caught.value.status_code == 403
            with pytest.raises(ApiError) as caught:
                await update_view(view_id, payload, workspace, owner, db)
            assert caught.value.status_code == 409
            with pytest.raises(ApiError) as caught:
                await delete_view(view_id, workspace, created["updatedAt"], owner, db)
            assert caught.value.status_code == 409
            with pytest.raises(ApiError) as caught:
                await delete_view(view_id, workspace, None, reader, db)
            assert caught.value.status_code == 403
            options = {
                "teamId": team,
                "filters": json.dumps(shared["filters"]["query"]["filters"]),
                "limit": 100,
            }
            first = await search_page(
                db, workspace, owner["id"], "saved-view-secret", options
            )
            second = await search_page(
                db,
                workspace,
                owner["id"],
                "saved-view-secret",
                {**options, "cursor": first["meta"]["nextCursor"]},
            )
            assert first["meta"]["total"] == second["meta"]["total"] == 105
            assert len(first["data"]) == 100 and len(second["data"]) == 5
            assert not {row["id"] for row in first["data"]} & {
                row["id"] for row in second["data"]
            }
            assert (
                await search_page(
                    db, workspace, reader["id"], "saved-view-secret", options
                )
            )["meta"]["total"] == 0
            legacy = (
                await create_view(
                    CreateViewInput(
                        workspaceId=workspace,
                        name="Legacy",
                        entityType="issue",
                        filters={"priorityIds": ["high"]},
                    ),
                    owner,
                    db,
                )
            )["data"]
            assert legacy["filters"]["version"] == 1
            assert len((await list_views(workspace, team, owner, db))["data"]) == 1
            await db.execute(
                text(
                    "UPDATE saved_views SET filters=CAST(:filters AS jsonb) WHERE id=:id"
                ),
                {
                    "id": legacy["id"],
                    "filters": json.dumps(
                        {"priorityIds": ["high"], "unassigned": True}
                    ),
                },
            )
            await db.commit()
            restored = (await get_view(legacy["id"], workspace, owner, db))["data"]
            assert len(restored["filters"]["query"]["filters"]) == 2
            assert not restored["configurationError"]
            with pytest.raises(ApiError) as caught:
                await create_view(
                    CreateViewInput(
                        workspaceId=workspace,
                        name="Bad reference",
                        entityType="issue",
                        filters={"statusIds": ["missing-status"]},
                    ),
                    owner,
                    db,
                )
            assert caught.value.status_code == 400
            await db.execute(
                text(
                    "UPDATE saved_views SET filters=CAST(:filters AS jsonb) WHERE id=:id"
                ),
                {"id": legacy["id"], "filters": json.dumps({"unsupported": "value"})},
            )
            await db.commit()
            assert (await get_view(legacy["id"], workspace, owner, db))["data"][
                "configurationError"
            ]
            await delete_view(view_id, workspace, shared["updatedAt"], owner, db)
            assert (
                await db.execute(
                    text("SELECT COUNT(*) FROM issues WHERE workspace_id=:w"),
                    {"w": workspace},
                )
            ).scalar_one() == 105
    finally:
        if workspace:
            async with async_sessionmaker(engine)() as cleanup:
                await cleanup.execute(
                    text("DELETE FROM workspaces WHERE id=:w"), {"w": workspace}
                )
                await cleanup.execute(
                    text("DELETE FROM organizations WHERE owner_id=:u"), {"u": users[0]}
                )
                await cleanup.execute(
                    text("DELETE FROM users WHERE id=ANY(CAST(:ids AS text[]))"),
                    {"ids": users},
                )
                await cleanup.commit()
        await engine.dispose()
