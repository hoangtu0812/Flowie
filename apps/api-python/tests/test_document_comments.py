import asyncio
import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.work_items.contracts import CreateDocumentInput
from app.modules.work_items.document_comments import (
    CreateDocumentCommentInput,
    DocumentCommentAnchor,
    UpdateDocumentCommentInput,
    create_comment,
    delete_comment,
    list_comments,
    update_comment,
)
from app.modules.work_items.documents import create_document
from tests.document_review_support import add_member


def test_blank_comment_is_refused():
    with pytest.raises(ValidationError):
        CreateDocumentCommentInput(content="   ")
    assert UpdateDocumentCommentInput(content=" ok ").content == "ok"


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_document_comment_threads():
    asyncio.run(verify_threads())


async def verify_threads():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            now = utcnow()
            lead = {"id": cuid(), "name": "Lead"}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**lead, "email": cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=lead["id"], organization_name="Comments", workspace_name=cuid(), now=now
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            reader = await add_member(db, workspace, team, name="Reader")
            outsider = await add_member(db, workspace, None, name="Outsider")
            spec = (await create_document(
                CreateDocumentInput(workspaceId=workspace, teamId=team, title="FDS · Comments", content="# A\n\nBody"),
                lead, db,
            ))["data"]
            doc = spec["id"]
            anchor = DocumentCommentAnchor(blockText="Body", blockIndex=1, quote="Bod")

            async def status(code, action):
                with pytest.raises(ApiError) as error:
                    await action
                assert error.value.status_code == code, error.value

            async def inbox(user):
                return (await db.execute(
                    text("SELECT count(*) FROM notifications WHERE user_id=:user AND type='document.comment_mention'"),
                    {"user": user["id"]},
                )).scalar_one()

            # A thread needs an anchor; people outside the team neither read, comment nor get mentioned.
            # VI: Thread cần chỗ gắn; người ngoài team không đọc, không comment, không được mention.
            await status(400, create_comment(db, workspace, doc, CreateDocumentCommentInput(content="x"), lead))
            await status(403, create_comment(db, workspace, doc, CreateDocumentCommentInput(content="x", anchor=anchor), outsider))
            await status(400, create_comment(
                db, workspace, doc, CreateDocumentCommentInput(content="x", anchor=anchor, mentionIds=[outsider["id"]]), lead
            ))

            rows = await create_comment(
                db, workspace, doc, CreateDocumentCommentInput(content="@Reader look", anchor=anchor, mentionIds=[reader["id"]]), lead
            )
            thread = rows[0]
            assert thread["anchor"] == {"blockText": "Body", "blockIndex": 1, "quote": "Bod"} and thread["mine"]
            assert await inbox(reader) == 1

            # Replies drop any anchor and cannot nest. VI: Trả lời bỏ chỗ gắn và không lồng nhau.
            rows = await create_comment(
                db, workspace, doc, CreateDocumentCommentInput(content="ok", parentId=thread["id"], anchor=anchor), reader
            )
            reply = rows[1]
            assert (reply["parentId"], reply["anchor"], rows[0]["mine"]) == (thread["id"], None, False)
            await status(400, create_comment(db, workspace, doc, CreateDocumentCommentInput(content="no", parentId=reply["id"]), lead))

            # Only the author edits; an edit tells only newly added mentions.
            # VI: Chỉ người viết được sửa; sửa chỉ báo cho người mới được mention.
            await status(403, update_comment(db, workspace, doc, thread["id"], UpdateDocumentCommentInput(content="mine"), reader))
            await update_comment(db, workspace, doc, thread["id"], UpdateDocumentCommentInput(content="@Reader again"), lead)
            assert await inbox(reader) == 1

            # Anyone who reads resolves a thread, never a reply. VI: Ai đọc được đều resolve thread, không resolve trả lời.
            await status(400, update_comment(db, workspace, doc, reply["id"], UpdateDocumentCommentInput(resolved=True), reader))
            rows = await update_comment(db, workspace, doc, thread["id"], UpdateDocumentCommentInput(resolved=True), reader)
            assert rows[0]["resolvedBy"]["id"] == reader["id"] and rows[0]["resolvedAt"]
            rows = await update_comment(db, workspace, doc, thread["id"], UpdateDocumentCommentInput(resolved=False), lead)
            assert rows[0]["resolvedAt"] is None

            # Deleting the first comment hides its replies. VI: Xoá comment đầu thì ẩn các trả lời.
            await status(403, delete_comment(db, workspace, doc, thread["id"], reader))
            assert await delete_comment(db, workspace, doc, thread["id"], lead) == []
            assert await list_comments(db, doc, lead["id"]) == []
            await db.rollback()
    finally:
        await engine.dispose()


def test_broadcast_reaches_only_the_workspace():
    from app.services.notification_events import NotificationHub

    class Socket:
        def __init__(self):
            self.sent = []

        async def accept(self):
            pass

        async def send_json(self, payload):
            self.sent.append(payload)

    async def run():
        hub, mine, theirs = NotificationHub(), Socket(), Socket()
        await hub.connect("w1", "u1", mine)
        await hub.connect("w2", "u1", theirs)
        await hub.broadcast("w1", {"type": "document.comment.changed", "documentId": "d"})
        return mine.sent, theirs.sent

    assert asyncio.run(run()) == ([{"type": "document.comment.changed", "documentId": "d"}], [])
