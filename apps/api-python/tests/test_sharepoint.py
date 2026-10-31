import asyncio
import os
from dataclasses import replace
from datetime import timedelta
from urllib.parse import unquote

import httpx
from tests.document_review_support import approve
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings, _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.sharepoint.attachments import numbered, publish_attachments_due
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
    assert [numbered("a.pdf", 1), numbered("a.pdf", 2), numbered("a.tar.gz", 3), numbered("README", 2)] == [
        "a.pdf", "a (2).pdf", "a.tar (3).gz", "README (2)",
    ]


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
            await approve(db, workspace, team, doc["id"], user)
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
            await approve(db, workspace, team, doc["id"], user)
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


@pytest.mark.skipif(not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured")
def test_attachments_copy_once_per_issue_folder_with_numbered_duplicates():
    asyncio.run(verify_attachment_copies())


class MemoryStorage:
    def __init__(self):
        self.files: dict[str, bytes] = {}

    async def get(self, key: str) -> bytes:
        return self.files[key]


async def verify_attachment_copies():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    settings = replace(Settings.from_environment(), scm_secrets_encryption_key=Fernet.generate_key().decode())
    user = {"id": _cuid(), "name": "Uploader"}
    storage, uploads, mode = MemoryStorage(), [], {"fail": False}
    large = b"x" * (5 * 1024 * 1024)

    def graph(request: httpx.Request) -> httpx.Response:
        path = unquote(request.url.path)
        if request.url.host == "login.microsoftonline.com":
            return httpx.Response(200, json={"access_token": "token"})
        if mode["fail"]:
            return httpx.Response(503, json={})
        if request.url.host == "contoso.sharepoint.com":
            # The session URL is pre-authenticated: no bearer token, one full range.
            # VI: URL session đã kèm xác thực: không có bearer token, gửi một range đầy đủ.
            assert "authorization" not in request.headers
            assert request.headers["content-range"] == f"bytes 0-{len(large) - 1}/{len(large)}"
            uploads.append(("session:" + path, len(request.content)))
            return httpx.Response(201, json={"id": "big", "webUrl": "https://contoso.sharepoint.com/big"})
        assert request.headers["authorization"] == "Bearer token"
        if path == "/v1.0/sites/contoso.sharepoint.com:/sites/DTD":
            return httpx.Response(200, json={"id": "site"})
        if path == "/v1.0/sites/site/drives":
            return httpx.Response(200, json={"value": [
                {"id": "drive", "name": "Documents", "webUrl": "https://contoso.sharepoint.com/sites/DTD/Shared%20Documents"},
            ]})
        if path.endswith(":/createUploadSession"):
            return httpx.Response(200, json={"uploadUrl": "https://contoso.sharepoint.com/upload/session-1"})
        assert request.method == "PUT"
        uploads.append((path, len(request.content)))
        return httpx.Response(201, json={"id": "item", "webUrl": "https://contoso.sharepoint.com/file"})

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
            status = (await db.execute(text("SELECT id FROM issue_statuses WHERE workspace_id=:w LIMIT 1"), {"w": workspace})).scalar_one()
            issue, loose, comment, deleted = _cuid(), _cuid(), _cuid(), _cuid()
            for id_, key, number, project_id in ((issue, "DTD-7", 7, project), (loose, "DTD-8", 8, None)):
                await db.execute(
                    text("INSERT INTO issues(id,workspace_id,team_id,project_id,status_id,identifier,number,title,creator_id,created_at,updated_at) VALUES (:id,:w,:t,:p,:s,:key,:n,'Sync: files?',:u,:now,:now)"),
                    {"id": id_, "w": workspace, "t": team, "p": project_id, "s": status, "key": key, "n": number, "u": user["id"], "now": now},
                )
            for id_, gone in ((comment, None), (deleted, now)):
                await db.execute(
                    text("INSERT INTO comments(id,issue_id,author_id,content,created_at,updated_at,deleted_at) VALUES (:id,:i,:u,'c',:now,:now,:gone)"),
                    {"id": id_, "i": issue, "u": user["id"], "now": now, "gone": gone},
                )
            # Upload order decides numbering; the deleted comment's file still takes a number.
            # VI: Thứ tự tải lên quyết định số; file của comment đã xóa vẫn giữ một số.
            files = [
                ("issue", issue, "Spec.pdf", b"one"),
                ("comment", deleted, "spec.pdf", b"gone"),
                ("comment", comment, "SPEC.pdf", b"two"),
                ("comment", comment, "big.zip", large),
                ("project", project, "plan.xlsx", b"plan"),
                ("issue", loose, "loose.txt", b"no project"),
            ]
            ids = []
            for offset, (entity_type, entity_id, name, body) in enumerate(files):
                id_, key = _cuid(), _cuid()
                storage.files[key] = body
                ids.append(id_)
                await db.execute(
                    text("INSERT INTO attachments(id,workspace_id,uploaded_by,entity_type,entity_id,object_key,filename,mime_type,size,created_at) VALUES (:id,:w,:u,:type,:entity,:key,:name,'application/octet-stream',:size,:at)"),
                    {"id": id_, "w": workspace, "u": user["id"], "type": entity_type, "entity": entity_id, "key": key,
                     "name": name, "size": len(body), "at": now + timedelta(seconds=offset)},
                )
            await save_connection(db, settings, workspace, user["id"], tenant_id="tenant.example", client_id="client", client_secret="secret", enabled=True)
            await db.commit()

        # Off by default. VI: Mặc định tắt.
        assert await publish_attachments_due(factory, settings, http, storage) == 0
        async with factory() as db:
            await save_connection(db, settings, workspace, user["id"], tenant_id="tenant.example", client_id="client", client_secret=None, enabled=True, publish_attachments=True)
            await db.commit()
        mode["fail"] = True
        assert await publish_attachments_due(factory, settings, http, storage) == 0
        mode["fail"] = False
        # Failures wait for their backoff. VI: Lỗi phải chờ hết thời gian chờ.
        assert await publish_attachments_due(factory, settings, http, storage) == 0
        async with factory() as db:
            await db.execute(text("UPDATE attachment_publications SET attempted_at = attempted_at - interval '1 hour' WHERE workspace_id=:w"), {"w": workspace})
            await db.commit()
        assert await publish_attachments_due(factory, settings, http, storage) == 4
        base = "/v1.0/drives/drive/root:/Flowie/Attachments/"
        assert uploads == [
            (base + "DTD-7 Sync- files-/Spec.pdf:/content", 3),
            (base + "DTD-7 Sync- files-/SPEC (3).pdf:/content", 3),
            ("session:/upload/session-1", len(large)),
            (base + "_Project/plan.xlsx:/content", 4),
        ]
        assert await publish_attachments_due(factory, settings, http, storage) == 0
        async with factory() as db:
            rows = {
                row["attachment_id"]: row
                for row in (await db.execute(text("SELECT * FROM attachment_publications WHERE workspace_id=:w"), {"w": workspace})).mappings()
            }
            assert set(rows) == {ids[0], ids[2], ids[3], ids[4]}
            assert rows[ids[3]]["web_url"] == "https://contoso.sharepoint.com/big"
            assert all(row["last_error"] is None and row["attempts"] == 0 for row in rows.values())
    finally:
        await http.aclose()
        async with factory() as db:
            await db.execute(text("DELETE FROM workspaces WHERE id=:id"), {"id": workspace})
            await db.execute(text("DELETE FROM organizations WHERE id=:id"), {"id": seed["organization_id"]})
            await db.execute(text("DELETE FROM users WHERE id=:id"), {"id": user["id"]})
            await db.commit()
        await engine.dispose()
