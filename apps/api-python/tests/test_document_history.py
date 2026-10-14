from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.contracts import CreateDocumentInput, UpdateDocumentInput
from app.modules.work_items.documents import create_document, update_document
from app.modules.work_items.document_history import (
    list_revisions,
    revision_row,
    revision_diff,
)


@unittest.skipUnless(
    os.getenv("MCP_TEST_DATABASE_URL"), "MCP_TEST_DATABASE_URL is not configured"
)
class DocumentHistoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_stale_web_write_cannot_overwrite_ai_revision_and_restore_creates_history(
        self,
    ):
        engine = create_async_engine(
            _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
        )
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as db:
                user = {"id": _cuid(), "name": "Document test"}
                await db.execute(
                    text("""INSERT INTO users (id,name,email,status,created_at,updated_at)
                    VALUES (:id,:name,:email,'ACTIVE',:now,:now)"""),
                    {**user, "email": _cuid() + "@example.test", "now": _utcnow()},
                )
                seed = await create_workspace_bootstrap(
                    db,
                    user_id=user["id"],
                    organization_name="Revision test",
                    workspace_name=_cuid(),
                    now=_utcnow(),
                )
                workspace = seed["workspace_id"]
                document = (
                    await create_document(
                        CreateDocumentInput(
                            workspaceId=workspace,
                            title="Original title",
                            content="First\n",
                        ),
                        user,
                        db,
                    )
                )["data"]
                updated = (
                    await update_document(
                        document["id"],
                        UpdateDocumentInput(
                            content="Second\n", expectedVersion=document["version"]
                        ),
                        workspace,
                        user,
                        db,
                    )
                )["data"]
                with self.assertRaises(ApiError) as error:
                    await update_document(
                        document["id"],
                        UpdateDocumentInput(
                            content="Stale draft", expectedVersion=document["version"]
                        ),
                        workspace,
                        user,
                        db,
                    )
                self.assertEqual(error.exception.status_code, 409)
                before = await revision_row(db, document["id"], document["version"])
                diff = await revision_diff(before, updated)
                self.assertIn("+Second", diff["diff"])
                restored = (
                    await update_document(
                        document["id"],
                        UpdateDocumentInput(
                            title=before["title"],
                            content=before["content"],
                            expectedVersion=updated["version"],
                        ),
                        workspace,
                        user,
                        db,
                    )
                )["data"]
                self.assertEqual(restored["content"], "First\n")
                self.assertGreater(restored["version"], updated["version"])
                history = await list_revisions(db, document["id"])
                self.assertEqual(len(history["items"]), 3)
                await db.rollback()
        finally:
            await engine.dispose()
