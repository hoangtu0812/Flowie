"""Project document trees: nested folders per team, scoped to a project.

Folders stay owned by a team (team membership is the access rule), may nest under a
parent of the same team, and carry the project whose tree they belong to; a child always
inherits its parent's project. A project's tree is every folder with that project plus
the documents filed in them or linked to the project.
VI: Cây tài liệu theo dự án: thư mục lồng nhau theo team, gắn với một dự án. Thư mục vẫn
thuộc một team (quyền truy cập theo thành viên team), có thể lồng dưới thư mục cha cùng
team và mang dự án của cây chứa nó; thư mục con luôn kế thừa dự án của cha. Cây của một
dự án gồm mọi thư mục thuộc dự án đó cùng tài liệu nằm trong chúng hoặc được liên kết với
dự án.
"""

from __future__ import annotations

from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from .document_repository import _documents, _team_access

FolderKind = Literal["project", "module", "feature", "changes", "general"]
DocType = Literal["FDS", "TDS", "ADR", "RCA", "GUIDE", "OTHER"]
DocStatus = Literal["DRAFT", "IN_REVIEW", "APPROVED"]

# Deep enough for project / module / feature / changes plus a few levels of grouping,
# shallow enough that a tree stays navigable and the ancestor walk stays cheap.
# VI: Đủ sâu cho dự án / module / tính năng / thay đổi và vài tầng nhóm thêm, đủ nông để cây
# VI: còn dễ duyệt và việc dò thư mục tổ tiên vẫn nhẹ.
MAX_FOLDER_DEPTH = 8
DEFAULT_FOLDER_NAME = "General"
SCAFFOLD_FOLDERS = ("00 · Tổng quan", "99 · Vận hành")


def folder_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "teamId": row["team_id"],
        "parentId": row["parent_id"],
        "projectId": row["project_id"],
        "kind": row["kind"],
        "name": row["name"],
        "icon": row["icon"],
        "position": row["position"],
    }


async def _lock_team_folders(db: AsyncSession, team_id: str) -> None:
    # Name checks and default-folder creation read then write; one lock per team keeps
    # two concurrent requests from both passing the check.
    # VI: Kiểm tra trùng tên và tạo thư mục mặc định đọc rồi ghi; một khoá cho mỗi team
    # VI: tránh hai request đồng thời cùng vượt qua bước kiểm tra.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"document-folders:{team_id}"},
    )


async def default_folder(db: AsyncSession, workspace_id: str, team_id: str) -> Any:
    """Return the team's first folder, creating "General" when the team has none.

    Documents of a team always live in a folder, so a team without folders used to make
    every document creation fail; the first document now creates the folder instead.
    VI: Trả về thư mục đầu tiên của team, tạo "General" nếu team chưa có thư mục nào. Tài
    VI: liệu của team luôn nằm trong một thư mục, nên team chưa có thư mục từng làm mọi lần
    VI: tạo tài liệu thất bại; giờ tài liệu đầu tiên sẽ tạo thư mục này.
    """
    query = text(
        """SELECT * FROM document_folders WHERE workspace_id = :workspace AND team_id = :team
           ORDER BY (parent_id IS NOT NULL), position ASC, created_at ASC, id ASC LIMIT 1"""
    )
    params = {"workspace": workspace_id, "team": team_id}
    folder = (await db.execute(query, params)).mappings().first()
    if folder:
        return folder
    await _lock_team_folders(db, team_id)
    folder = (await db.execute(query, params)).mappings().first()
    if folder:
        return folder
    now = _utcnow()
    await db.execute(
        text(
            """INSERT INTO document_folders (id, workspace_id, team_id, kind, name, icon, position, created_at, updated_at)
               VALUES (:id, :workspace, :team, 'general', :name, '📁', 0, :now, :now)"""
        ),
        {"id": _cuid(), **params, "name": DEFAULT_FOLDER_NAME, "now": now},
    )
    return (await db.execute(query, params)).mappings().first()


async def _project_team(db: AsyncSession, workspace_id: str, project_id: str, user_id: str) -> str:
    row = (
        await db.execute(
            text(
                "SELECT team_id FROM projects WHERE id = :id AND workspace_id = :workspace AND archived_at IS NULL"
            ),
            {"id": project_id, "workspace": workspace_id},
        )
    ).mappings().first()
    if not row:
        raise ApiError(404, "Project not found.", "Not Found")
    if not row["team_id"]:
        raise ApiError(
            400,
            "Assign the project to a team before building its document tree.",
            "Bad Request",
        )
    await _team_access(db, workspace_id, row["team_id"], user_id)
    return row["team_id"]


async def _folder_row(db: AsyncSession, workspace_id: str, folder_id: str) -> Any:
    row = (
        await db.execute(
            text("SELECT * FROM document_folders WHERE id = :id AND workspace_id = :workspace"),
            {"id": folder_id, "workspace": workspace_id},
        )
    ).mappings().first()
    if not row:
        raise ApiError(404, "Document folder not found.", "Not Found")
    return row


async def _ancestors(db: AsyncSession, folder_id: str) -> list[str]:
    """Ids from `folder_id` up to its root, inclusive. VI: Id từ `folder_id` lên tới gốc."""
    rows = (
        await db.execute(
            text(
                """WITH RECURSIVE chain(id, parent_id, depth) AS (
                       SELECT id, parent_id, 1 FROM document_folders WHERE id = :id
                       UNION ALL
                       SELECT f.id, f.parent_id, chain.depth + 1 FROM document_folders f
                       JOIN chain ON f.id = chain.parent_id WHERE chain.depth <= :limit)
                   SELECT id FROM chain ORDER BY depth"""
            ),
            {"id": folder_id, "limit": MAX_FOLDER_DEPTH + 1},
        )
    ).scalars().all()
    return list(rows)


async def _subtree_height(db: AsyncSession, folder_id: str) -> int:
    """Levels below and including `folder_id`. VI: Số tầng tính từ `folder_id` trở xuống."""
    return (
        await db.execute(
            text(
                """WITH RECURSIVE below(id, depth) AS (
                       SELECT id, 1 FROM document_folders WHERE id = :id
                       UNION ALL
                       SELECT f.id, below.depth + 1 FROM document_folders f
                       JOIN below ON f.parent_id = below.id WHERE below.depth <= :limit)
                   SELECT MAX(depth) FROM below"""
            ),
            {"id": folder_id, "limit": MAX_FOLDER_DEPTH + 1},
        )
    ).scalar_one() or 1


async def _ensure_unique_name(
    db: AsyncSession, team_id: str, parent_id: str | None, name: str, exclude_id: str | None = None
) -> None:
    taken = (
        await db.execute(
            text(
                """SELECT 1 FROM document_folders WHERE team_id = :team
                   AND parent_id IS NOT DISTINCT FROM :parent AND lower(name) = lower(:name)
                   AND id <> COALESCE(:exclude, '') LIMIT 1"""
            ),
            {"team": team_id, "parent": parent_id, "name": name, "exclude": exclude_id},
        )
    ).first()
    if taken:
        raise ApiError(409, "A document folder with this name already exists here.", "Conflict")


async def create_folder(
    db: AsyncSession,
    *,
    workspace_id: str,
    user_id: str,
    team_id: str | None,
    name: str,
    icon: str | None = None,
    parent_id: str | None = None,
    project_id: str | None = None,
    kind: str = "general",
) -> dict[str, Any]:
    """Create a folder at the root of a team or project tree, or under `parent_id`.

    A child takes its team and project from the parent; a root project folder takes the
    team of `project_id`. Names are unique per parent, ignoring case.
    VI: Tạo thư mục ở gốc cây của team hoặc dự án, hoặc dưới `parent_id`. Thư mục con lấy
    VI: team và dự án từ cha; thư mục gốc của dự án lấy team của `project_id`. Tên không
    VI: được trùng trong cùng thư mục cha, không phân biệt hoa thường.
    """
    name = name.strip()
    if len(name) < 2:
        raise ApiError(400, "Folder name needs at least two characters.", "Bad Request")
    if parent_id:
        parent = await _folder_row(db, workspace_id, parent_id)
        team_id, project_id = parent["team_id"], parent["project_id"]
        if len(await _ancestors(db, parent_id)) >= MAX_FOLDER_DEPTH:
            raise ApiError(400, f"Folders nest at most {MAX_FOLDER_DEPTH} levels deep.", "Bad Request")
    elif project_id:
        project_team = await _project_team(db, workspace_id, project_id, user_id)
        if team_id and team_id != project_team:
            raise ApiError(400, "The folder must belong to the project's team.", "Bad Request")
        team_id = project_team
    if not team_id:
        raise ApiError(400, "A team or parent folder is required.", "Bad Request")
    await _team_access(db, workspace_id, team_id, user_id)
    await _lock_team_folders(db, team_id)
    await _ensure_unique_name(db, team_id, parent_id, name)
    position = (
        await db.execute(
            text(
                """SELECT COALESCE(MAX(position), -1) + 1 FROM document_folders
                   WHERE team_id = :team AND parent_id IS NOT DISTINCT FROM :parent"""
            ),
            {"team": team_id, "parent": parent_id},
        )
    ).scalar_one()
    folder_id, now = _cuid(), _utcnow()
    await db.execute(
        text(
            """INSERT INTO document_folders
               (id, workspace_id, team_id, parent_id, project_id, kind, name, icon, position, created_at, updated_at)
               VALUES (:id, :workspace, :team, :parent, :project, :kind, :name, :icon, :position, :now, :now)"""
        ),
        {
            "id": folder_id,
            "workspace": workspace_id,
            "team": team_id,
            "parent": parent_id,
            "project": project_id,
            "kind": kind,
            "name": name,
            "icon": icon or "📁",
            "position": position,
            "now": now,
        },
    )
    return folder_payload(await _folder_row(db, workspace_id, folder_id))


async def update_folder(
    db: AsyncSession, *, workspace_id: str, user_id: str, folder_id: str, values: dict[str, Any]
) -> dict[str, Any]:
    """Rename, re-icon, reorder, re-kind or move a folder within its team.

    Moving refuses a parent in another team, a parent inside the folder's own subtree
    (a cycle) and a result deeper than MAX_FOLDER_DEPTH; a moved subtree takes the new
    parent's project. `parentId: null` moves the folder to the team root.
    VI: Đổi tên, icon, vị trí, loại hoặc di chuyển thư mục trong team. Di chuyển sẽ từ chối
    VI: thư mục cha thuộc team khác, thư mục cha nằm trong chính nhánh con của nó (vòng lặp)
    VI: và kết quả sâu hơn MAX_FOLDER_DEPTH; nhánh được chuyển nhận dự án của cha mới.
    VI: `parentId: null` đưa thư mục về gốc của team.
    """
    folder = await _folder_row(db, workspace_id, folder_id)
    await _team_access(db, workspace_id, folder["team_id"], user_id)
    await _lock_team_folders(db, folder["team_id"])
    parent_id = values["parentId"] if "parentId" in values else folder["parent_id"]
    project_id = folder["project_id"]
    if "parentId" in values and parent_id:
        parent = await _folder_row(db, workspace_id, parent_id)
        if parent["team_id"] != folder["team_id"]:
            raise ApiError(400, "Folders can only move within their team.", "Bad Request")
        chain = await _ancestors(db, parent_id)
        if folder_id in chain:
            raise ApiError(400, "A folder cannot move inside itself.", "Bad Request")
        if len(chain) + await _subtree_height(db, folder_id) > MAX_FOLDER_DEPTH:
            raise ApiError(400, f"Folders nest at most {MAX_FOLDER_DEPTH} levels deep.", "Bad Request")
        project_id = parent["project_id"]
    name = values["name"].strip() if values.get("name") else folder["name"]
    if "name" in values or "parentId" in values:
        await _ensure_unique_name(db, folder["team_id"], parent_id, name, exclude_id=folder_id)
    await db.execute(
        text(
            """UPDATE document_folders SET name = :name, icon = :icon, position = :position, kind = :kind,
               parent_id = :parent, updated_at = :now WHERE id = :id"""
        ),
        {
            "id": folder_id,
            "name": name,
            "icon": values.get("icon") or folder["icon"],
            "position": values.get("position", folder["position"]),
            "kind": values.get("kind") or folder["kind"],
            "parent": parent_id,
            "now": _utcnow(),
        },
    )
    if project_id != folder["project_id"]:
        await db.execute(
            text(
                """WITH RECURSIVE below(id) AS (
                       SELECT id FROM document_folders WHERE id = :id
                       UNION ALL SELECT f.id FROM document_folders f JOIN below ON f.parent_id = below.id)
                   UPDATE document_folders SET project_id = :project WHERE id IN (SELECT id FROM below)"""
            ),
            {"id": folder_id, "project": project_id},
        )
    return folder_payload(await _folder_row(db, workspace_id, folder_id))


async def scaffold_project_tree(
    db: AsyncSession, *, workspace_id: str, user_id: str, project_id: str
) -> None:
    """Create the project's root folder with "00 · Tổng quan" and "99 · Vận hành".

    Safe to repeat: existing folders are kept and only missing ones are added.
    VI: Tạo thư mục gốc của dự án cùng "00 · Tổng quan" và "99 · Vận hành". Chạy lại an
    VI: toàn: giữ thư mục đã có, chỉ thêm thư mục còn thiếu.
    """
    team_id = await _project_team(db, workspace_id, project_id, user_id)
    project_name = (
        await db.execute(text("SELECT name FROM projects WHERE id = :id"), {"id": project_id})
    ).scalar_one()
    root = (
        await db.execute(
            text(
                """SELECT * FROM document_folders WHERE project_id = :project AND parent_id IS NULL
                   AND kind = 'project' ORDER BY created_at LIMIT 1"""
            ),
            {"project": project_id},
        )
    ).mappings().first()
    root_id = root["id"] if root else (
        await create_folder(
            db,
            workspace_id=workspace_id,
            user_id=user_id,
            team_id=team_id,
            name=project_name,
            icon="📘",
            project_id=project_id,
            kind="project",
        )
    )["id"]
    for name in SCAFFOLD_FOLDERS:
        exists = (
            await db.execute(
                text("SELECT 1 FROM document_folders WHERE parent_id = :parent AND lower(name) = lower(:name)"),
                {"parent": root_id, "name": name},
            )
        ).first()
        if not exists:
            await create_folder(
                db, workspace_id=workspace_id, user_id=user_id, team_id=team_id, name=name, parent_id=root_id
            )


async def project_tree(
    db: AsyncSession, *, workspace_id: str, user_id: str, project_id: str
) -> dict[str, Any]:
    """Folders of a project's tree and the documents filed in them or linked to it.

    `documents[].linked` marks documents linked to the project (or one of its issues) but
    filed elsewhere, which the tree lists as unfiled.
    VI: Các thư mục trong cây của dự án và tài liệu nằm trong chúng hoặc liên kết với dự án.
    VI: `documents[].linked` đánh dấu tài liệu liên kết với dự án (hoặc issue của dự án)
    VI: nhưng nằm ở nơi khác; cây hiển thị chúng là chưa xếp thư mục.
    """
    team_id = await _project_team(db, workspace_id, project_id, user_id)
    folders = (
        await db.execute(
            text(
                """SELECT * FROM document_folders WHERE workspace_id = :workspace AND project_id = :project
                   ORDER BY position, name, id"""
            ),
            {"workspace": workspace_id, "project": project_id},
        )
    ).mappings().all()
    folder_ids = {row["id"] for row in folders}
    linked = set(
        (
            await db.execute(
                text(
                    """SELECT dl.document_id FROM document_links dl LEFT JOIN issues i ON i.id = dl.issue_id
                       WHERE dl.workspace_id = :workspace AND COALESCE(dl.project_id, i.project_id) = :project"""
                ),
                {"workspace": workspace_id, "project": project_id},
            )
        ).scalars().all()
    )
    # shortcut: loads the workspace's readable documents and filters here; query by folder
    # and link ids if workspaces grow to thousands of documents.
    # VI: Tải tài liệu đọc được của workspace rồi lọc tại đây; chuyển sang truy vấn theo id
    # VI: thư mục và liên kết nếu workspace có hàng nghìn tài liệu.
    documents = [
        {**document, "linked": document["folderId"] not in folder_ids}
        for document in await _documents(db, workspace_id, user_id=user_id)
        if document["folderId"] in folder_ids or document["id"] in linked
    ]
    files = (
        await db.execute(
            text(
                """SELECT id, entity_id, filename, mime_type, size, created_at FROM attachments
                   WHERE workspace_id = :workspace AND entity_type = 'document-folder'
                     AND entity_id = ANY(CAST(:folders AS text[]))
                   ORDER BY filename, id"""
            ),
            {"workspace": workspace_id, "folders": list(folder_ids)},
        )
    ).mappings().all()
    return {
        "projectId": project_id,
        "teamId": team_id,
        "folders": [folder_payload(row) for row in folders],
        "documents": documents,
        # PDFs uploaded into the tree's folders, previewed through the attachment routes.
        # VI: File PDF tải lên các thư mục của cây, xem trước qua route đính kèm.
        "files": [
            {
                "id": row["id"],
                "folderId": row["entity_id"],
                "filename": row["filename"],
                "mimeType": row["mime_type"],
                "size": row["size"],
                "createdAt": row["created_at"],
            }
            for row in files
        ],
    }


async def issue_documents(
    db: AsyncSession, *, workspace_id: str, user_id: str, issue_id: str
) -> list[dict[str, Any]]:
    """Documents linked to an issue the caller can read. VI: Tài liệu liên kết với issue."""
    from .issue_queries import _issue_row

    issue = await _issue_row(db, issue_id, workspace_id, user_id)
    linked = set(
        (
            await db.execute(
                text("SELECT document_id FROM document_links WHERE workspace_id = :workspace AND issue_id = :issue"),
                {"workspace": workspace_id, "issue": issue["id"]},
            )
        ).scalars().all()
    )
    if not linked:
        return []
    return [d for d in await _documents(db, workspace_id, user_id=user_id) if d["id"] in linked]
