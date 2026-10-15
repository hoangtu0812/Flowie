import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.sla.contracts import PolicyValues, UpdatePolicy
from app.modules.sla.policies import (
    create_policy,
    update_policy,
    read_policy,
    list_policies,
    policy_history,
    select_policy,
    policy_command,
)


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_sla_policy_scope_precedence_versions_history_and_current_membership():
    asyncio.run(verify_policies())


async def verify_policies():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            owner, reader = [
                {"id": _cuid(), "name": "SLA policy test"} for _ in range(2)
            ]
            for user in [owner, reader]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                    ),
                    {**user, "email": _cuid() + "@example.test", "now": now},
                )
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name="SLA tests",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.execute(
                text(
                    "INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:actor,'ADMIN','ACTIVE',:now,:now)"
                ),
                {
                    "id": _cuid(),
                    "workspace": workspace,
                    "actor": reader["id"],
                    "now": now,
                },
            )
            global_values = PolicyValues(
                name="Shared clock", deadlineMinutes=60, priority="HIGH"
            )
            shared = await create_policy(db, workspace, owner, global_values)
            private_values = PolicyValues(
                name="Private clock", teamId=team, deadlineMinutes=60, calendar={}
            )
            private = await create_policy(db, workspace, owner, private_values)
            assert (await select_policy(db, workspace, team, "HIGH"))["id"] == private[
                "id"
            ]
            assert (await list_policies(db, workspace, reader, "secret"))["meta"][
                "total"
            ] == 1
            with pytest.raises(ApiError):
                await read_policy(db, workspace, reader, private["id"])
            with pytest.raises(ApiError):
                await create_policy(db, workspace, reader, private_values)
            with pytest.raises(ApiError) as duplicate:
                await create_policy(
                    db,
                    workspace,
                    owner,
                    global_values.model_copy(update={"name": "SHARED CLOCK"}),
                )
            assert duplicate.value.status_code == 409
            changed = await update_policy(
                db,
                workspace,
                owner,
                private["id"],
                UpdatePolicy(
                    **private_values.model_dump(), expectedVersion=1
                ).model_copy(update={"deadlineMinutes": 120}),
            )
            assert changed["version"] == 2
            versions = await policy_history(
                db, workspace, owner, private["id"], limit=1
            )
            assert (
                versions["data"][0]["snapshot"]["deadlineMinutes"] == 120
                and versions["meta"]["nextBefore"] == 2
            )
            original = await policy_history(
                db, workspace, owner, private["id"], before=2
            )
            assert (
                original["data"][0]["snapshot"]["deadlineMinutes"] == 60
                and original["data"][0]["kind"] == "CREATED"
            )
            with pytest.raises(ApiError):
                await update_policy(
                    db,
                    workspace,
                    owner,
                    private["id"],
                    UpdatePolicy(**private_values.model_dump(), expectedVersion=1),
                )
            # A policy moving to shared scope must not expose older private-team revisions.
            changed = await update_policy(
                db,
                workspace,
                owner,
                private["id"],
                UpdatePolicy(
                    **private_values.model_copy(update={"teamId": None}).model_dump(),
                    expectedVersion=2,
                ),
            )
            visible_history = await policy_history(db, workspace, reader, private["id"])
            assert [row["version"] for row in visible_history["data"]] == [3]
            archived = await policy_command(
                db, workspace, owner, private["id"], "archive", 3
            )
            assert archived["archivedAt"] is not None
            assert (await list_policies(db, workspace, reader, "secret"))["meta"][
                "total"
            ] == 1
            restored = await policy_command(
                db, workspace, owner, private["id"], "restore", 4
            )
            assert restored["version"] == 5 and restored["archivedAt"] is None
            await db.execute(
                text(
                    "INSERT INTO team_members(team_id,user_id,created_at) VALUES (:team,:actor,:now)"
                ),
                {"team": team, "actor": reader["id"], "now": now},
            )
            assert (await policy_history(db, workspace, reader, private["id"]))["meta"][
                "total"
            ] == 5
            await db.execute(
                text("DELETE FROM team_members WHERE team_id=:team AND user_id=:actor"),
                {"team": team, "actor": reader["id"]},
            )
            assert (await policy_history(db, workspace, reader, private["id"]))["meta"][
                "total"
            ] == 3
            private_status = _cuid()
            await db.execute(
                text(
                    "INSERT INTO issue_statuses(id,workspace_id,team_id,name,category,color,created_at,updated_at) VALUES (:id,:workspace,:team,'Waiting privately','STARTED','gray',:now,:now)"
                ),
                {
                    "id": private_status,
                    "workspace": workspace,
                    "team": team,
                    "now": now,
                },
            )
            with pytest.raises(ApiError):
                await create_policy(
                    db,
                    workspace,
                    owner,
                    global_values.model_copy(
                        update={
                            "name": "Invalid scope",
                            "pauseStatusIds": [private_status],
                        }
                    ),
                )
            with pytest.raises(ApiError):
                await create_policy(
                    db,
                    workspace,
                    owner,
                    private_values.model_copy(
                        update={
                            "name": "Invalid escalation",
                            "escalateToId": reader["id"],
                        }
                    ),
                )
            with pytest.raises(ApiError):
                await create_policy(
                    db,
                    workspace,
                    owner,
                    PolicyValues(
                        name="Unusable horizon",
                        deadlineMinutes=525600,
                        calendar={
                            "windows": [
                                {"weekday": 0, "start": "09:00", "end": "10:00"}
                            ]
                        },
                    ),
                )
            await db.execute(
                text(
                    "UPDATE workspace_members SET role='MEMBER' WHERE workspace_id=:workspace AND user_id=:actor"
                ),
                {"workspace": workspace, "actor": owner["id"]},
            )
            assert (await read_policy(db, workspace, owner, shared["id"]))[
                "id"
            ] == shared["id"]
            with pytest.raises(ApiError) as member:
                await create_policy(db, workspace, owner, global_values)
            assert member.value.status_code == 403
            await db.rollback()
    finally:
        await engine.dispose()
