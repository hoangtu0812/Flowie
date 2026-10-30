import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.native_documents import get_document, list_folders
from app.modules.work_items.contracts import (
    CreateDocumentInput,
    CreateIssueInput,
    UpdateDocumentInput,
)
from app.modules.work_items.document_tree import (
    create_folder,
    folder_label,
    issue_documents,
    project_tree,
    scaffold_project_tree,
    update_folder,
)
from app.modules.work_items.documents import create_document, update_document
from app.modules.work_items.issues import create_issue


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_project_document_tree_folders_types_and_links():
    asyncio.run(verify_document_tree())


async def verify_document_tree():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            user = {"id": _cuid(), "name": "Docs owner"}
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                ),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user["id"],
                organization_name="Docs",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            project = _cuid()
            await db.execute(
                text(
                    "INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,'Flowie',:id,:now,:now)"
                ),
                {"id": project, "workspace": workspace, "team": team, "now": now},
            )

            async def rejected(action):
                with pytest.raises(ApiError) as error:
                    await action
                return error.value.status_code

            # A team without folders gets "General" on its first document instead of a 404.
            first = (
                await create_document(
                    CreateDocumentInput(workspaceId=workspace, teamId=team, title="First"),
                    user,
                    db,
                )
            )["data"]
            assert first["folderId"] and (first["docType"], first["status"]) == ("OTHER", "DRAFT")

            await scaffold_project_tree(db, workspace_id=workspace, user_id=user["id"], project_id=project)
            await scaffold_project_tree(db, workspace_id=workspace, user_id=user["id"], project_id=project)
            tree = await project_tree(db, workspace_id=workspace, user_id=user["id"], project_id=project)
            names = sorted(folder_label(folder["name"], folder["number"]) for folder in tree["folders"])
            assert names == ["00 · Tổng quan", "99 · Vận hành", "Flowie"]
            root = next(f for f in tree["folders"] if f["kind"] == "project")

            module = await create_folder(
                db, workspace_id=workspace, user_id=user["id"], team_id=None,
                name="Documents", parent_id=root["id"], kind="module",
            )
            feature = await create_folder(
                db, workspace_id=workspace, user_id=user["id"], team_id=None,
                name="Tree", parent_id=module["id"], kind="feature",
            )
            assert (feature["projectId"], feature["teamId"]) == (project, team)
            # Children of a project tree take the next number after the highest below 99.
            # VI: Thư mục con trong cây dự án nhận số kế tiếp sau số lớn nhất dưới 99.
            assert (module["number"], feature["number"]) == (1, 1)
            second = await create_folder(
                db, workspace_id=workspace, user_id=user["id"], team_id=None,
                name="Release", parent_id=root["id"], kind="module",
            )
            assert second["number"] == 2
            assert await rejected(create_folder(
                db, workspace_id=workspace, user_id=user["id"], team_id=None,
                name="Clash", parent_id=root["id"], number=1,
            )) == 409
            assert await rejected(update_folder(
                db, workspace_id=workspace, user_id=user["id"],
                folder_id=second["id"], values={"number": 99},
            )) == 409
            renumbered = await update_folder(
                db, workspace_id=workspace, user_id=user["id"],
                folder_id=second["id"], values={"number": 5, "name": "Releases"},
            )
            assert folder_label(renumbered["name"], renumbered["number"]) == "05 · Releases"
            cleared = await update_folder(
                db, workspace_id=workspace, user_id=user["id"],
                folder_id=second["id"], values={"number": None},
            )
            assert cleared["number"] is None
            team_folder = await create_folder(
                db, workspace_id=workspace, user_id=user["id"], team_id=team, name="Team only"
            )
            assert team_folder["number"] is None
            assert await rejected(create_folder(
                db, workspace_id=workspace, user_id=user["id"], team_id=None,
                name="tree", parent_id=module["id"],
            )) == 409
            assert await rejected(update_folder(
                db, workspace_id=workspace, user_id=user["id"],
                folder_id=module["id"], values={"parentId": feature["id"]},
            )) == 400

            # Moving a team-root folder into the project tree brings it into the project.
            loose = await create_folder(
                db, workspace_id=workspace, user_id=user["id"], team_id=team, name="Loose"
            )
            moved = await update_folder(
                db, workspace_id=workspace, user_id=user["id"],
                folder_id=loose["id"], values={"parentId": module["id"], "kind": "feature"},
            )
            assert (moved["projectId"], moved["kind"]) == (project, "feature")
            # The team Documents tab lists team-wide folders only, never the project tree.
            # VI: Tab Documents của team chỉ liệt kê thư mục chung, không lẫn cây dự án.
            team_folders = (await list_folders(workspaceId=workspace, teamId=team, user=user, db=db))["data"]
            assert sorted(folder["name"] for folder in team_folders) == ["General", "Team only"]
            assert all(folder["projectId"] is None for folder in team_folders)

            fds = (
                await create_document(
                    CreateDocumentInput(
                        workspaceId=workspace, teamId=team, folderId=feature["id"],
                        title="FDS · Documents · Tree", docType="FDS",
                    ),
                    user,
                    db,
                )
            )["data"]
            approved = (
                await update_document(
                    fds["id"], UpdateDocumentInput(status="APPROVED"), workspace, user, db
                )
            )["data"]
            assert (approved["docType"], approved["status"]) == ("FDS", "APPROVED")

            issue = (
                await create_issue(
                    CreateIssueInput(workspaceId=workspace, teamId=team, projectId=project, title="Docs issue"),
                    user,
                    db,
                )
            )["data"]
            await db.execute(
                text(
                    "INSERT INTO document_links(id,document_id,workspace_id,issue_id) VALUES (:id,:doc,:workspace,:issue)"
                ),
                {"id": _cuid(), "doc": first["id"], "workspace": workspace, "issue": issue["id"]},
            )
            tree = await project_tree(db, workspace_id=workspace, user_id=user["id"], project_id=project)
            by_id = {document["id"]: document for document in tree["documents"]}
            assert by_id[fds["id"]]["linked"] is False
            assert by_id[first["id"]]["linked"] is True
            # PDFs attached to a tree folder come back as files of that folder.
            await db.execute(
                text(
                    "INSERT INTO attachments(id,workspace_id,uploaded_by,entity_type,entity_id,object_key,filename,mime_type,size,created_at) VALUES (:id,:workspace,:user,'document-folder',:folder,'k','spec.pdf','application/pdf',5,:now)"
                ),
                {"id": _cuid(), "workspace": workspace, "user": user["id"], "folder": feature["id"], "now": now},
            )
            tree = await project_tree(db, workspace_id=workspace, user_id=user["id"], project_id=project)
            assert [(f["folderId"], f["filename"]) for f in tree["files"]] == [(feature["id"], "spec.pdf")]
            linked = await issue_documents(db, workspace_id=workspace, user_id=user["id"], issue_id=issue["id"])
            assert [document["id"] for document in linked] == [first["id"]]
            # The document page reads the same SharePoint state as the Docs preview.
            # VI: Trang tài liệu đọc cùng trạng thái SharePoint như khung xem trước của Docs.
            page = (await get_document(fds["id"], workspaceId=workspace, user=user, db=db))["data"]
            assert (page["release"], page["publication"]) == (1, None)
            await db.execute(
                text(
                    "INSERT INTO document_publications(document_id,workspace_id,release,web_url) VALUES (:doc,:workspace,1,'https://example.sharepoint.com/f.md')"
                ),
                {"doc": fds["id"], "workspace": workspace},
            )
            page = (await get_document(fds["id"], workspaceId=workspace, user=user, db=db))["data"]
            assert (page["publication"]["release"], page["publication"]["webUrl"]) == (
                1,
                "https://example.sharepoint.com/f.md",
            )
            await db.rollback()
    finally:
        await engine.dispose()
