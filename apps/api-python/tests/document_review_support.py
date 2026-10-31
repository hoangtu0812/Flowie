"""Runs a full document review in tests whose subject is what happens after approval.
VI: Chạy đủ một vòng duyệt tài liệu cho các test có chủ đề là những gì xảy ra sau khi duyệt.
"""

from sqlalchemy import text

from app.domains.auth import _cuid, _utcnow
from app.modules.work_items.contracts import UpdateDocumentInput
from app.modules.work_items.document_review import (
    DecisionInput,
    ReviewersInput,
    decide,
    set_reviewers,
)
from app.modules.work_items.documents import update_document


async def add_member(db, workspace, team=None, *, role="MEMBER", team_role="MEMBER", name="Member"):
    user = {"id": _cuid(), "name": name}
    now = _utcnow()
    await db.execute(
        text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
        {**user, "email": _cuid() + "@example.test", "now": now},
    )
    await db.execute(
        text("""INSERT INTO workspace_members(id,workspace_id,user_id,status,role,created_at,updated_at)
        VALUES (:id,:workspace,:user,'ACTIVE',:role,:now,:now)"""),
        {"id": _cuid(), "workspace": workspace, "user": user["id"], "role": role, "now": now},
    )
    if team:
        await db.execute(
            text("INSERT INTO team_members(team_id,user_id,role) VALUES (:team,:user,:role)"),
            {"team": team, "user": user["id"], "role": team_role},
        )
    return user


async def approve(db, workspace, team, document_id, lead, **values):
    """Submits if needed, has a new team member approve, then `lead` approves.
    VI: Gửi duyệt nếu cần, cho một thành viên mới đồng ý, rồi `lead` duyệt.
    """
    status = (
        await db.execute(text("SELECT status FROM documents WHERE id=:id"), {"id": document_id})
    ).scalar_one()
    if status != "IN_REVIEW":
        await update_document(document_id, UpdateDocumentInput(status="IN_REVIEW"), workspace, lead, db)
    reviewer = await add_member(db, workspace, team, name="Reviewer")
    await set_reviewers(db, document_id, ReviewersInput(workspaceId=workspace, reviewerIds=[reviewer["id"]]), lead)
    await decide(db, document_id, DecisionInput(workspaceId=workspace, decision="APPROVED"), reviewer)
    return (
        await update_document(document_id, UpdateDocumentInput(status="APPROVED", **values), workspace, lead, db)
    )["data"]
