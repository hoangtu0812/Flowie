import asyncio
import csv
from datetime import timedelta
from io import BytesIO, StringIO
import json
import os
from unittest.mock import AsyncMock, patch
from zipfile import ZipFile

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.data_exchange.contracts import (
    ImportPreview,
    IssueExport,
    DocumentExport,
)
from app.modules.data_exchange.csv_input import parse_csv, validate_mapping
from app.modules.data_exchange.import_service import (
    import_preview,
    import_command,
    import_result,
)
from app.modules.data_exchange.import_worker import process_import_row
from app.modules.data_exchange.exports import export_issues, export_documents
from app.modules.work_items.documents import create_document
from app.modules.work_items.contracts import CreateDocumentInput


def test_csv_parser_bounds_quoting_and_mapping():
    headers, rows = parse_csv('\ufeffKey,Summary\r\nA,"Tiếng Việt, quoted\nline"\r\n')
    assert rows == [{"Key": "A", "Summary": "Tiếng Việt, quoted\nline"}]
    validate_mapping(headers, {"externalId": "Key", "title": "Summary"})
    for content in [
        "a,a\n1,2",
        "a,b\n1,2,3",
        'a,b\n"broken',
        "a,b\n",
        "a,b\n" + ("x,y\n" * 1001),
        "a,b\nx,\x00",
    ]:
        with pytest.raises(ApiError):
            parse_csv(content)
    for mapping in [
        {"title": "Summary"},
        {"title": "Summary", "externalId": "Summary"},
        {"title": "not found", "externalId": "Key"},
        {"title": "Summary", "externalId": "Key", "password": "Key"},
    ]:
        with pytest.raises(ApiError):
            validate_mapping(headers, mapping)


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_durable_import_dedup_cancel_references_revocation_and_scoped_exports():
    asyncio.run(verify_exchange())


async def verify_exchange():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine)
    user = {"id": _cuid(), "name": "Exchange owner"}
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
                organization_name="Exchange tests",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.commit()

        async def preview(content, **extra):
            payload = ImportPreview(
                workspaceId=workspace,
                teamId=team,
                csv=content,
                requestKey=extra.pop("requestKey", _cuid()),
                sourceKey=extra.pop("sourceKey", "fixture"),
                mapping=extra.pop(
                    "mapping",
                    {"externalId": "key", "title": "title", "priority": "priority"},
                ),
                **extra,
            )
            async with factory() as db:
                result = await import_preview(db, user, payload)
                await db.commit()
                return result, payload

        async def command(identifier, name):
            async with factory() as db:
                result = await import_command(db, user, workspace, identifier, name)
                await db.commit()
                return result

        async def result(identifier, **extra):
            async with factory() as db:
                return await import_result(db, user, workspace, identifier, **extra)

        operation, payload = await preview(
            "key,title,priority\na,First imported,HIGH\nb,=SUM(1),LOW\nc,x,HIGH\na,Duplicate,HIGH"
        )
        assert operation["counts"] == {"PENDING": 2, "INVALID": 1, "SKIPPED": 1}
        async with factory() as db:
            assert (
                await db.execute(
                    text("SELECT COUNT(*) FROM issues WHERE workspace_id=:id"),
                    {"id": workspace},
                )
            ).scalar_one() == 0
            assert (await import_preview(db, user, payload))["id"] == operation["id"]
            with pytest.raises(ApiError):
                await import_preview(
                    db,
                    user,
                    payload.model_copy(update={"csv": payload.csv + "\nd,Other,HIGH"}),
                )
            with pytest.raises(ApiError):
                await import_result(db, {"id": _cuid()}, workspace, operation["id"])
        await command(operation["id"], "apply")
        await command(operation["id"], "apply")
        await asyncio.gather(process_import_row(factory), process_import_row(factory))
        if (await result(operation["id"]))["state"] != "DONE":
            await process_import_row(factory)
        assert (await result(operation["id"]))["counts"] == {
            "SUCCEEDED": 2,
            "INVALID": 1,
            "SKIPPED": 1,
        }
        duplicate, _ = await preview("key,title,priority\na,Again,HIGH")
        assert duplicate["counts"] == {"SKIPPED": 1}
        duplicate_error, _ = await preview(
            "key,title,priority\na,Again,HIGH", duplicateMode="error"
        )
        assert duplicate_error["counts"] == {"INVALID": 1}
        # Two queued batches with the same unseen key cannot create two issues.
        race1, _ = await preview("key,title,priority\nrace,Race issue,HIGH")
        race2, _ = await preview("key,title,priority\nrace,Race issue,HIGH")
        await command(race1["id"], "apply")
        await command(race2["id"], "apply")
        await asyncio.gather(process_import_row(factory), process_import_row(factory))
        assert sorted(
            [(await result(row["id"]))["counts"] for row in [race1, race2]], key=str
        ) == [{"SKIPPED": 1}, {"SUCCEEDED": 1}]
        canceled, _ = await preview(
            "key,title,priority\nx,Cancel first,HIGH\ny,Cancel second,HIGH"
        )
        await command(canceled["id"], "apply")
        await process_import_row(factory)
        await command(canceled["id"], "cancel")
        assert (await result(canceled["id"]))["counts"] == {
            "PENDING": 1,
            "SUCCEEDED": 1,
        }
        expired, _ = await preview("key,title,priority\nz,Expired,HIGH")
        paged, _ = await preview(
            "key,title,priority\n"
            + "\n".join(f"page-{n},Paged issue {n},LOW" for n in range(105))
        )
        seen = {row["rowNumber"] for row in paged["rows"]}
        cursor = paged["nextAfter"]
        while cursor:
            page = await result(paged["id"], after=cursor)
            ids = {row["rowNumber"] for row in page["rows"]}
            assert not ids & seen
            seen |= ids
            cursor = page["nextAfter"]
        assert len(seen) == 105
        await command(paged["id"], "cancel")
        async with factory() as db:
            project = _cuid()
            await db.execute(
                text(
                    "INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Import reference',:id,:now,:now)"
                ),
                {"id": project, "workspace": workspace, "now": _utcnow()},
            )
            await db.commit()
        changed, _ = await preview(
            f"key,title,project\nchanged,Reference changed,{project}",
            mapping={"externalId": "key", "title": "title", "projectId": "project"},
        )
        assert changed["counts"] == {"PENDING": 1}
        await command(changed["id"], "apply")
        async with factory() as db:
            await db.execute(
                text("UPDATE projects SET archived_at=:now WHERE id=:id"),
                {"id": project, "now": _utcnow()},
            )
            await db.commit()
        await process_import_row(factory)
        assert (await result(changed["id"]))["rows"][0][
            "errorCode"
        ] == "REFERENCE_UNAVAILABLE"
        async with factory() as db:
            await db.execute(
                text(
                    "UPDATE issue_import_batches SET expires_at=:expired WHERE id=:id"
                ),
                {"id": expired["id"], "expired": _utcnow() - timedelta(seconds=1)},
            )
            await db.commit()
        with pytest.raises(ApiError):
            await command(expired["id"], "apply")
        atomic, _ = await preview("key,title,priority\nrollback,Rollback,HIGH")
        await command(atomic["id"], "apply")

        async def fail_after_create(payload, user, db):
            from app.modules.work_items.issues import create_issue

            await create_issue(payload, user, db)
            raise RuntimeError("synthetic rollback")

        with patch(
            "app.modules.data_exchange.import_worker.create_issue", fail_after_create
        ):
            await process_import_row(factory)
        assert (await result(atomic["id"]))["counts"] == {"FAILED": 1}
        async with factory() as db:
            assert (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM issues WHERE workspace_id=:id AND title='Rollback'"
                    ),
                    {"id": workspace},
                )
            ).scalar_one() == 0
            exported = await export_issues(
                db, user, IssueExport(workspaceId=workspace, query={"query": "=SUM"})
            )
            values = list(csv.reader(StringIO(exported.decode("utf-8-sig"))))
            assert len(values) == 2 and values[1][2] == "\t=SUM(1)"
            document = (
                await create_document(
                    CreateDocumentInput(
                        workspaceId=workspace,
                        title="../secret title",
                        content="# Exported\n[external](https://example.test/private)",
                    ),
                    user,
                    db,
                )
            )["data"]
            attachment = _cuid()
            await db.execute(
                text(
                    "INSERT INTO attachments(id,workspace_id,uploaded_by,entity_type,entity_id,object_key,filename,mime_type,size,created_at) VALUES (:id,:workspace,:actor,'document',:document,'fixture-object','../../escaped.txt','text/plain',7,:now)"
                ),
                {
                    "id": attachment,
                    "workspace": workspace,
                    "actor": user["id"],
                    "document": document["id"],
                    "now": _utcnow(),
                },
            )
            storage = type("Storage", (), {"get": AsyncMock(return_value=b"content")})()
            content = await export_documents(
                db,
                user,
                DocumentExport(
                    workspaceId=workspace,
                    documentIds=[document["id"]],
                    includeAttachments=True,
                ),
                storage,
            )
            with ZipFile(BytesIO(content)) as archive:
                assert set(archive.namelist()) == {
                    "manifest.json",
                    f"documents/{document['id']}.md",
                    f"attachments/{attachment}.txt",
                }
                manifest = json.loads(archive.read("manifest.json"))
                assert manifest["documents"][0]["title"] == "../secret title"
                assert archive.read(f"attachments/{attachment}.txt") == b"content"
            storage.get.assert_awaited_once_with("fixture-object", maximum_bytes=7)
            with pytest.raises(ApiError):
                await export_documents(
                    db,
                    user,
                    DocumentExport(workspaceId=workspace, documentIds=[_cuid()]),
                    storage,
                )
            await db.commit()
        revoked, _ = await preview("key,title,priority\nrevoked,Must not create,HIGH")
        await command(revoked["id"], "apply")
        async with factory() as db:
            await db.execute(
                text("DELETE FROM team_members WHERE team_id=:team AND user_id=:user"),
                {"team": team, "user": user["id"]},
            )
            await db.commit()
        await process_import_row(factory)
        async with factory() as db:
            assert (
                await db.execute(
                    text("SELECT state FROM issue_import_rows WHERE batch_id=:id"),
                    {"id": revoked["id"]},
                )
            ).scalar_one() == "FAILED"
            assert (
                await export_issues(db, user, IssueExport(workspaceId=workspace))
            ).count(b"\r\n") == 1
            with pytest.raises(ApiError):
                await import_result(db, user, workspace, revoked["id"])
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
