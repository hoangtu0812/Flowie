import asyncio
import os
from unittest.mock import patch

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.bulk_contracts import BulkPreview, BulkChanges
from app.modules.work_items.bulk_service import bulk_preview, bulk_result, bulk_command
from app.modules.work_items.bulk_worker import process_bulk_item
from app.modules.work_items.issue_rules import _validate_references


def test_bulk_requires_explicit_selection_and_bounded_references():
    with pytest.raises(ValidationError):
        BulkPreview(
            workspaceId="w",
            requestKey="request-key",
            selection="all_matching",
            changes={"priority": "HIGH"},
        )
    for changes in [
        {},
        {"priority": None},
        {"labelIds": ["duplicate", "duplicate"]},
        {"labelIds": ["x" * 101]},
        {"unexpected": "x"},
    ]:
        with pytest.raises(ValidationError):
            BulkChanges.model_validate(changes)


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_bulk_frozen_selection_acl_conflicts_atomicity_and_resume():
    asyncio.run(verify_bulk())


async def verify_bulk():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine)
    user = {"id": _cuid(), "name": "Bulk owner"}
    workspace = None
    try:
        async with factory() as db:
            now = _utcnow()
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user["id"],
                organization_name="Bulk tests",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            status = (
                await db.execute(
                    text(
                        "SELECT id FROM issue_statuses WHERE workspace_id=:workspace AND category='UNSTARTED' LIMIT 1"
                    ),
                    {"workspace": workspace},
                )
            ).scalar_one()
            ids = [_cuid() for _ in range(4)]
            await db.execute(
                text("""INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,priority,creator_id,created_at,updated_at)
                VALUES (:id,:workspace,:team,:status,:identifier,:number,'Bulk issue','LOW',:user,:now,:now)"""),
                [
                    {
                        "id": identifier,
                        "workspace": workspace,
                        "team": team,
                        "status": status,
                        "identifier": f"BULK-{n}",
                        "number": n,
                        "user": user["id"],
                        "now": now,
                    }
                    for n, identifier in enumerate(ids, 1)
                ],
            )
            await db.commit()

        async def preview(changes, selected=None, **extra):
            async with factory() as db:
                payload = BulkPreview(
                    workspaceId=workspace,
                    requestKey=extra.pop("requestKey", _cuid()),
                    items=[
                        {"id": identifier, "version": 1}
                        for identifier in (selected or ids)
                    ],
                    changes=changes,
                    **extra,
                )
                result = await bulk_preview(db, user, payload)
                await db.commit()
                return result, payload

        async def command(identifier, action):
            async with factory() as db:
                result = await bulk_command(db, user, workspace, identifier, action)
                await db.commit()
                return result

        async def result(identifier):
            async with factory() as db:
                return await bulk_result(db, user, workspace, identifier)

        all_matching, _ = await preview(
            {"priority": "HIGH"}, selection="all_matching", confirmAll=True
        )
        assert all_matching["counts"] == {"PENDING": 4}
        await command(all_matching["id"], "cancel")
        async with factory() as db:
            await db.execute(
                text("""INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,priority,creator_id,created_at,updated_at)
                SELECT 'c'||md5(:team||n::text),:workspace,:team,:status,'LIMIT-'||n,n+10,'Bulk limit','LOW',:user,:now,:now
                FROM generate_series(1,1001) n"""),
                {
                    "team": team,
                    "workspace": workspace,
                    "status": status,
                    "user": user["id"],
                    "now": _utcnow(),
                },
            )
            with pytest.raises(ApiError) as too_many:
                await bulk_preview(
                    db,
                    user,
                    BulkPreview(
                        workspaceId=workspace,
                        requestKey=_cuid(),
                        selection="all_matching",
                        confirmAll=True,
                        changes={"priority": "HIGH"},
                    ),
                )
            assert too_many.value.status_code == 400
            await db.rollback()

        operation, payload = await preview({"priority": "HIGH"})
        async with factory() as db:
            assert (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM issues WHERE workspace_id=:workspace AND priority='LOW'"
                    ),
                    {"workspace": workspace},
                )
            ).scalar_one() == 4
            assert (await bulk_preview(db, user, payload))["id"] == operation["id"]
            changed = payload.model_copy(
                update={"changes": BulkChanges(priority="URGENT")}
            )
            with pytest.raises(ApiError) as conflict:
                await bulk_preview(db, user, changed)
            assert conflict.value.status_code == 409
            for field in ["projectId", "assigneeId", "labelIds"]:
                with pytest.raises(ApiError):
                    await _validate_references(
                        db,
                        workspace,
                        team,
                        {field: ["missing"] if field == "labelIds" else "missing"},
                        creating=False,
                    )
            await db.execute(
                text("UPDATE issues SET title=title WHERE id=:id"), {"id": ids[0]}
            )
            await db.commit()
        assert next(
            row
            for row in (await result(operation["id"]))["items"]
            if row["issue_id"] == ids[0]
        )["stale"]
        await command(operation["id"], "execute")
        await asyncio.gather(process_bulk_item(factory), process_bulk_item(factory))
        for _ in range(5):
            await process_bulk_item(factory)
        final = await result(operation["id"])
        assert final["state"] == "DONE" and final["counts"] == {
            "SUCCEEDED": 3,
            "FAILED": 1,
        }
        assert (
            next(row for row in final["items"] if row["issue_id"] == ids[0])[
                "error_code"
            ]
            == "CONFLICT"
        )
        assert (await command(operation["id"], "execute"))["counts"] == final["counts"]

        # Relation-only changes still advance the issue version exactly once.
        labels, _ = await preview({"labelIds": []}, [ids[0]])
        async with factory() as db:
            previous = (
                await db.execute(
                    text("SELECT version FROM issues WHERE id=:id"), {"id": ids[0]}
                )
            ).scalar_one()
            await db.execute(
                text(
                    "UPDATE bulk_operation_items SET expected_version=:version WHERE operation_id=:operation"
                ),
                {"version": previous, "operation": labels["id"]},
            )
            await db.commit()
        await command(labels["id"], "execute")
        assert await process_bulk_item(factory)
        assert (await result(labels["id"]))["counts"] == {"SUCCEEDED": 1}
        async with factory() as db:
            assert (
                await db.execute(
                    text("SELECT version FROM issues WHERE id=:id"), {"id": ids[0]}
                )
            ).scalar_one() == previous + 1

        cancelled, _ = await preview({"priority": "URGENT"}, [ids[0]])
        await command(cancelled["id"], "cancel")
        assert not await process_bulk_item(factory)
        assert (await result(cancelled["id"]))["state"] == "CANCELLED"

        # Failed domain mutations roll back with their item, including side effects.
        atomic, _ = await preview({"priority": "URGENT"}, [ids[0]])
        async with factory() as db:
            await db.execute(
                text(
                    "UPDATE bulk_operation_items SET expected_version=(SELECT version FROM issues WHERE id=:issue) WHERE operation_id=:operation"
                ),
                {"issue": ids[0], "operation": atomic["id"]},
            )
            await db.commit()
        await command(atomic["id"], "execute")

        async def fail_after_write(issue, payload, workspace, user, db):
            await db.execute(
                text("UPDATE issues SET priority='URGENT' WHERE id=:id"), {"id": issue}
            )
            raise RuntimeError("synthetic failure")

        with patch("app.modules.work_items.bulk_worker.update_issue", fail_after_write):
            assert await process_bulk_item(factory)
        assert (await result(atomic["id"]))["counts"] == {"FAILED": 1}
        async with factory() as db:
            assert (
                await db.execute(
                    text("SELECT priority FROM issues WHERE id=:id"), {"id": ids[0]}
                )
            ).scalar_one() == "LOW"

        revoked, _ = await preview({"priority": "URGENT"}, [ids[0]])
        await command(revoked["id"], "execute")
        async with factory() as db:
            await db.execute(
                text("DELETE FROM team_members WHERE team_id=:team AND user_id=:user"),
                {"team": team, "user": user["id"]},
            )
            await db.commit()
        assert await process_bulk_item(factory)
        final = await result(revoked["id"])
        assert final["counts"] == {"FAILED": 1} and final["items"] == []
        async with factory() as db:
            with pytest.raises(ApiError) as denied:
                await bulk_result(db, {"id": _cuid()}, workspace, operation["id"])
            assert denied.value.status_code in {403, 404}
    finally:
        async with factory() as db:
            if workspace:
                await db.execute(
                    text("DELETE FROM workspaces WHERE id=:id"), {"id": workspace}
                )
            await db.execute(
                text("DELETE FROM organizations WHERE owner_id=:id"), {"id": user["id"]}
            )
            await db.execute(text("DELETE FROM users WHERE id=:id"), {"id": user["id"]})
            await db.commit()
        await engine.dispose()
