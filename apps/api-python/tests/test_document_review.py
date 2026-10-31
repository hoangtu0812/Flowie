import asyncio
import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
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
def test_lead_assigns_reviewers_and_alone_approves():
    asyncio.run(verify_review_flow())


async def verify_review_flow():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            now = _utcnow()
            lead = {"id": _cuid(), "name": "Lead"}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**lead, "email": _cuid() + "@example.test", "now": now},
            )
            # The workspace creator owns the workspace and leads its first team.
            # VI: Người tạo workspace là chủ workspace và là lead của team đầu tiên.
            seed = await create_workspace_bootstrap(
                db, user_id=lead["id"], organization_name="Review", workspace_name=_cuid(), now=now
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            author = await add_member(db, workspace, team, name="Author")
            first = await add_member(db, workspace, team, name="First reviewer")
            second = await add_member(db, workspace, team, name="Second reviewer")
            outsider = await add_member(db, workspace, None, name="Outsider")

            async def status(code, action):
                with pytest.raises(ApiError) as error:
                    await action
                assert error.value.status_code == code, error.value

            async def update(document, by, **values):
                return (await update_document(document["id"], UpdateDocumentInput(**values), workspace, by, db))["data"]

            async def reviewers(document, by, ids):
                return await set_reviewers(db, document["id"], ReviewersInput(workspaceId=workspace, reviewerIds=ids), by)

            async def verdict(document, by, decision, note=None):
                return await decide(db, document["id"], DecisionInput(workspaceId=workspace, decision=decision, note=note), by)

            async def inbox(user, event):
                return (
                    await db.execute(
                        text("SELECT count(*) FROM notifications WHERE user_id=:user AND type=:event"),
                        {"user": user["id"], "event": event},
                    )
                ).scalar_one()

            await status(400, create_document(
                CreateDocumentInput(workspaceId=workspace, teamId=team, title="Born approved", status="APPROVED"), author, db
            ))
            spec = (await create_document(
                CreateDocumentInput(workspaceId=workspace, teamId=team, title="FDS · Review", content="one", docType="FDS"),
                author, db,
            ))["data"]
            await status(403, update(spec, author, status="APPROVED"))
            await status(409, update(spec, lead, status="APPROVED"))

            await update(spec, author, status="IN_REVIEW")
            assert await inbox(lead, "document.review_requested") == 1

            await status(403, reviewers(spec, author, [first["id"]]))
            await status(400, reviewers(spec, lead, [first["id"], outsider["id"]]))
            state = await reviewers(spec, lead, [first["id"], second["id"]])
            assert [row["name"] for row in state["reviewers"]] == ["First reviewer", "Second reviewer"]
            assert state["canAssign"] and not state["canApprove"]
            assert outsider["id"] not in {person["id"] for person in state["members"]}
            assert (await review_state(db, workspace, spec["id"], first["id"]))["members"] == []
            assert state["approveBlockedReason"] == "2 reviewer(s) have not approved this version yet."
            assert (await inbox(first, "document.review_assigned"), await inbox(second, "document.review_assigned")) == (1, 1)
            await status(403, verdict(spec, outsider, "APPROVED"))

            await verdict(spec, first, "APPROVED")
            await status(409, update(spec, lead, status="APPROVED"))
            # An edit during review keeps the reviewers but clears their decisions.
            # VI: Sửa trong lúc duyệt giữ reviewer nhưng xoá quyết định của họ.
            await update(spec, author, content="one!")
            state = await review_state(db, workspace, spec["id"], lead["id"])
            assert [row["decision"] for row in state["reviewers"]] == [None, None]
            await verdict(spec, first, "APPROVED")
            await verdict(spec, second, "APPROVED")
            assert await inbox(lead, "document.review_completed") == 1
            await status(403, update(spec, first, status="APPROVED"))
            approved = await update(spec, lead, status="APPROVED")
            assert (approved["status"], approved["release"]) == ("APPROVED", 1)
            assert await inbox(author, "document.approved") == 1

            # A new round starts clean; a change request needs a note and sends the draft back.
            # VI: Vòng mới bắt đầu sạch; yêu cầu sửa cần nhận xét và đưa tài liệu về nháp.
            await update(spec, author, content="two")
            await update(spec, author, status="IN_REVIEW")
            state = await review_state(db, workspace, spec["id"], first["id"])
            assert [row["decision"] for row in state["reviewers"]] == [None, None] and state["canDecide"]
            with pytest.raises(ValidationError):
                DecisionInput(workspaceId=workspace, decision="CHANGES_REQUESTED", note="  ")
            await verdict(spec, second, "CHANGES_REQUESTED", "Add the error cases.")
            assert (await review_state(db, workspace, spec["id"], author["id"]))["status"] == "DRAFT"
            assert (await inbox(author, "document.changes_requested"), await inbox(lead, "document.changes_requested")) == (1, 1)
            await status(409, verdict(spec, first, "APPROVED"))

            # A lead approves a teammate's document directly, but not their own.
            # VI: Lead duyệt thẳng tài liệu của đồng đội, nhưng không duyệt thẳng tài liệu của mình.
            note = (await create_document(CreateDocumentInput(workspaceId=workspace, teamId=team, title="Note"), author, db))["data"]
            await update(note, author, status="IN_REVIEW")
            assert (await update(note, lead, status="APPROVED"))["status"] == "APPROVED"
            own = (await create_document(CreateDocumentInput(workspaceId=workspace, teamId=team, title="Own"), lead, db))["data"]
            await update(own, lead, status="IN_REVIEW")
            await status(409, update(own, lead, status="APPROVED"))
            await reviewers(own, lead, [lead["id"]])
            await verdict(own, lead, "APPROVED")
            await status(409, update(own, lead, status="APPROVED"))
            await reviewers(own, lead, [lead["id"], first["id"]])
            await verdict(own, first, "APPROVED")
            assert (await update(own, lead, status="APPROVED"))["status"] == "APPROVED"

            # Without a lead, a workspace Owner in the team approves; with nobody, review is refused.
            # VI: Không có lead thì Owner workspace trong team duyệt; không có ai thì không gửi duyệt được.
            for name, members in (("Leaderless", [author, lead]), ("Orphan", [author])):
                other = _cuid()
                await db.execute(
                    text("INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:w,:name,:name,:now,:now)"),
                    {"id": other, "w": workspace, "name": name, "now": now},
                )
                for member in members:
                    await db.execute(
                        text("INSERT INTO team_members(team_id,user_id,role) VALUES (:team,:user,'MEMBER')"),
                        {"team": other, "user": member["id"]},
                    )
                document = (await create_document(CreateDocumentInput(workspaceId=workspace, teamId=other, title=name), author, db))["data"]
                if name == "Orphan":
                    await status(409, update(document, author, status="IN_REVIEW"))
                else:
                    await update(document, author, status="IN_REVIEW")
                    assert [row["id"] for row in (await review_state(db, workspace, document["id"], lead["id"]))["approvers"]] == [lead["id"]]
                    assert (await update(document, lead, status="APPROVED"))["status"] == "APPROVED"
            await db.rollback()
    finally:
        await engine.dispose()
