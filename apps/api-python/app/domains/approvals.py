"""One read-only list of what waits for the signed-in user's approval.

Only documents exist today; each item carries `kind` so another source can join the same lists.
Rows follow document read access and the rules stay in `approval_block`, so the list can never
offer an approval the document page would refuse. Decisions and approvals keep their own endpoints.
VI: Một danh sách chỉ đọc gồm những gì đang chờ người dùng hiện tại phê duyệt.
VI: Hiện chỉ có tài liệu; mỗi phần tử có `kind` để nguồn khác nhập vào cùng danh sách. Dòng hiển thị
VI: theo quyền đọc tài liệu, quy tắc nằm ở `approval_block`, nên danh sách không bao giờ mời duyệt
VI: thứ mà trang tài liệu sẽ từ chối. Quyết định và duyệt vẫn dùng endpoint riêng.
"""

from __future__ import annotations

from typing import Any, Mapping

from fastapi import Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.utc_responses import UtcAPIRouter as APIRouter
from ..db.session import get_session
from ..modules.access.membership import _workspace_role
from ..modules.access.team_scope import workspace_team_scope
from ..modules.work_items.document_review import approval_block, approver_ids
from .auth import current_user


router = APIRouter(prefix='/api/v1/approvals', tags=['approvals'])

# shortcut: only the newest documents are checked, so a workspace with more than this many in review
# undercounts; filter in SQL if that ever happens. VI: chỉ kiểm tra các tài liệu mới nhất, workspace
# có nhiều hơn số này đang duyệt sẽ đếm thiếu; khi đó chuyển việc lọc sang SQL.
IN_REVIEW_LIMIT = 500
LIST_LIMIT = 100

COLUMNS = """d.id,d.title,d.doc_type,d.status,d.version,d.updated_at,d.team_id,d.created_by,
    author.name AS author_name,team.name AS team_name,
    project.id AS project_id,project.name AS project_name,project.identifier AS project_identifier"""
JOINS = """LEFT JOIN users author ON author.id=d.created_by
    LEFT JOIN teams team ON team.id=d.team_id
    LEFT JOIN document_folders folder ON folder.id=d.folder_id
    LEFT JOIN projects project ON project.id=folder.project_id"""
SCOPE = workspace_team_scope('d')


def _item(row: Mapping[str, Any], reviewers: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        'kind': 'document',
        'id': row['id'],
        'title': row['title'],
        'docType': row['doc_type'],
        'status': row['status'],
        'version': row['version'],
        'updatedAt': row['updated_at'],
        'team': {'id': row['team_id'], 'name': row['team_name']} if row['team_id'] else None,
        'project': (
            {'id': row['project_id'], 'name': row['project_name'], 'identifier': row['project_identifier']}
            if row['project_id']
            else None
        ),
        'author': {'id': row['created_by'], 'name': row['author_name']},
        'progress': {
            'agreed': sum(reviewer['decision'] == 'APPROVED' for reviewer in reviewers),
            'total': len(reviewers),
        },
    }


async def _rows(
    db: AsyncSession, workspace_id: str, user_id: str, where: str, *, limit: int
) -> list[dict[str, Any]]:
    result = await db.execute(
        text(f"""SELECT {COLUMNS} FROM documents d {JOINS}
        WHERE {SCOPE} AND {where} ORDER BY d.updated_at DESC,d.id LIMIT :limit"""),
        {'workspace': workspace_id, 'user': user_id, 'limit': limit},
    )
    return [dict(row) for row in result.mappings().all()]


async def _reviewers(db: AsyncSession, document_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {document_id: [] for document_id in document_ids}
    result = await db.execute(
        text("""SELECT r.document_id,r.reviewer_id AS id,r.decision,r.note,u.name
        FROM document_reviewers r JOIN users u ON u.id=r.reviewer_id
        WHERE r.document_id=ANY(CAST(:ids AS text[])) ORDER BY r.assigned_at,r.reviewer_id"""),
        {'ids': document_ids},
    )
    for row in result.mappings().all():
        grouped[row['document_id']].append(dict(row))
    return grouped


async def _waiting(
    db: AsyncSession, workspace_id: str, user_id: str, role: str
) -> list[dict[str, Any]]:
    """In-review documents the user can act on now: decide as reviewer, or approve.
    The reviewer role wins while their own decision is open, since approval needs it first.
    VI: Tài liệu Đang duyệt mà người dùng xử lý được ngay: quyết định với vai trò reviewer, hoặc
    VI: duyệt. Vai trò reviewer được ưu tiên khi họ chưa quyết định, vì duyệt cần quyết định đó.
    """
    rows = await _rows(db, workspace_id, user_id, "d.status='IN_REVIEW'", limit=IN_REVIEW_LIMIT)
    reviewers = await _reviewers(db, [row['id'] for row in rows])
    approvers = {
        team_id: await approver_ids(db, workspace_id, team_id)
        for team_id in {row['team_id'] for row in rows}
    }
    items = []
    for row in rows:
        assigned = reviewers[row['id']]
        if any(reviewer['id'] == user_id and reviewer['decision'] is None for reviewer in assigned):
            items.append({**_item(row, assigned), 'role': 'REVIEWER'})
        elif not approval_block(
            row, approvers[row['team_id']], assigned, user_id,
            allow_own_approval=role in ('OWNER', 'ADMIN'),
        ):
            items.append({**_item(row, assigned), 'role': 'APPROVER'})
    return items


async def _submitted(db: AsyncSession, workspace_id: str, user_id: str) -> list[dict[str, Any]]:
    """The user's documents still in the flow: in review, or returned with a change request.
    An edit clears decisions (`document_review_reset`), so a saved fix leaves this list.
    VI: Tài liệu của người dùng còn trong luồng: đang duyệt, hoặc bị trả về với yêu cầu sửa.
    VI: Sửa nội dung sẽ xoá quyết định (`document_review_reset`), nên lưu bản sửa thì rời danh sách.
    """
    rows = await _rows(
        db, workspace_id, user_id,
        """d.created_by=:user AND (d.status='IN_REVIEW' OR (d.status='DRAFT' AND EXISTS(
            SELECT 1 FROM document_reviewers r
            WHERE r.document_id=d.id AND r.decision='CHANGES_REQUESTED')))""",
        limit=LIST_LIMIT,
    )
    reviewers = await _reviewers(db, [row['id'] for row in rows])
    return [
        {
            **_item(row, reviewers[row['id']]),
            'changeRequests': [
                {'name': reviewer['name'], 'note': reviewer['note']}
                for reviewer in reviewers[row['id']]
                if reviewer['decision'] == 'CHANGES_REQUESTED'
            ],
        }
        for row in rows
    ]


async def _done(db: AsyncSession, workspace_id: str, user_id: str) -> list[dict[str, Any]]:
    """Documents the user decided or approved, newest first.
    The audit log keeps decisions after a new round clears them from `document_reviewers`, but
    not their value, so `decision` is null for a past round.
    VI: Tài liệu người dùng đã quyết định hoặc đã duyệt, mới nhất trước.
    VI: Nhật ký audit giữ lại quyết định sau khi vòng mới xoá chúng khỏi `document_reviewers`,
    VI: nhưng không lưu giá trị, nên `decision` là null với vòng trước.
    """
    result = await db.execute(
        text(f"""WITH handled AS (
            SELECT entity_id AS document_id,max(created_at) AS handled_at FROM audit_logs
            WHERE workspace_id=:workspace AND actor_id=:user AND entity_type='document'
              AND action='document.review_decided'
            GROUP BY entity_id
            UNION ALL
            SELECT document_id,max(approved_at) FROM document_releases
            WHERE approved_by=:user GROUP BY document_id
        ), latest AS (
            SELECT document_id,max(handled_at) AS handled_at FROM handled GROUP BY document_id
        )
        SELECT {COLUMNS},latest.handled_at,mine.decision,
            (SELECT max(r.release) FROM document_releases r
             WHERE r.document_id=d.id AND r.approved_by=:user) AS own_release
        FROM latest JOIN documents d ON d.id=latest.document_id {JOINS}
        LEFT JOIN document_reviewers mine ON mine.document_id=d.id AND mine.reviewer_id=:user
        WHERE {SCOPE} ORDER BY latest.handled_at DESC,d.id LIMIT :limit"""),
        {'workspace': workspace_id, 'user': user_id, 'limit': LIST_LIMIT},
    )
    rows = result.mappings().all()
    reviewers = await _reviewers(db, [row['id'] for row in rows])
    return [
        {
            **_item(row, reviewers[row['id']]),
            'handledAt': row['handled_at'],
            'decision': row['decision'],
            'release': row['own_release'],
        }
        for row in rows
    ]


@router.get('')
async def list_approvals(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    role = await _workspace_role(db, workspaceId, user['id'])
    return {
        'data': {
            'waiting': await _waiting(db, workspaceId, user['id'], role),
            'submitted': await _submitted(db, workspaceId, user['id']),
            'done': await _done(db, workspaceId, user['id']),
        }
    }
