import asyncio
import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.mcp.contracts import UpdateDocumentTool
from app.modules.work_items.contracts import CreateDocumentInput, UpdateDocumentInput
from app.modules.work_items.document_history import list_releases, release_row
from app.modules.work_items.documents import create_document, update_document


def test_agents_cannot_approve_documents():
    with pytest.raises(ValidationError):
        UpdateDocumentTool(documentId="d", idempotencyKey="key-12345", expectedVersion=1, status="APPROVED")


@pytest.mark.skipif(not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured")
def test_approval_creates_releases_and_edits_return_to_draft():
    asyncio.run(verify_releases())


async def verify_releases():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    user = {"id": _cuid(), "name": "Reviewer"}
    try:
        async with factory() as db:
            now = _utcnow()
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**user, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(db, user_id=user["id"], organization_name="Rel", workspace_name=_cuid(), now=now)
            workspace = seed["workspace_id"]

            async def update(**values):
                return (await update_document(doc["id"], UpdateDocumentInput(**values), workspace, user, db))["data"]

            doc = (await create_document(CreateDocumentInput(workspaceId=workspace, title="FDS", content="one"), user, db))["data"]
            assert (doc["status"], doc["release"]) == ("DRAFT", None)
            reviewing = await update(status="IN_REVIEW")
            # Editing during review keeps the document in review.
            # VI: Sửa trong lúc đang duyệt vẫn giữ trạng thái Đang duyệt.
            reviewing = await update(content="one!", expectedVersion=reviewing["version"])
            assert reviewing["status"] == "IN_REVIEW"

            # Approving a version someone has since edited is refused and creates no release.
            # VI: Duyệt một bản đã bị người khác sửa sẽ bị từ chối và không tạo phiên bản.
            with pytest.raises(ApiError) as stale:
                await update(status="APPROVED", expectedVersion=reviewing["version"] - 1)
            assert stale.value.status_code == 409
            approved = await update(status="APPROVED", expectedVersion=reviewing["version"])
            assert (approved["status"], approved["release"]) == ("APPROVED", 1)

            retyped = await update(docType="TDS")
            assert (retyped["status"], retyped["release"]) == ("APPROVED", 1)
            edited = await update(content="two")
            assert (edited["status"], edited["release"]) == ("DRAFT", 1)
            assert (await update(status="APPROVED"))["release"] == 2

            releases = (await list_releases(db, doc["id"]))["items"]
            assert [r["release"] for r in releases] == [2, 1]
            assert releases[0]["approvedBy"] == {"id": user["id"], "name": "Reviewer"}
            assert (await release_row(db, doc["id"], 1))["content"] == "one!"
            assert (await release_row(db, doc["id"], 2))["content"] == "two"
            with pytest.raises(ApiError):
                await release_row(db, doc["id"], 3)
            await db.rollback()
    finally:
        async with factory() as db:
            await db.execute(text("DELETE FROM workspaces WHERE id=:id"), {"id": workspace})
            await db.execute(text("DELETE FROM organizations WHERE id=:id"), {"id": seed["organization_id"]})
            await db.execute(text("DELETE FROM users WHERE id=:id"), {"id": user["id"]})
            await db.commit()
        await engine.dispose()
