import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.approvals_api import list_approvals
from app.modules.work_items.contracts import CreateDocumentInput, UpdateDocumentInput
from app.modules.work_items.document_review import (
    DecisionInput,
    ReviewersInput,
    decide,
    review_state,
    set_reviewers,
)
from app.modules.work_items.documents import create_document, update_document
from tests.document_review_support import add_member


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_lists_follow_review_rules_and_access():
    asyncio.run(verify_lists())


async def verify_lists():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            now = _utcnow()
            owner = {"id": _cuid(), "name": "Owner"}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**owner, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=owner["id"], organization_name="Approvals", workspace_name=_cuid(), now=now
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            lead = await add_member(db, workspace, team, team_role="LEAD", name="Lead")
            author = await add_member(db, workspace, team, name="Author")
            reviewer = await add_member(db, workspace, team, name="Reviewer")
            outsider = await add_member(db, workspace, None, name="Outsider")
            stranger = {"id": _cuid(), "name": "Stranger"}

            async def lists(user):
                return (await list_approvals(workspaceId=workspace, user=user, db=db))["data"]

            async def ids(user, tab):
                return [item["id"] for item in (await lists(user))[tab]]

            async def document(by, title="Spec", submit=True):
                created = (await create_document(
                    CreateDocumentInput(workspaceId=workspace, teamId=team, title=title, content="one", docType="FDS"),
                    by, db,
                ))["data"]
                if submit:
                    await update_document(created["id"], UpdateDocumentInput(status="IN_REVIEW"), workspace, by, db)
                return created["id"]

            async def assign(document_id, reviewers):
                await set_reviewers(
                    db, document_id, ReviewersInput(workspaceId=workspace, reviewerIds=reviewers), lead
                )

            async def verdict(document_id, by, decision, note=None):
                await decide(
                    db, document_id,
                    DecisionInput(workspaceId=workspace, decision=decision, note=note), by,
                )

            # A pending reviewer sees the document; approvers wait until they stop blocking.
            # VI: Reviewer chưa quyết định thấy tài liệu; người duyệt chờ tới khi hết bị chặn.
            spec = await document(author)
            assert (await lists(lead))["waiting"][0]["role"] == "APPROVER"
            await assign(spec, [reviewer["id"]])
            assert await ids(lead, "waiting") == []
            item = (await lists(reviewer))["waiting"][0]
            assert (item["id"], item["role"], item["kind"]) == (spec, "REVIEWER", "document")
            assert item["progress"] == {"agreed": 0, "total": 1}
            assert await ids(author, "waiting") == []
            assert await ids(author, "submitted") == [spec]

            await verdict(spec, reviewer, "APPROVED")
            assert await ids(reviewer, "waiting") == []
            done = (await lists(reviewer))["done"][0]
            assert (done["id"], done["decision"], done["release"]) == (spec, "APPROVED", None)
            ready = (await lists(lead))["waiting"][0]
            assert (ready["id"], ready["role"]) == (spec, "APPROVER")
            assert ready["progress"] == {"agreed": 1, "total": 1}

            # With every decision in, the waiting list and the document page agree on who approves.
            # VI: Khi đã đủ quyết định, danh sách chờ và trang tài liệu thống nhất về người được duyệt.
            for person in (owner, lead, author, reviewer):
                state = await review_state(db, workspace, spec, person["id"])
                assert (spec in await ids(person, "waiting")) == state["canApprove"]

            await update_document(spec, UpdateDocumentInput(status="APPROVED"), workspace, lead, db)
            assert await ids(lead, "waiting") == []
            assert await ids(author, "submitted") == []
            released = (await lists(lead))["done"][0]
            assert (released["id"], released["release"]) == (spec, 1)

            # A new round clears the decision but keeps the document in the reviewer's history.
            # VI: Vòng mới xoá quyết định nhưng tài liệu vẫn ở lịch sử của reviewer.
            await update_document(spec, UpdateDocumentInput(status="IN_REVIEW"), workspace, author, db)
            assert await ids(reviewer, "waiting") == [spec]
            done = next(row for row in (await lists(reviewer))["done"] if row["id"] == spec)
            assert done["decision"] is None
            await update_document(spec, UpdateDocumentInput(status="DRAFT"), workspace, author, db)

            # A change request returns to the author's list with its note until they edit.
            # VI: Yêu cầu sửa quay về danh sách của tác giả kèm nhận xét cho tới khi họ sửa.
            returned = await document(author, "Returned")
            await assign(returned, [reviewer["id"]])
            await verdict(returned, reviewer, "CHANGES_REQUESTED", "Fix the scope")
            item = next(row for row in (await lists(author))["submitted"] if row["id"] == returned)
            assert item["status"] == "DRAFT"
            assert item["changeRequests"] == [{"name": "Reviewer", "note": "Fix the scope"}]
            assert returned not in await ids(reviewer, "waiting")
            await update_document(returned, UpdateDocumentInput(content="two"), workspace, author, db)
            assert returned not in await ids(author, "submitted")

            # An ordinary lead needs another reviewer on their own document; an Owner does not.
            # VI: Lead thường cần reviewer khác cho tài liệu của mình; Owner thì không.
            own = await document(lead, "Lead's own")
            assert own not in await ids(lead, "waiting")
            assert own in await ids(lead, "submitted")
            assert own in await ids(owner, "waiting")
            owned = await document(owner, "Owner's own")
            assert owned in await ids(owner, "waiting")

            # Drafts, other teams and archived documents never appear.
            # VI: Bản nháp, team khác và tài liệu đã lưu trữ không bao giờ xuất hiện.
            draft = await document(author, "Draft", submit=False)
            assert draft not in await ids(lead, "waiting")
            assert draft not in await ids(author, "submitted")
            assert await lists(outsider) == {"waiting": [], "submitted": [], "done": []}
            await db.execute(
                text("UPDATE documents SET archived_at=:now WHERE id=:id"), {"id": own, "now": _utcnow()}
            )
            assert own not in await ids(owner, "waiting")
            assert own not in await ids(lead, "submitted")

            with pytest.raises(ApiError) as error:
                await lists(stranger)
            assert error.value.status_code == 403
            await db.rollback()
    finally:
        await engine.dispose()
