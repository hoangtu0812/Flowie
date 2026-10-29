import asyncio
import os
from dataclasses import replace
from urllib.parse import unquote

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings, _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.sharepoint.graph import SharePointError, parse_folder_url, safe_name
from app.modules.sharepoint.service import publish_due, publish_path, save_connection
from app.modules.work_items.contracts import CreateDocumentInput, UpdateDocumentInput
from app.modules.work_items.document_tree import create_folder, project_tree, scaffold_project_tree, update_folder
from app.modules.work_items.documents import create_document, update_document

FOLDER = "https://contoso.sharepoint.com/sites/DTD/Shared%20Documents/Flowie"


def test_folder_urls_and_names():
    assert parse_folder_url(FOLDER) == ("contoso.sharepoint.com", "/sites/DTD", ["Shared Documents", "Flowie"])
    view = "https://contoso.sharepoint.com/sites/DTD/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FDTD%2FShared%20Documents%2FA"
    assert parse_folder_url(view)[2] == ["Shared Documents", "A"]
    for bad in ("http://contoso.sharepoint.com/sites/DTD/Docs", "https://evil.example/sites/DTD/Docs", "https://contoso.sharepoint.com/Docs"):
        with pytest.raises(SharePointError):
            parse_folder_url(bad)
    assert safe_name(' a:b/c? ') == "a-b-c-"
    assert publish_path("Flowie", ["Docs", "Tree"], "FDS · Tree") == "Flowie/Docs/Tree/FDS · Tree.md"
    assert publish_path("Flowie", ["Docs"], "FDS · Tree", 2) == "Flowie/Docs/_versions/FDS · Tree_v2.md"


@pytest.mark.skipif(not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured")
def test_releases_publish_once_with_kept_copies_and_failures_back_off():
    asyncio.run(verify_publishing())


async def verify_publishing():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    settings = replace(Settings.from_environment(), scm_secrets_encryption_key=Fernet.generate_key().decode())
    user = {"id": _cuid(), "name": "Publisher"}
    uploads, mode = [], {"fail": False}

    def graph(request: httpx.Request) -> httpx.Response:
        path = unquote(request.url.path)
        if request.url.host == "login.microsoftonline.com":
            assert request.url.path == "/tenant.example/oauth2/v2.0/token"
            return httpx.Response(200, json={"access_token": "token"})
        assert request.headers["authorization"] == "Bearer token"
        if mode["fail"]:
            return httpx.Response(403, json={})
        if path == "/v1.0/sites/contoso.sharepoint.com:/sites/DTD":
            return httpx.Response(200, json={"id": "site"})
        if path == "/v1.0/sites/site/drives":
            return httpx.Response(200, json={"value": [
                {"id": "other", "name": "Shared", "webUrl": "https://contoso.sharepoint.com/sites/DTD/Shared"},
                {"id": "drive", "name": "Documents", "webUrl": "https://contoso.sharepoint.com/sites/DTD/Shared%20Documents"},
            ]})
        assert request.method == "PUT"
        uploads.append((path, request.content.decode()))
        return httpx.Response(201, json={"id": "item", "webUrl": "https://contoso.sharepoint.com/x.md"})

    http = httpx.AsyncClient(transport=httpx.MockTransport(graph))
    try:
        async with factory() as db:
            now = _utcnow()
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(db, user_id=user["id"], organization_name="SP", workspace_name=_cuid(), now=now)
            workspace, team, project = seed["workspace_id"], seed["team_id"], _cuid()
            await db.execute(
                text("INSERT INTO projects(id,workspace_id,team_id,name,identifier,sharepoint_folder_url,created_at,updated_at) VALUES (:id,:w,:t,'Flowie',:id,:url,:now,:now)"),
                {"id": project, "w": workspace, "t": team, "url": FOLDER, "now": now},
            )
            await scaffold_project_tree(db, workspace_id=workspace, user_id=user["id"], project_id=project)
            tree = await project_tree(db, workspace_id=workspace, user_id=user["id"], project_id=project)
            root = next(f for f in tree["folders"] if f["kind"] == "project")
            module = await create_folder(db, workspace_id=workspace, user_id=user["id"], team_id=None, name="Docs", parent_id=root["id"], kind="module")
            feature = await create_folder(db, workspace_id=workspace, user_id=user["id"], team_id=None, name="Tree", parent_id=module["id"], kind="feature")
            doc = (await create_document(CreateDocumentInput(workspaceId=workspace, teamId=team, folderId=feature["id"], title="FDS · Tree", content="# v1", docType="FDS"), user, db))["data"]
            draft = (await create_document(CreateDocumentInput(workspaceId=workspace, teamId=team, folderId=feature["id"], title="TDS · Tree", content="# draft", docType="TDS"), user, db))["data"]
            await save_connection(db, settings, workspace, user["id"], tenant_id="tenant.example", client_id="client", client_secret="secret", enabled=True)
            await db.commit()

        # Nothing is approved yet. VI: Chưa có gì được duyệt.
        assert await publish_due(factory, settings, http) == 0
        async with factory() as db:
            await update_document(doc["id"], UpdateDocumentInput(status="APPROVED"), workspace, user, db)
            await db.commit()
        assert await publish_due(factory, settings, http) == 1
        # Folder numbers are part of the path, like the Docs tree.
        # VI: Số thư mục là một phần của đường dẫn, giống cây Docs.
        base = "/v1.0/drives/drive/root:/Flowie/01 · Docs/01 · Tree/"
        assert [path for path, _ in uploads] == [
            base + "_versions/FDS · Tree_v1.md:/content",
            base + "FDS · Tree.md:/content",
        ]
        body = uploads[0][1]
        assert uploads[1][1] == body and body.endswith("\n---\n\n# v1")
        assert '\ntitle: "FDS · Tree"\nversion: v1\napproved_by: "Publisher"\n' in body
        assert await publish_due(factory, settings, http) == 0

        # Renumbering a folder uploads the latest release again at the new path; the old files
        # are left on SharePoint.
        # VI: Đổi số thư mục làm tải lại phiên bản mới nhất theo đường dẫn mới; file cũ vẫn để
        # VI: trên SharePoint.
        async with factory() as db:
            await update_folder(db, workspace_id=workspace, user_id=user["id"], folder_id=module["id"], values={"number": 3})
            await db.commit()
        assert await publish_due(factory, settings, http) == 1
        assert [path for path, _ in uploads[2:]] == [
            "/v1.0/drives/drive/root:/Flowie/03 · Docs/01 · Tree/_versions/FDS · Tree_v1.md:/content",
            "/v1.0/drives/drive/root:/Flowie/03 · Docs/01 · Tree/FDS · Tree.md:/content",
        ]
        assert await publish_due(factory, settings, http) == 0

        # Editing returns the document to Draft; SharePoint keeps v1 until v2 is approved.
        # VI: Sửa đưa tài liệu về Nháp; SharePoint giữ v1 cho tới khi v2 được duyệt.
        async with factory() as db:
            edited = await update_document(doc["id"], UpdateDocumentInput(content="# v2"), workspace, user, db)
            assert (edited["data"]["status"], edited["data"]["release"]) == ("DRAFT", 1)
            await db.commit()
        assert await publish_due(factory, settings, http) == 0
        async with factory() as db:
            await update_document(doc["id"], UpdateDocumentInput(status="APPROVED"), workspace, user, db)
            await db.commit()
        mode["fail"] = True
        assert await publish_due(factory, settings, http) == 0
        async with factory() as db:
            row = (await db.execute(text("SELECT * FROM document_publications WHERE document_id=:id"), {"id": doc["id"]})).mappings().one()
            assert (row["attempts"], row["web_url"]) == (1, "https://contoso.sharepoint.com/x.md")
            assert "Sites.Selected" in row["last_error"]
            published = await project_tree(db, workspace_id=workspace, user_id=user["id"], project_id=project)
            by_id = {d["id"]: d for d in published["documents"]}
            assert by_id[doc["id"]]["publication"]["lastError"] and by_id[draft["id"]]["publication"] is None
        # A failure waits for its backoff instead of retrying on the next tick.
        # VI: Lỗi phải chờ hết thời gian chờ thay vì thử lại ngay ở lượt sau.
        mode["fail"] = False
        assert await publish_due(factory, settings, http) == 0
    finally:
        await http.aclose()
        async with factory() as db:
            await db.execute(text("DELETE FROM workspaces WHERE id=:id"), {"id": workspace})
            await db.execute(text("DELETE FROM organizations WHERE id=:id"), {"id": seed["organization_id"]})
            await db.execute(text("DELETE FROM users WHERE id=:id"), {"id": user["id"]})
            await db.commit()
        await engine.dispose()
