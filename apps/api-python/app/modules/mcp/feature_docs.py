"""Feature documents (FDS/TDS) for agents: read what a task's feature already documents and
create or update the FDS/TDS of a module/feature in the project's document tree.

VI: Tài liệu tính năng (FDS/TDS) cho agent: đọc tài liệu sẵn có của tính năng mà task thuộc
về, và tạo hoặc cập nhật FDS/TDS của một module/tính năng trong cây tài liệu của dự án.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import text

from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ..work_items import documents
from ..work_items.contracts import CreateDocumentInput, UpdateDocumentInput
from ..work_items.document_tree import create_folder, scaffold_project_tree

CHANGE_LOG_HEADING = "## Lịch sử thay đổi"
# Linked documents are returned with content so an agent can edit them in one step; longer
# documents are cut here and read in full through get_document.
# VI: Tài liệu liên kết được trả kèm nội dung để agent sửa ngay; tài liệu dài hơn bị cắt ở
# VI: mức này và đọc đầy đủ qua get_document.
CONTENT_LIMIT = 20000
MISSING_WARNING = (
    "No FDS/TDS is linked to this task. Before coding, write or update the feature's "
    "FDS/TDS with upsert_feature_doc."
)


def with_change_entry(content: str, task: str, summary: str, day: date) -> str:
    """Append one row to the document's change log, creating the section at the end.

    The row is `| YYYY-MM-DD | <task> | <summary> |`; pipes and line breaks in the summary
    are flattened so the table stays valid. An existing log gets the row at the end of the
    document, which is where this function always places the section.
    VI: Thêm một dòng vào bảng lịch sử thay đổi, tạo mục này ở cuối nếu chưa có. Dòng có dạng
    VI: `| YYYY-MM-DD | <task> | <tóm tắt> |`; ký tự `|` và xuống dòng trong tóm tắt được làm
    VI: phẳng để bảng không vỡ. Bảng đã có thì dòng được thêm vào cuối tài liệu, đúng vị trí
    VI: mà hàm này luôn đặt mục lịch sử.
    """
    cleaned = " ".join(summary.replace("|", "/").split())
    body = content.rstrip()
    if CHANGE_LOG_HEADING not in body:
        body += f"\n\n{CHANGE_LOG_HEADING}\n\n| Ngày | Task | Thay đổi |\n|---|---|---|"
    return f"{body}\n| {day.isoformat()} | {task} | {cleaned} |\n"


def _summary(row: Any, *, content: bool = False) -> dict[str, Any]:
    result = {
        "id": row["id"],
        "title": row["title"],
        "docType": row["doc_type"],
        "status": row["status"],
        "version": row["version"],
        "folderId": row["folder_id"],
        "updatedAt": row["updated_at"],
    }
    if content:
        result["content"] = row["content"][:CONTENT_LIMIT]
        result["truncated"] = len(row["content"]) > CONTENT_LIMIT
    return result


async def read_feature_docs(db, policy, issue_id: str) -> dict[str, Any]:
    """FDS/TDS linked to an issue (with content) and the feature folders of its project.

    `features` lists every `module / feature` folder with its FDS/TDS (without content) so
    the agent can pick the right place; `warning` is set when the issue has no FDS/TDS yet.
    Documents outside the connection's scope are left out, like every other read.
    VI: FDS/TDS liên kết với issue (kèm nội dung) và các thư mục tính năng của dự án. `features`
    VI: liệt kê mọi thư mục `module / tính năng` cùng FDS/TDS của nó (không kèm nội dung) để
    VI: agent chọn đúng chỗ; `warning` có giá trị khi issue chưa có FDS/TDS. Tài liệu ngoài
    VI: phạm vi của kết nối bị loại ra như mọi thao tác đọc khác.
    """
    issue = await policy.issue(issue_id)
    params = {**policy.params, "issue": issue["id"]}
    linked = (
        await db.execute(
            text(
                f"""SELECT d.* FROM documents d WHERE {policy.document_clause()}
                AND d.doc_type IN ('FDS','TDS')
                AND EXISTS(SELECT 1 FROM document_links l WHERE l.document_id=d.id AND l.issue_id=:issue)
                ORDER BY d.doc_type, d.title"""
            ),
            params,
        )
    ).mappings().all()
    features: list[dict[str, Any]] = []
    if issue["project_id"]:
        folders = (
            await db.execute(
                text(
                    """SELECT f.id, f.name, m.name AS module FROM document_folders f
                    JOIN document_folders m ON m.id = f.parent_id
                    WHERE f.workspace_id=:workspace AND f.project_id=:project AND f.kind='feature'
                    ORDER BY m.name, f.name"""
                ),
                {"workspace": policy.params["workspace"], "project": issue["project_id"]},
            )
        ).mappings().all()
        docs = (
            await db.execute(
                text(
                    f"""SELECT d.* FROM documents d WHERE {policy.document_clause()}
                    AND d.doc_type IN ('FDS','TDS') AND d.folder_id = ANY(CAST(:folders AS text[]))
                    ORDER BY d.doc_type, d.title"""
                ),
                {**params, "folders": [folder["id"] for folder in folders]},
            )
        ).mappings().all()
        features = [
            {
                "folderId": folder["id"],
                "module": folder["module"],
                "feature": folder["name"],
                "documents": [_summary(d) for d in docs if d["folder_id"] == folder["id"]],
            }
            for folder in folders
        ]
    return {
        "issueId": issue["id"],
        "identifier": issue["identifier"],
        "projectId": issue["project_id"],
        "linked": [_summary(row, content=True) for row in linked],
        "features": features,
        "warning": None if linked else MISSING_WARNING,
    }


async def _child_folder(db, *, workspace_id, user_id, parent_id, name, kind) -> str:
    existing = (
        await db.execute(
            text(
                "SELECT id FROM document_folders WHERE parent_id=:parent AND lower(name)=lower(:name)"
            ),
            {"parent": parent_id, "name": name},
        )
    ).scalar_one_or_none()
    if existing:
        return existing
    folder = await create_folder(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        team_id=None,
        name=name,
        parent_id=parent_id,
        kind=kind,
    )
    return folder["id"]


async def upsert_feature_doc(db, principal, issue: dict, payload) -> dict[str, Any]:
    """Create or update the FDS/TDS of `module / feature` and link it to the issue.

    Missing project root, module and feature folders are created (folder names match
    case-insensitively). The document is the feature folder's first FDS or TDS; a new one is
    titled `<docType> · <feature>`. Content replaces the current version (a new revision)
    and gets a change-log row naming the task and `changeSummary`. Requires the issue to
    belong to a project with a team.
    VI: Tạo hoặc cập nhật FDS/TDS của `module / tính năng` và liên kết với issue. Thư mục gốc
    VI: dự án, module và tính năng còn thiếu sẽ được tạo (tên thư mục so khớp không phân biệt
    VI: hoa thường). Tài liệu là FDS hoặc TDS đầu tiên trong thư mục tính năng; tài liệu mới có
    VI: tiêu đề `<docType> · <tính năng>`. Nội dung thay thế bản hiện tại (tạo revision mới)
    VI: và được thêm một dòng lịch sử ghi task và `changeSummary`. Issue phải thuộc dự án đã
    VI: gắn team.
    """
    workspace_id, user = principal.workspace_id, principal.user
    project_id = issue["project_id"]
    await scaffold_project_tree(db, workspace_id=workspace_id, user_id=user["id"], project_id=project_id)
    root = (
        await db.execute(
            text(
                """SELECT id FROM document_folders WHERE project_id=:project AND parent_id IS NULL
                AND kind='project' ORDER BY created_at LIMIT 1"""
            ),
            {"project": project_id},
        )
    ).scalar_one()
    common = {"workspace_id": workspace_id, "user_id": user["id"]}
    module_id = await _child_folder(db, **common, parent_id=root, name=payload.module, kind="module")
    feature_id = await _child_folder(db, **common, parent_id=module_id, name=payload.feature, kind="feature")
    current = (
        await db.execute(
            text(
                """SELECT id FROM documents WHERE folder_id=:folder AND doc_type=:type
                AND archived_at IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE"""
            ),
            {"folder": feature_id, "type": payload.docType},
        )
    ).scalar_one_or_none()
    content = with_change_entry(payload.content, issue["identifier"], payload.changeSummary, date.today())
    if current:
        result = (
            await documents.update_document(
                current, UpdateDocumentInput(content=content), workspace_id, user, db
            )
        )["data"]
    else:
        result = (
            await documents.create_document(
                CreateDocumentInput(
                    workspaceId=workspace_id,
                    teamId=issue["team_id"],
                    folderId=feature_id,
                    title=f"{payload.docType} · {payload.feature}",
                    content=content,
                    docType=payload.docType,
                ),
                user,
                db,
            )
        )["data"]
    await db.execute(
        text(
            """INSERT INTO document_links (id,document_id,workspace_id,project_id,issue_id)
            VALUES (:id,:document,:workspace,NULL,:issue) ON CONFLICT DO NOTHING"""
        ),
        {"id": _cuid(), "document": result["id"], "workspace": workspace_id, "issue": issue["id"]},
    )
    return {
        "id": result["id"],
        "title": result["title"],
        "docType": result["docType"],
        "status": result["status"],
        "version": result["version"],
        "folderId": feature_id,
        "created": current is None,
    }


async def require_feature_project(policy, issue_id: str) -> dict:
    """The issue, checked to sit in a project the connection may write to.
    VI: Issue, đã kiểm tra thuộc dự án mà kết nối được phép ghi."""
    issue = await policy.issue(issue_id, lock=True)
    if not issue["project_id"]:
        raise ApiError(400, "Add the issue to a project before writing its FDS/TDS.", "Bad Request")
    await policy.destination(issue["project_id"], issue["team_id"])
    return issue
