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
    approver_ids,
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
            # Batch assignments share a timestamp; ID tie-breaking need not match request order.
            # VI: Phân công cùng đợt có chung thời điểm; thứ tự theo ID không nhất thiết khớp request.
            assert {row["name"] for row in state["reviewers"]} == {"First reviewer", "Second reviewer"}
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

            # An ordinary lead keeps the author check; privileged owners are covered separately.
            # VI: Lead thường vẫn bị kiểm tra tác giả; Owner đặc quyền được kiểm tra riêng.
            note = (await create_document(CreateDocumentInput(workspaceId=workspace, teamId=team, title="Note"), author, db))["data"]
            await update(note, author, status="IN_REVIEW")
            assert (await update(note, lead, status="APPROVED"))["status"] == "APPROVED"
            regular_lead = await add_member(db, workspace, team, team_role="LEAD", name="Ordinary lead")
            own = (await create_document(CreateDocumentInput(workspaceId=workspace, teamId=team, title="Own"), regular_lead, db))["data"]
            await update(own, regular_lead, status="IN_REVIEW")
            await status(409, update(own, regular_lead, status="APPROVED"))
            await reviewers(own, regular_lead, [regular_lead["id"]])
            await verdict(own, regular_lead, "APPROVED")
            await status(409, update(own, regular_lead, status="APPROVED"))
            await reviewers(own, regular_lead, [regular_lead["id"], first["id"]])
            await verdict(own, first, "APPROVED")
            assert (await update(own, regular_lead, status="APPROVED"))["status"] == "APPROVED"

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


@pytest.mark.skipif(not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured")
@pytest.mark.parametrize("role", ["OWNER", "ADMIN"])
def test_owner_admin_approval_with_active_leads_and_access_boundaries(role):
    asyncio.run(verify_workspace_approver(role))


async def verify_workspace_approver(role):
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            owner = {"id": _cuid(), "name": "Owner"}
            now = _utcnow()
            await db.execute(text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"), {**owner, "email":_cuid()+"@example.test","now":now})
            seed = await create_workspace_bootstrap(db,user_id=owner["id"],organization_name="Approval roles",workspace_name=_cuid(),now=now)
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.execute(text("UPDATE team_members SET role='MEMBER' WHERE team_id=:team AND user_id=:user"), {"team":team,"user":owner["id"]})
            lead = await add_member(db,workspace,team,team_role="LEAD",name="Team lead")
            actor = owner if role == "OWNER" else await add_member(db,workspace,team,role="ADMIN",name="Admin")
            reviewer = await add_member(db,workspace,team,name="Reviewer")
            readonly = await add_member(db,workspace,team,role="ADMIN_VIEWER",team_role="LEAD",name="Read only lead")
            inactive = await add_member(db,workspace,team,role="ADMIN",name="Suspended admin")
            await db.execute(text("UPDATE users SET status='SUSPENDED' WHERE id=:id"), {"id":inactive["id"]})
            suspended = await add_member(db,workspace,team,role="ADMIN",name="Suspended membership")
            await db.execute(text("UPDATE workspace_members SET status='SUSPENDED' WHERE workspace_id=:workspace AND user_id=:id"), {"workspace":workspace,"id":suspended["id"]})
            outside = await add_member(db,workspace,role="ADMIN",name="Other team admin")
            foreign = await add_member(db,workspace,role="ADMIN",name="Other workspace admin")
            await db.execute(text("DELETE FROM workspace_members WHERE workspace_id=:workspace AND user_id=:id"), {"workspace":workspace,"id":foreign["id"]})
            await create_workspace_bootstrap(db,user_id=foreign["id"],organization_name="Foreign",workspace_name=_cuid(),now=now)
            ids = await approver_ids(db,workspace,team)
            assert {owner["id"],actor["id"],lead["id"]} <= set(ids)
            assert not ({readonly["id"],inactive["id"],suspended["id"],outside["id"],foreign["id"]} & set(ids))

            async def update(document, by, status):
                return (await update_document(document["id"],UpdateDocumentInput(status=status),workspace,by,db))["data"]

            own = (await create_document(CreateDocumentInput(workspaceId=workspace,teamId=team,title="Self authored"),actor,db))["data"]
            with pytest.raises(ApiError) as draft:
                await update(own,actor,"APPROVED")
            assert draft.value.status_code == 409
            await update(own,actor,"IN_REVIEW")
            state = await review_state(db,workspace,own["id"],actor["id"])
            assert state["canApprove"] and state["canAssign"] and state["approveBlockedReason"] is None
            for denied in [readonly,inactive,reviewer]:
                assert not (await review_state(db,workspace,own["id"],denied["id"]))["canApprove"]
                with pytest.raises(ApiError) as error:
                    await update(own,denied,"APPROVED")
                assert error.value.status_code == 403
            for denied in [outside,foreign,suspended]:
                with pytest.raises(ApiError) as error:
                    await review_state(db,workspace,own["id"],denied["id"])
                assert error.value.status_code == 403
            await set_reviewers(db,own["id"],ReviewersInput(workspaceId=workspace,reviewerIds=[reviewer["id"]]),actor)
            assert not (await review_state(db,workspace,own["id"],actor["id"]))["canApprove"]
            with pytest.raises(ApiError) as pending:
                await update(own,actor,"APPROVED")
            assert pending.value.status_code == 409
            await decide(db,own["id"],DecisionInput(workspaceId=workspace,decision="APPROVED"),reviewer)
            approved = await update(own,actor,"APPROVED")
            assert (approved["status"],approved["release"]) == ("APPROVED",1)
            unassigned = (await create_document(CreateDocumentInput(workspaceId=workspace,teamId=team,title="No assigned reviewers"),actor,db))["data"]
            await update(unassigned,actor,"IN_REVIEW")
            assert (await update(unassigned,actor,"APPROVED"))["release"] == 1
            global_doc = (await create_document(CreateDocumentInput(workspaceId=workspace,title="Workspace document"),actor,db))["data"]
            await update(global_doc,actor,"IN_REVIEW")
            assert (await update(global_doc,actor,"APPROVED"))["status"] == "APPROVED"
            await db.rollback()
    finally:
        await engine.dispose()
