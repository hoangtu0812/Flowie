import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.work_items.contracts import CreateDocumentInput, UpdateDocumentInput
from app.modules.work_items.document_tree import (
    create_folder,
    delete_folder,
    mutate_folder_file,
    project_tree,
    scaffold_project_tree,
    update_folder,
)
from app.modules.work_items.documents import (
    archive_document,
    create_document,
    update_document,
)
from tests.document_review_support import add_member, approve

pytestmark = pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)


async def seed(db):
    now = utcnow()
    user = {"id": cuid(), "name": "Docs actions"}
    await db.execute(
        text(
            "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
        ),
        {**user, "email": cuid() + "@example.test", "now": now},
    )
    workspace = await create_workspace_bootstrap(
        db,
        user_id=user["id"],
        organization_name="Docs actions",
        workspace_name=cuid(),
        now=now,
    )
    scope = {"workspace_id": workspace["workspace_id"], "user_id": user["id"]}
    projects = [cuid(), cuid()]
    for project in projects:
        await db.execute(
            text(
                "INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,:id,:id,:now,:now)"
            ),
            {
                "id": project,
                "workspace": scope["workspace_id"],
                "team": workspace["team_id"],
                "now": now,
            },
        )
        await scaffold_project_tree(db, **scope, project_id=project)
    tree = await project_tree(db, **scope, project_id=projects[0])
    other = await project_tree(db, **scope, project_id=projects[1])
    root = next(folder for folder in tree["folders"] if folder["kind"] == "project")
    folder = next(folder for folder in tree["folders"] if folder["number"] == 0)
    dest = next(folder for folder in tree["folders"] if folder["number"] == 99)
    return user, scope, tree, other["folders"][0], root, folder, dest


async def rejected(code, action):
    with pytest.raises(ApiError) as error:
        await action
    assert error.value.status_code == code, error.value


def test_moves_deletes_preserve_links_history_and_scope():
    asyncio.run(verify_actions())


async def verify_actions():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            user, scope, tree, other, root, folder, dest = await seed(db)

            async def new_folder(name, parent=folder["id"], **values):
                return await create_folder(
                    db, **scope, team_id=None, name=name, parent_id=parent, **values
                )

            module = await new_folder("Module", kind="module")
            child = await new_folder("Feature", parent=module["id"], kind="feature")
            document = (
                await create_document(
                    CreateDocumentInput(
                        workspaceId=scope["workspace_id"],
                        teamId=tree["teamId"],
                        folderId=child["id"],
                        title="Spec",
                        content="Retained content",
                    ),
                    user,
                    db,
                )
            )["data"]
            document = await approve(
                db, scope["workspace_id"], tree["teamId"], document["id"], user
            )
            await db.execute(
                text(
                    "INSERT INTO document_links(id,document_id,workspace_id,project_id) VALUES (:id,:doc,:workspace,:project)"
                ),
                {
                    "id": cuid(),
                    "doc": document["id"],
                    "workspace": scope["workspace_id"],
                    "project": tree["projectId"],
                },
            )
            await db.execute(
                text(
                    "INSERT INTO document_publications(document_id,workspace_id,release) VALUES (:doc,:workspace,1)"
                ),
                {"doc": document["id"], "workspace": scope["workspace_id"]},
            )
            for source, destination in [
                (root["id"], dest["id"]),
                (module["id"], child["id"]),
                (module["id"], other["id"]),
                (module["id"], None),
            ]:
                await rejected(
                    400,
                    update_folder(
                        db, **scope, folder_id=source, values={"parentId": destination}
                    ),
                )
            await rejected(
                400,
                update_folder(
                    db, **scope, folder_id=module["id"], values={"kind": "project"}
                ),
            )
            await rejected(
                409,
                update_folder(
                    db,
                    **scope,
                    folder_id=module["id"],
                    values={"parentId": dest["id"], "expectedParentId": root["id"]},
                ),
            )
            for source in (folder, module, child):
                await rejected(409, delete_folder(db, **scope, folder_id=source["id"]))
            await rejected(400, delete_folder(db, **scope, folder_id=root["id"]))
            moved = await update_folder(
                db,
                **scope,
                folder_id=module["id"],
                values={"parentId": dest["id"], "expectedParentId": folder["id"]},
            )
            assert moved["parentId"] == dest["id"]
            await rejected(
                409,
                delete_folder(
                    db, **scope, folder_id=module["id"], expected_parent_id=folder["id"]
                ),
            )
            await rejected(
                409,
                delete_folder(
                    db, **scope, folder_id=module["id"], expected_parent_id=""
                ),
            )
            after = await project_tree(db, **scope, project_id=tree["projectId"])
            kept = next(
                item for item in after["documents"] if item["id"] == document["id"]
            )
            assert (
                kept["folderId"],
                kept["content"],
                kept["status"],
                kept["release"],
            ) == (child["id"], "Retained content", "APPROVED", 1)
            assert kept["publication"]["release"] is None
            for target in (other["id"], None):
                await rejected(
                    400,
                    update_document(
                        document["id"],
                        UpdateDocumentInput(folderId=target),
                        scope["workspace_id"],
                        user,
                        db,
                    ),
                )
            moved_doc = (
                await update_document(
                    document["id"],
                    UpdateDocumentInput(
                        folderId=dest["id"], expectedVersion=kept["version"]
                    ),
                    scope["workspace_id"],
                    user,
                    db,
                )
            )["data"]
            assert (
                moved_doc["folderId"] == dest["id"]
                and moved_doc["content"] == "Retained content"
            )
            await rejected(
                409,
                update_document(
                    document["id"],
                    UpdateDocumentInput(
                        folderId=child["id"], expectedVersion=kept["version"]
                    ),
                    scope["workspace_id"],
                    user,
                    db,
                ),
            )
            await rejected(
                409,
                archive_document(
                    document["id"],
                    scope["workspace_id"],
                    user,
                    db,
                    expected_version=kept["version"],
                ),
            )
            outsider = await add_member(
                db, scope["workspace_id"], None, name="Outside team"
            )
            await rejected(
                403,
                delete_folder(
                    db, **{**scope, "user_id": outsider["id"]}, folder_id=child["id"]
                ),
            )
            await rejected(
                403,
                update_folder(
                    db,
                    **{**scope, "user_id": outsider["id"]},
                    folder_id=module["id"],
                    values={"name": "Forbidden"},
                ),
            )
            await rejected(
                403,
                archive_document(document["id"], scope["workspace_id"], outsider, db),
            )
            await rejected(
                403,
                update_document(
                    document["id"],
                    UpdateDocumentInput(folderId=child["id"]),
                    scope["workspace_id"],
                    outsider,
                    db,
                ),
            )

            file_id = cuid()
            await db.execute(
                text(
                    "INSERT INTO attachments(id,workspace_id,uploaded_by,entity_type,entity_id,object_key,filename,mime_type,size,created_at) VALUES (:id,:workspace,:user,'document-folder',:folder,:id,'test.pdf','application/pdf',5,:now)"
                ),
                {
                    "id": file_id,
                    "workspace": scope["workspace_id"],
                    "user": user["id"],
                    "folder": child["id"],
                    "now": utcnow(),
                },
            )
            await rejected(409, delete_folder(db, **scope, folder_id=child["id"]))
            await rejected(
                400,
                mutate_folder_file(
                    db,
                    **scope,
                    file_id=file_id,
                    expected_folder_id=child["id"],
                    folder_id=other["id"],
                ),
            )
            await rejected(
                403,
                mutate_folder_file(
                    db,
                    **{**scope, "user_id": outsider["id"]},
                    file_id=file_id,
                    expected_folder_id=child["id"],
                ),
            )
            await mutate_folder_file(
                db,
                **scope,
                file_id=file_id,
                expected_folder_id=child["id"],
                folder_id=dest["id"],
            )
            stored = (
                (
                    await db.execute(
                        text(
                            "SELECT entity_id,object_key FROM attachments WHERE id=:id"
                        ),
                        {"id": file_id},
                    )
                )
                .mappings()
                .one()
            )
            assert (stored["entity_id"], stored["object_key"]) == (dest["id"], file_id)
            await rejected(
                409,
                mutate_folder_file(
                    db, **scope, file_id=file_id, expected_folder_id=child["id"]
                ),
            )
            await mutate_folder_file(
                db, **scope, file_id=file_id, expected_folder_id=dest["id"]
            )
            assert not (
                await db.execute(
                    text("SELECT 1 FROM attachments WHERE id=:id"), {"id": file_id}
                )
            ).first()
            await delete_folder(db, **scope, folder_id=child["id"])
            await delete_folder(db, **scope, folder_id=module["id"])
            await archive_document(
                document["id"],
                scope["workspace_id"],
                user,
                db,
                expected_version=moved_doc["version"],
            )
            await delete_folder(db, **scope, folder_id=dest["id"])
            archived = (
                (
                    await db.execute(
                        text(
                            "SELECT folder_id,archived_at FROM documents WHERE id=:id"
                        ),
                        {"id": document["id"]},
                    )
                )
                .mappings()
                .one()
            )
            assert archived["folder_id"] is None and archived["archived_at"]
            assert (
                await db.execute(
                    text("SELECT count(*) FROM document_links WHERE document_id=:id"),
                    {"id": document["id"]},
                )
            ).scalar_one() == 1
            assert (
                await db.execute(
                    text(
                        "SELECT count(*) FROM document_releases WHERE document_id=:id"
                    ),
                    {"id": document["id"]},
                )
            ).scalar_one() == 1
            await db.rollback()
    finally:
        await engine.dispose()


def test_folder_deletion_serializes_with_document_creation():
    asyncio.run(verify_concurrent_delete())


async def verify_concurrent_delete():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine)
    try:
        async with factory() as setup:
            user, scope, tree, _, _, folder, _ = await seed(setup)
            await setup.commit()
        async with factory() as deleting, factory() as creating:
            await delete_folder(deleting, **scope, folder_id=folder["id"])
            started = asyncio.Event()

            async def insert():
                started.set()
                return await create_document(
                    CreateDocumentInput(
                        workspaceId=scope["workspace_id"],
                        teamId=tree["teamId"],
                        folderId=folder["id"],
                        title="Concurrent spec",
                    ),
                    user,
                    creating,
                )

            task = asyncio.create_task(insert())
            await started.wait()
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=0.1)
                pytest.fail("Document creation bypassed the folder lock")
            except TimeoutError:
                pass
            await deleting.commit()
            await rejected(404, task)
            await creating.rollback()
        async with factory() as cleanup:
            await cleanup.execute(
                text("DELETE FROM workspaces WHERE id=:id"),
                {"id": scope["workspace_id"]},
            )
            await cleanup.execute(
                text("DELETE FROM organizations WHERE owner_id=:id"), {"id": user["id"]}
            )
            await cleanup.execute(
                text("DELETE FROM users WHERE id=:id"), {"id": user["id"]}
            )
            await cleanup.commit()
    finally:
        await engine.dispose()
