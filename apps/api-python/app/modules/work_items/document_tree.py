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
from .document_repository import _document_by_id, _documents, _team_access

FolderKind = Literal["project", "module", "feature", "changes", "general"]
DocType = Literal["FDS", "TDS", "ADR", "RCA", "GUIDE", "OTHER"]
DocStatus = Literal["DRAFT", "IN_REVIEW", "APPROVED"]

# Deep enough for project / module / feature / changes plus a few levels of grouping,
# shallow enough that a tree stays navigable and the ancestor walk stays cheap.
# VI: Đủ sâu cho dự án / module / tính năng / thay đổi và vài tầng nhóm thêm, đủ nông để cây
# VI: còn dễ duyệt và việc dò thư mục tổ tiên vẫn nhẹ.
MAX_FOLDER_DEPTH = 8
DEFAULT_FOLDER_NAME = "General"
# Standard folders of a project tree with their fixed numbers: overview first, operations last,
# so modules numbered 01, 02 … sit between them.
# VI: Thư mục chuẩn của cây dự án cùng số cố định: tổng quan đứng đầu, vận hành đứng cuối, để
# VI: các module đánh số 01, 02 … nằm giữa.
SCAFFOLD_FOLDERS = ((0, "Tổng quan"), (99, "Vận hành"))
LAST_FOLDER_NUMBER = 99


def folder_label(name: str, number: int | None) -> str:
    """`NN · name` for a numbered folder, the bare name otherwise; used by SharePoint paths.
    VI: `NN · tên` với thư mục có số, chỉ tên nếu không có số; dùng cho đường dẫn SharePoint."""
    return name if number is None else f"{number:02d} · {name}"


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
        "number": row["number"],
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
    Project Docs folders are skipped, so a team document never lands in a project tree.
    VI: Trả về thư mục đầu tiên của team, tạo "General" nếu team chưa có thư mục nào. Tài
    VI: liệu của team luôn nằm trong một thư mục, nên team chưa có thư mục từng làm mọi lần
    VI: tạo tài liệu thất bại; giờ tài liệu đầu tiên sẽ tạo thư mục này. Bỏ qua thư mục của
    VI: cây Docs dự án để tài liệu team không rơi vào cây dự án.
    """
    query = text(
        """SELECT * FROM document_folders WHERE workspace_id = :workspace AND team_id = :team
           AND project_id IS NULL
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


async def _ensure_unique_number(
    db: AsyncSession, parent_id: str | None, number: int | None, exclude_id: str | None = None
) -> None:
    # Roots are not checked: the unique index treats NULL parents as distinct too.
    # VI: Không kiểm tra thư mục gốc: unique index cũng coi parent NULL là khác nhau.
    if number is None or parent_id is None:
        return
    taken = (
        await db.execute(
            text(
                """SELECT 1 FROM document_folders WHERE parent_id = :parent AND number = :number
                   AND id <> COALESCE(:exclude, '') LIMIT 1"""
            ),
            {"parent": parent_id, "number": number, "exclude": exclude_id},
        )
    ).first()
    if taken:
        raise ApiError(409, f"Folder number {number:02d} is already used here.", "Conflict")


async def _next_number(db: AsyncSession, parent_id: str) -> int | None:
    """Next free number among the children of `parent_id`: one above the highest number below
    99, starting at 01; None once that would reach 99, which stays reserved for the last slot.
    VI: Số trống kế tiếp trong các thư mục con của `parent_id`: lớn hơn một so với số lớn nhất
    VI: dưới 99, bắt đầu từ 01; trả None khi chạm 99, vì 99 dành cho ô cuối."""
    number = (
        await db.execute(
            text(
                """SELECT COALESCE(MAX(number) FILTER (WHERE number < :last), 0) + 1
                   FROM document_folders WHERE parent_id = :parent"""
            ),
            {"parent": parent_id, "last": LAST_FOLDER_NUMBER},
        )
    ).scalar_one()
    return number if number < LAST_FOLDER_NUMBER else None


async def _republish_below(db: AsyncSession, folder_id: str) -> None:
    """Make the publish job upload the documents under `folder_id` again, at their new path.

    Renaming, renumbering or moving a folder changes the SharePoint path of everything below
    it; clearing the published release re-uploads the latest approved release there. Files at
    the old path stay on SharePoint (Flowie never deletes there).
    VI: Cho job phát hành tải lại các tài liệu bên dưới `folder_id` theo đường dẫn mới. Đổi tên,
    VI: đổi số hoặc di chuyển thư mục làm đổi đường dẫn SharePoint của mọi thứ bên dưới; xoá
    VI: release đã phát hành để tải lại phiên bản đã duyệt mới nhất ở đó. File ở đường dẫn cũ vẫn
    VI: nằm trên SharePoint (Flowie không xoá gì ở đó).
    """
    await db.execute(
        text(
            """WITH RECURSIVE below(id) AS (
                   SELECT id FROM document_folders WHERE id = :id
                   UNION ALL SELECT f.id FROM document_folders f JOIN below ON f.parent_id = below.id)
               UPDATE document_publications SET release = NULL
               WHERE document_id IN (SELECT d.id FROM documents d WHERE d.folder_id IN (SELECT id FROM below))"""
        ),
        {"id": folder_id},
    )


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
    number: int | None = None,
) -> dict[str, Any]:
    """Create a folder at the root of a team or project tree, or under `parent_id`.

    A child takes its team and project from the parent; a root project folder takes the
    team of `project_id`. Names are unique per parent, ignoring case. Without `number`, a
    child inside a project tree takes the next free number; numbers are unique per parent.
    VI: Tạo thư mục ở gốc cây của team hoặc dự án, hoặc dưới `parent_id`. Thư mục con lấy
    VI: team và dự án từ cha; thư mục gốc của dự án lấy team của `project_id`. Tên không
    VI: được trùng trong cùng thư mục cha, không phân biệt hoa thường. Không truyền `number`
    VI: thì thư mục con trong cây dự án nhận số trống kế tiếp; số không trùng trong cùng cha.
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
    if number is None and parent_id and project_id:
        number = await _next_number(db, parent_id)
    await _ensure_unique_number(db, parent_id, number)
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
               (id, workspace_id, team_id, parent_id, project_id, kind, name, icon, position, number, created_at, updated_at)
               VALUES (:id, :workspace, :team, :parent, :project, :kind, :name, :icon, :position, :number, :now, :now)"""
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
            "number": number,
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
    `number` (null clears it) must stay unique among the new siblings. A change of name,
    number or parent re-publishes the documents below to SharePoint at the new path.
    VI: `number` (null để xoá số) không được trùng với các thư mục cùng cha mới. Đổi tên, số
    VI: hoặc thư mục cha sẽ phát hành lại các tài liệu bên dưới lên SharePoint theo đường dẫn mới.
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
    number = values["number"] if "number" in values else folder["number"]
    if "number" in values or "parentId" in values:
        await _ensure_unique_number(db, parent_id, number, exclude_id=folder_id)
    await db.execute(
        text(
            """UPDATE document_folders SET name = :name, icon = :icon, position = :position, kind = :kind,
               parent_id = :parent, number = :number, updated_at = :now WHERE id = :id"""
        ),
        {
            "id": folder_id,
            "name": name,
            "icon": values.get("icon") or folder["icon"],
            "position": values.get("position", folder["position"]),
            "kind": values.get("kind") or folder["kind"],
            "parent": parent_id,
            "number": number,
            "now": _utcnow(),
        },
    )
    if (name, number, parent_id) != (folder["name"], folder["number"], folder["parent_id"]):
        await _republish_below(db, folder_id)
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

    Safe to repeat: existing folders are kept and only missing ones are added (matched by
    name). A standard number already used by another folder is left to that folder and the
    missing standard folder takes the next free number instead.
    VI: Tạo thư mục gốc của dự án cùng "00 · Tổng quan" và "99 · Vận hành". Chạy lại an
    VI: toàn: giữ thư mục đã có, chỉ thêm thư mục còn thiếu (so theo tên). Số chuẩn đã bị thư
    VI: mục khác dùng thì giữ cho thư mục đó, thư mục chuẩn còn thiếu nhận số trống kế tiếp.
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
    for number, name in SCAFFOLD_FOLDERS:
        siblings = (
            await db.execute(
                text(
                    """SELECT bool_or(lower(name) = lower(:name)) AS named, bool_or(number = :number) AS numbered
                       FROM document_folders WHERE parent_id = :parent"""
                ),
                {"parent": root_id, "name": name, "number": number},
            )
        ).mappings().one()
        if not siblings["named"]:
            await create_folder(
                db,
                workspace_id=workspace_id,
                user_id=user_id,
                team_id=team_id,
                name=name,
                parent_id=root_id,
                number=None if siblings["numbered"] else number,
            )


async def publications_by_document(
    db: AsyncSession, document_ids: list[str]
) -> dict[str, dict[str, Any]]:
    """Last SharePoint upload per document id; documents never published are absent.

    Only rows of projects with SharePoint publishing exist, so a document without a row
    either was never approved or belongs to a project that does not publish.
    VI: Lần tải lên SharePoint gần nhất theo id tài liệu; tài liệu chưa từng phát hành thì
    VI: không có mặt. Chỉ dự án có phát hành SharePoint mới có dòng, nên tài liệu không có
    VI: dòng là chưa từng được duyệt hoặc thuộc dự án không phát hành.
    """
    rows = (
        await db.execute(
            text(
                """SELECT document_id, version, release, web_url, published_at, last_error FROM document_publications
                   WHERE document_id = ANY(CAST(:ids AS text[]))"""
            ),
            {"ids": document_ids},
        )
    ).mappings().all()
    return {
        row["document_id"]: {
            "version": row["version"],
            "release": row["release"],
            "webUrl": row["web_url"],
            "publishedAt": row["published_at"],
            "lastError": row["last_error"],
        }
        for row in rows
    }


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
    # Last SharePoint upload of each document, shown beside its preview.
    # VI: Lần tải lên SharePoint gần nhất của từng tài liệu, hiển thị cạnh khung xem trước.
    publications = await publications_by_document(db, [document["id"] for document in documents])
    for document in documents:
        document["publication"] = publications.get(document["id"])
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


async def _readable_document(
    db: AsyncSession, workspace_id: str, user_id: str, document_id: str
) -> dict[str, Any]:
    document = await _document_by_id(db, document_id, workspace_id)
    if not document:
        raise ApiError(404, "Document not found.", "Not Found")
    await _team_access(db, workspace_id, document["teamId"], user_id)
    return document


async def document_issues(
    db: AsyncSession, *, workspace_id: str, user_id: str, document_id: str
) -> list[dict[str, Any]]:
    """Issues linked to a document, oldest link first, limited to issues the caller can read
    (archived issues and issues of teams the caller is not in are left out).
    VI: Các issue liên kết với một tài liệu, liên kết cũ nhất trước, chỉ gồm issue người gọi
    đọc được (bỏ issue đã lưu trữ và issue của team mà người gọi không thuộc).
    """
    from .issue_queries import _issue_rows

    await _readable_document(db, workspace_id, user_id, document_id)
    ids = (
        await db.execute(
            text(
                """SELECT issue_id FROM document_links
                   WHERE workspace_id = :workspace AND document_id = :document AND issue_id IS NOT NULL
                   ORDER BY created_at, id"""
            ),
            {"workspace": workspace_id, "document": document_id},
        )
    ).scalars().all()
    return [
        {
            "id": issue["id"],
            "identifier": issue["identifier"],
            "title": issue["title"],
            "status": issue["status"],
        }
        for issue in await _issue_rows(db, list(ids), workspace_id, user_id)
    ]


async def link_issue_document(
    db: AsyncSession, *, workspace_id: str, user_id: str, document_id: str, issue_id: str, linked: bool
) -> None:
    """Link (`linked=True`) or unlink a document and an issue; both calls are idempotent. The
    caller must read both, and a team's document links only to that team's issues, the same rule
    as the MCP `link_document` tool. A document links to many issues and an issue to many
    documents (`document_links` is unique per document and issue).
    VI: Liên kết (`linked=True`) hoặc gỡ liên kết một tài liệu với một issue; gọi lặp lại không
    lỗi. Người gọi phải đọc được cả hai, và tài liệu của một team chỉ liên kết với issue của team
    đó, cùng quy tắc với tool MCP `link_document`. Một tài liệu liên kết nhiều issue và một issue
    liên kết nhiều tài liệu (`document_links` duy nhất theo cặp tài liệu và issue).
    """
    from .issue_queries import _issue_row

    document = await _readable_document(db, workspace_id, user_id, document_id)
    issue = await _issue_row(db, issue_id, workspace_id, user_id)
    if not linked:
        await db.execute(
            text(
                "DELETE FROM document_links WHERE workspace_id = :workspace AND document_id = :document AND issue_id = :issue"
            ),
            {"workspace": workspace_id, "document": document_id, "issue": issue["id"]},
        )
        return
    if document["teamId"] and document["teamId"] != issue["teamId"]:
        raise ApiError(400, "A team document can only link to that team.", "Bad Request")
    await db.execute(
        text(
            """INSERT INTO document_links (id, document_id, workspace_id, issue_id)
               VALUES (:id, :document, :workspace, :issue) ON CONFLICT DO NOTHING"""
        ),
        {"id": _cuid(), "document": document_id, "workspace": workspace_id, "issue": issue["id"]},
    )
