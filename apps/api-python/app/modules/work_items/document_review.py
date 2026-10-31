"""Document review: the team lead receives submitted documents, may assign team members as
reviewers, and alone approves the document once every assigned reviewer agreed.

Approvers are the LEAD members of the document's team; a team without an active lead falls back
to workspace Owners/Admins who are members of that team (team documents are readable by team
members only). A document without a team is approved by workspace Owners/Admins. A lead who
wrote the document needs at least one other reviewer's approval. Decisions belong to one review
round: the `document_review_reset` trigger clears them when the document enters In review again
or its title or content changes.
VI: Duyệt tài liệu: lead của team nhận tài liệu được gửi duyệt, có thể giao thành viên team làm
VI: reviewer, và chỉ lead được duyệt cuối khi mọi reviewer được giao đã đồng ý. Người duyệt cuối
VI: là thành viên LEAD của team sở hữu tài liệu; team không có lead đang hoạt động thì dùng
VI: Owner/Admin workspace là thành viên team đó (tài liệu team chỉ thành viên team đọc được). Tài
VI: liệu không thuộc team do Owner/Admin workspace duyệt. Lead là tác giả cần ít nhất một reviewer
VI: khác đồng ý. Quyết định thuộc về một vòng duyệt: trigger `document_review_reset` xoá chúng khi
VI: tài liệu vào lại Đang duyệt hoặc đổi tiêu đề, nội dung.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...modules.notifications.outbox import stage_notifications
from ...services.notification_events import create_notification_batch
from ..audit.write import record_change
from .document_repository import _team_access

Decision = Literal["APPROVED", "CHANGES_REQUESTED"]


class ReviewersInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    reviewerIds: list[str] = Field(max_length=20)


class DecisionInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    decision: Decision
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def note_for_changes(self):
        # A change request without a reason gives the author nothing to fix.
        # VI: Yêu cầu sửa không kèm lý do thì tác giả không biết sửa gì.
        if self.decision == "CHANGES_REQUESTED" and not (self.note or "").strip():
            raise ValueError("Explain what needs to change.")
        return self


ACTIVE_MEMBER = """EXISTS(SELECT 1 FROM workspace_members wm JOIN users u ON u.id=wm.user_id
    WHERE wm.workspace_id=:workspace AND wm.user_id={user} AND wm.status='ACTIVE' AND u.status='ACTIVE')"""


async def approver_ids(db: AsyncSession, workspace_id: str, team_id: str | None) -> list[str]:
    """Users who assign reviewers and approve documents of `team_id`, oldest membership first.
    VI: Người giao reviewer và duyệt tài liệu của `team_id`, thành viên lâu nhất trước.
    """
    params = {"workspace": workspace_id, "team": team_id}
    if team_id:
        leads = (
            await db.execute(
                text(f"""SELECT tm.user_id FROM team_members tm WHERE tm.team_id=:team AND tm.role='LEAD'
                AND {ACTIVE_MEMBER.format(user='tm.user_id')} ORDER BY tm.created_at, tm.user_id"""),
                params,
            )
        ).scalars().all()
        if leads:
            return list(leads)
    team_filter = (
        "AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=:team AND tm.user_id=wm.user_id)"
        if team_id
        else ""
    )
    return list(
        (
            await db.execute(
                text(f"""SELECT wm.user_id FROM workspace_members wm JOIN users u ON u.id=wm.user_id
                WHERE wm.workspace_id=:workspace AND wm.status='ACTIVE' AND u.status='ACTIVE'
                AND wm.role IN ('OWNER','ADMIN') {team_filter} ORDER BY wm.user_id"""),
                params,
            )
        ).scalars().all()
    )


async def _reviewers(db: AsyncSession, document_id: str) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text("""SELECT r.reviewer_id,r.decision,r.note,r.decided_at,r.assigned_at,u.name,u.avatar_url
            FROM document_reviewers r JOIN users u ON u.id=r.reviewer_id
            WHERE r.document_id=:id ORDER BY r.assigned_at,r.reviewer_id"""),
            {"id": document_id},
        )
    ).mappings().all()
    return [
        {
            "id": row["reviewer_id"],
            "name": row["name"],
            "avatarUrl": row["avatar_url"],
            "decision": row["decision"],
            "note": row["note"],
            "decidedAt": row["decided_at"],
            "assignedAt": row["assigned_at"],
        }
        for row in rows
    ]


def approval_block(
    document: dict, approvers: list[str], reviewers: list[dict], user_id: str
) -> tuple[int, str] | None:
    """Why `user_id` cannot approve `document` now, as (HTTP status, message); None when allowed.
    VI: Lý do `user_id` chưa duyệt được `document`, dạng (mã HTTP, thông báo); None khi được duyệt.
    """
    if user_id not in approvers:
        return 403, "Only a team lead can approve this document."
    if document["status"] != "IN_REVIEW":
        return 409, "Submit the document for review before approving it."
    pending = [row for row in reviewers if row["decision"] != "APPROVED"]
    if pending:
        return 409, f"{len(pending)} reviewer(s) have not approved this version yet."
    if document["created_by"] == user_id and not any(
        row["id"] != user_id for row in reviewers
    ):
        return 409, "You wrote this document: another reviewer must approve it first."
    return None


async def _locked(db: AsyncSession, workspace_id: str, document_id: str, user_id: str) -> dict:
    row = (
        await db.execute(
            text("""SELECT * FROM documents WHERE id=:id AND workspace_id=:workspace
            AND archived_at IS NULL FOR UPDATE"""),
            {"id": document_id, "workspace": workspace_id},
        )
    ).mappings().first()
    if not row:
        raise ApiError(404, "Document not found.", "Not Found")
    await _team_access(db, workspace_id, row["team_id"], user_id)
    return dict(row)


async def review_state(
    db: AsyncSession, workspace_id: str, document_id: str, user_id: str
) -> dict[str, Any]:
    """Approvers, reviewers with their decisions, and what `user_id` may do on the document.
    VI: Người duyệt cuối, reviewer kèm quyết định, và những gì `user_id` được làm với tài liệu.
    """
    row = (
        await db.execute(
            text("SELECT * FROM documents WHERE id=:id AND workspace_id=:workspace AND archived_at IS NULL"),
            {"id": document_id, "workspace": workspace_id},
        )
    ).mappings().first()
    if not row:
        raise ApiError(404, "Document not found.", "Not Found")
    await _team_access(db, workspace_id, row["team_id"], user_id)
    approvers = await approver_ids(db, workspace_id, row["team_id"])
    reviewers = await _reviewers(db, document_id)
    people = (
        await db.execute(
            text("SELECT id,name,avatar_url FROM users WHERE id=ANY(CAST(:ids AS text[]))"),
            {"ids": approvers},
        )
    ).mappings().all()
    names = {person["id"]: person for person in people}
    block = approval_block(dict(row), approvers, reviewers, user_id)
    in_review = row["status"] == "IN_REVIEW"
    can_assign = in_review and user_id in approvers
    # Only a lead picks reviewers, so only a lead receives the team's member list.
    # VI: Chỉ lead chọn reviewer, nên chỉ lead nhận danh sách thành viên team.
    members = (
        (
            await db.execute(
                text(f"""SELECT u.id,u.name,u.avatar_url FROM users u
                WHERE {"EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=:team AND tm.user_id=u.id) AND" if row["team_id"] else ""}
                {ACTIVE_MEMBER.format(user='u.id')} ORDER BY u.name,u.id LIMIT 500"""),
                {"team": row["team_id"], "workspace": workspace_id},
            )
        ).mappings().all()
        if can_assign
        else []
    )
    return {
        "documentId": document_id,
        "status": row["status"],
        "authorId": row["created_by"],
        "approvers": [
            {"id": key, "name": names[key]["name"], "avatarUrl": names[key]["avatar_url"]}
            for key in approvers
            if key in names
        ],
        "reviewers": reviewers,
        "members": [
            {"id": person["id"], "name": person["name"], "avatarUrl": person["avatar_url"]}
            for person in members
        ],
        "canAssign": can_assign,
        "canDecide": in_review and any(item["id"] == user_id for item in reviewers),
        "canApprove": block is None,
        "approveBlockedReason": block[1] if block and user_id in approvers else None,
    }


async def _notify(
    db: AsyncSession,
    document: dict,
    recipients: set[str],
    actor: Any,
    event: str,
    message: str,
    body: str | None = None,
) -> None:
    batch = await create_notification_batch(
        db,
        workspace_id=document["workspace_id"],
        recipient_ids=recipients,
        actor=actor,
        event_type=event,
        entity_type="document",
        entity_id=document["id"],
        title=document["title"],
        message=message,
        entity_path=f"/documents/{document['id']}",
        body=body,
        discord=False,
    )
    await stage_notifications(db, batch, workspace_id=document["workspace_id"])


async def check_status_change(db: AsyncSession, before: dict, status: str, user: Any) -> None:
    """Refuses a status change the review rules forbid; runs before the document is updated.
    VI: Từ chối việc đổi trạng thái mà quy tắc duyệt không cho; chạy trước khi cập nhật tài liệu.
    """
    if status == before["status"]:
        return
    approvers = await approver_ids(db, before["workspace_id"], before["team_id"])
    if status == "IN_REVIEW" and not approvers:
        raise ApiError(409, "This team needs a lead to review documents.", "Conflict")
    if status == "APPROVED":
        block = approval_block(before, approvers, await _reviewers(db, before["id"]), user["id"])
        if block:
            raise ApiError(block[0], block[1], "Forbidden" if block[0] == 403 else "Conflict")


async def announce_status_change(db: AsyncSession, before: dict | None, after: dict, user: Any) -> None:
    """Notifies people of a submitted or approved document; runs after the document is saved.
    VI: Thông báo khi tài liệu được gửi duyệt hoặc được duyệt; chạy sau khi đã lưu tài liệu.
    """
    if before is not None and before["status"] == after["status"]:
        return
    if after["status"] == "IN_REVIEW":
        recipients = set(await approver_ids(db, after["workspace_id"], after["team_id"]))
        recipients |= {row["id"] for row in await _reviewers(db, after["id"])}
        await _notify(db, after, recipients, user, "document.review_requested", "submitted a document for review")
    elif after["status"] == "APPROVED":
        await _notify(db, after, {after["created_by"]}, user, "document.approved", "approved a document")


async def set_reviewers(
    db: AsyncSession, document_id: str, payload: ReviewersInput, user: Any
) -> dict[str, Any]:
    document = await _locked(db, payload.workspaceId, document_id, user["id"])
    if user["id"] not in await approver_ids(db, payload.workspaceId, document["team_id"]):
        raise ApiError(403, "Only a team lead can assign reviewers.", "Forbidden")
    if document["status"] != "IN_REVIEW":
        raise ApiError(409, "Reviewers are assigned while the document is in review.", "Conflict")
    wanted = list(dict.fromkeys(payload.reviewerIds))
    if wanted:
        members = set(
            (
                await db.execute(
                    text(f"""SELECT tm.user_id FROM team_members tm WHERE tm.team_id=:team
                    AND tm.user_id=ANY(CAST(:ids AS text[])) AND {ACTIVE_MEMBER.format(user='tm.user_id')}"""),
                    {"team": document["team_id"], "ids": wanted, "workspace": payload.workspaceId},
                )
            ).scalars().all()
        ) if document["team_id"] else set(
            (
                await db.execute(
                    text(f"""SELECT u.id FROM users u WHERE u.id=ANY(CAST(:ids AS text[]))
                    AND {ACTIVE_MEMBER.format(user='u.id')}"""),
                    {"ids": wanted, "workspace": payload.workspaceId},
                )
            ).scalars().all()
        )
        if len(members) != len(wanted):
            raise ApiError(400, "Reviewers must be active members of the document's team.", "Bad Request")
    current = {row["id"] for row in await _reviewers(db, document_id)}
    await db.execute(
        text("DELETE FROM document_reviewers WHERE document_id=:id AND NOT reviewer_id=ANY(CAST(:ids AS text[]))"),
        {"id": document_id, "ids": wanted},
    )
    added = [reviewer for reviewer in wanted if reviewer not in current]
    for reviewer in added:
        await db.execute(
            text("""INSERT INTO document_reviewers (document_id,reviewer_id,assigned_by,assigned_at)
            VALUES (:id,:reviewer,:by,:now)"""),
            {"id": document_id, "reviewer": reviewer, "by": user["id"], "now": _utcnow()},
        )
    if added or len(current - set(wanted)):
        await record_change(
            db, payload.workspaceId, user["id"], "document.reviewers_updated", "document", document_id,
            fields={"reviewerIds": wanted},
        )
    if added:
        await _notify(db, document, set(added), user, "document.review_assigned", "asked you to review a document")
    return await review_state(db, payload.workspaceId, document_id, user["id"])


async def decide(
    db: AsyncSession, document_id: str, payload: DecisionInput, user: Any
) -> dict[str, Any]:
    document = await _locked(db, payload.workspaceId, document_id, user["id"])
    if document["status"] != "IN_REVIEW":
        raise ApiError(409, "The document is not in review.", "Conflict")
    note = (payload.note or "").strip() or None
    updated = (
        await db.execute(
            text("""UPDATE document_reviewers SET decision=:decision,note=:note,decided_at=:now
            WHERE document_id=:id AND reviewer_id=:user RETURNING reviewer_id"""),
            {"decision": payload.decision, "note": note, "now": _utcnow(), "id": document_id, "user": user["id"]},
        )
    ).first()
    if not updated:
        raise ApiError(403, "You are not a reviewer of this document.", "Forbidden")
    await record_change(
        db, payload.workspaceId, user["id"], "document.review_decided", "document", document_id,
        fields={"decision": payload.decision},
    )
    approvers = set(await approver_ids(db, payload.workspaceId, document["team_id"]))
    if payload.decision == "CHANGES_REQUESTED":
        # The author fixes a draft; the change request stays visible until the next submission.
        # VI: Tác giả sửa bản nháp; yêu cầu sửa vẫn hiển thị cho tới lần gửi duyệt kế tiếp.
        await db.execute(
            text("UPDATE documents SET status='DRAFT',updated_by=:user,updated_at=:now WHERE id=:id"),
            {"id": document_id, "user": user["id"], "now": _utcnow()},
        )
        await _notify(
            db, document, approvers | {document["created_by"]}, user,
            "document.changes_requested", "requested changes to a document", note,
        )
    elif all(row["decision"] == "APPROVED" for row in await _reviewers(db, document_id)):
        await _notify(db, document, approvers, user, "document.review_completed", "finished reviewing a document")
    return await review_state(db, payload.workspaceId, document_id, user["id"])
