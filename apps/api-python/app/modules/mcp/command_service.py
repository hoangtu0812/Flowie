from __future__ import annotations

from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..access.membership import manager
from ..access.projects import team_write_role
from ..agent_runs.api import locate_repository
from ..attachments.api import delete_attachment_row
from ..work_items import comments, documents, issues
from ..work_items.commands import REORDER_LOCK, reorder_update_unnest_sql
from ..work_items.contracts import (
    CommentInput,
    CreateCommentInput,
    CreateDocumentInput,
    CreateIssueInput,
    UpdateDocumentInput,
    UpdateIssueInput,
)
from ..work_items.queries import reorder_select_sql
from ..worklogs import service as worklogs
from ..worklogs.service import WorklogInput
from .commands import (
    ADD_LINK_INSERT_DOCUMENT_LINKS,
)
from .feature_docs import require_feature_project, upsert_feature_doc
from .policy import AccessPolicy
from .queries import (
    EXECUTE_SELECT_DOCUMENT_REVISIONS,
    PREPARE_SELECT_ISSUE_STATUSES,
    STATUS_BY_NAME_SELECT_ISSUE_STATUSES,
    context_select_issues_sql,
)
from .query_service import QueryService
from .uploads import upload_link


class CommandService:
    def __init__(self, db, principal, settings=None):
        self.db, self.principal, self.settings = db, principal, settings
        self.policy = AccessPolicy(db, principal)
        self.target: dict | None = None
        self.parent_id: str | None = None
        self.status_id: str | None = None

    @property
    def subject(self) -> dict:
        """The record prepare() resolved; execute() only runs after it.

        VI: Bản ghi mà prepare() đã tìm ra; execute() chỉ chạy sau bước đó.
        """
        if self.target is None:
            raise RuntimeError("prepare() must run before execute().")
        return self.target

    async def prepare(self, name: str, payload) -> None:
        if name == "create_attachment_upload":
            self.target = await self.policy.issue(payload.issueId)
        elif name in {
            "update_issue",
            "transition_issue",
            "add_comment",
            "start_issue",
            "finish_issue",
            "reorder_sub_issues",
            "log_work",
        }:
            self.target = await self.policy.issue(payload.issueId, lock=True)
            if name == "update_issue" and "projectId" in payload.model_fields_set:
                await self.policy.destination(payload.projectId, self.target["team_id"])
            # The parent must be inside this connection's scope; team, archive and cycle rules
            # run in issues.update_issue so MCP and the web app share them.
            # VI: Issue cha phải nằm trong scope của kết nối; quy tắc team, archive và chu trình
            # VI: chạy trong issues.update_issue để MCP và web dùng chung.
            if name == "update_issue" and payload.parentIssueId:
                self.parent_id = (await self.policy.issue(payload.parentIssueId))["id"]
            if name in {"transition_issue", "start_issue", "finish_issue"}:
                self.status_id = payload.statusId or await self.status_by_name(payload.status)
            # Comments nest one level, so a reply to a reply joins the thread of its top-level
            # comment instead of failing. A parent on another issue is passed through for
            # comments.create_comment to reject.
            # VI: Comment chỉ lồng một cấp, nên trả lời một reply sẽ gắn vào thread của comment
            # VI: gốc thay vì lỗi. Comment cha thuộc issue khác được giữ nguyên để
            # VI: comments.create_comment từ chối.
            if name == "add_comment" and payload.parentCommentId:
                parent = await self.policy.comment(payload.parentCommentId)
                self.parent_id = (
                    parent["parent_comment_id"]
                    if parent["parent_comment_id"] and parent["issue_id"] == self.target["id"]
                    else parent["id"]
                )
        elif name == "update_comment":
            self.target = await self.policy.comment(payload.commentId, lock=True)
            if self.target["author_id"] != self.principal.user["id"]:
                raise ApiError(403, "Only the comment author can edit it.", "Forbidden")
        elif name in {"update_document", "link_document", "restore_document"}:
            self.target = await self.policy.document(payload.documentId, lock=True)
            if name == "link_document":
                await self.link_target(payload)
        elif name == "upsert_feature_doc":
            self.target = await require_feature_project(self.policy, payload.issueId)
        elif name == "configure_project_repository":
            # Same rule as the web settings: only workspace owners and admins configure
            # repositories, and the project must be inside this connection's grant.
            # VI: Cùng quy tắc với trang cài đặt web: chỉ owner và admin workspace cấu hình
            # VI: repository, và dự án phải nằm trong phạm vi cấp cho kết nối.
            await manager(self.db, self.principal.workspace_id, self.principal.user["id"])
            self.target = await self.policy.project(payload.projectId)
        elif name == "create_issue":
            await self.policy.destination(payload.projectId, payload.teamId)
            if payload.parentIssueId:
                await self.policy.issue(payload.parentIssueId)
            # Without statusId, issues.create_issue picks the team's first Unstarted status,
            # which needs no transition scope.
            # VI: Không có statusId thì issues.create_issue chọn trạng thái Unstarted đầu tiên
            # VI: của team, không cần quyền chuyển trạng thái.
            status = payload.statusId and (
                await self.db.execute(
                    PREPARE_SELECT_ISSUE_STATUSES,
                    {
                        "id": payload.statusId,
                        "workspace": self.principal.workspace_id,
                        "team": payload.teamId,
                    },
                )
            ).scalar_one_or_none()
            if status in {"COMPLETED", "CANCELED"}:
                self.principal.require("issues:transition")
        elif name == "create_document":
            team_id, project_id = payload.teamId, payload.projectId
            if payload.issueId:
                issue = await self.policy.issue(payload.issueId)
                project_id = issue["project_id"]
                team_id = team_id or issue["team_id"]
                if team_id != issue["team_id"]:
                    raise ApiError(
                        400,
                        "Document and issue must belong to the same team.",
                        "Bad Request",
                    )
            if project_id:
                project = await self.policy.project(project_id)
                team_id = team_id or project["team_id"]
            await self.policy.destination(project_id, team_id)
            self.target = {"team_id": team_id}

    async def status_by_name(self, name: str) -> str:
        """Id of the issue team's status called `name`, ignoring case and outer spaces.
        VI: Id trạng thái tên `name` của team chứa issue, không phân biệt hoa thường và khoảng trắng hai đầu.
        """
        rows = (
            await self.db.execute(
                STATUS_BY_NAME_SELECT_ISSUE_STATUSES,
                {"workspace": self.principal.workspace_id, "team": self.subject["team_id"]},
            )
        ).all()
        wanted = name.strip().casefold()
        matches = [row.id for row in rows if row.name.strip().casefold() == wanted]
        if len(matches) != 1:
            names = ", ".join(dict.fromkeys(row.name for row in rows))
            raise ApiError(400, f"Unknown status \"{name}\". Use one of: {names}.", "Bad Request")
        return matches[0]

    async def link_target(self, payload) -> tuple[str | None, str | None]:
        """The link row's (issue id, project id). With both issueId and projectId the issue
        wins, but only when it belongs to that project, so a mismatch is reported instead of
        silently dropping one target.
        VI: (issue id, project id) của dòng liên kết. Có cả issueId và projectId thì dùng issue,
        VI: nhưng chỉ khi issue thuộc project đó, để báo lỗi khi lệch thay vì âm thầm bỏ một đích.
        """
        issue_id, project_id = None, payload.projectId
        if payload.issueId:
            issue = await self.policy.issue(payload.issueId)
            if payload.projectId and (
                (await self.policy.project(payload.projectId))["id"] != issue["project_id"]
            ):
                raise ApiError(
                    400,
                    "The issue is not in projectId. Send only issueId to link the issue, or only projectId.",
                    "Bad Request",
                )
            issue_id, project_id = issue["id"], None
            target_team = issue["team_id"]
        else:
            project = await self.policy.project(project_id)
            target_team = project["team_id"]
        document_team = self.target["team_id"] if self.target else None
        if document_team and document_team != target_team:
            raise ApiError(
                400, "A team document can only link to that team.", "Bad Request"
            )
        return issue_id, project_id

    def check_version(self, payload) -> None:
        """Rejects a stale expectedVersion with the locked record's current version, so a
        client whose change does not depend on what changed can retry without a read.
        VI: Từ chối expectedVersion cũ kèm version hiện tại của bản ghi đã khoá, để client có
        VI: thay đổi không phụ thuộc phần vừa đổi thử lại được mà không cần đọc lại.
        """
        if not hasattr(payload, "expectedVersion"):
            return
        current = self.subject["version"]
        if current != payload.expectedVersion:
            raise ApiError(
                409,
                f"The record changed: currentVersion is {current}, expectedVersion was "
                f"{payload.expectedVersion}. Read it again before updating.",
                "Conflict",
                {"currentVersion": current},
            )

    async def execute(self, name: str, payload) -> dict:
        self.check_version(payload)
        actor, workspace = self.principal.user, self.principal.workspace_id
        values = payload.model_dump(
            exclude_unset=True,
            exclude={
                "idempotencyKey",
                "expectedVersion",
                "issueId",
                "documentId",
                "commentId",
                "includeContent",
            },
        )
        if name == "create_issue":
            values["parentIssueId"] = (
                (await self.policy.issue(payload.parentIssueId))["id"]
                if payload.parentIssueId
                else None
            )
            return (
                await issues.create_issue(
                    CreateIssueInput(workspaceId=workspace, **values), actor, self.db
                )
            )["data"]
        if name in {"start_issue", "finish_issue"}:
            fields = (
                ("startDate", "targetDate", "dueDate", "estimatedEffort")
                if name == "start_issue"
                else ("actualEffort",)
            )
            changes = {key: getattr(payload, key) for key in fields if key in payload.model_fields_set}
            result = (
                await issues.update_issue(
                    self.subject["id"],
                    UpdateIssueInput(**changes, statusId=self.status_id),
                    workspace,
                    actor,
                    self.db,
                )
            )["data"]
            comment = (
                await comments.create_comment(
                    CreateCommentInput(
                        workspaceId=workspace,
                        issueId=self.subject["id"],
                        content=payload.plan if name == "start_issue" else payload.result,
                    ),
                    actor,
                    self.db,
                )
            )["data"]
            return {**result, "commentId": comment["id"]}
        if name in {"update_issue", "transition_issue"}:
            if name == "transition_issue":
                values = {"statusId": self.status_id}
            elif not values:
                raise ApiError(
                    400, "At least one update field is required.", "Bad Request"
                )
            elif values.get("parentIssueId"):
                values["parentIssueId"] = self.parent_id
            result = (
                await issues.update_issue(
                    self.subject["id"],
                    UpdateIssueInput(**values),
                    workspace,
                    actor,
                    self.db,
                )
            )["data"]
            if name == "transition_issue":
                await comments.create_comment(
                    CreateCommentInput(
                        workspaceId=workspace,
                        issueId=self.subject["id"],
                        content=payload.reason,
                    ),
                    actor,
                    self.db,
                )
            return result
        if name == "reorder_sub_issues":
            return await self.reorder_sub_issues(payload)
        if name == "log_work":
            return await worklogs.create_worklog(
                self.db,
                self.subject["id"],
                WorklogInput(
                    workspaceId=workspace, workDate=payload.workDate, hours=payload.hours, note=payload.note
                ),
                actor["id"],
            )
        if name == "add_comment":
            return (
                await comments.create_comment(
                    CreateCommentInput(
                        workspaceId=workspace,
                        issueId=self.subject["id"],
                        content=payload.content, parentCommentId=self.parent_id, mentionIds=payload.mentionIds,
                    ),
                    actor,
                    self.db,
                )
            )["data"]
        if name == "update_comment":
            return (
                await comments.update_comment(
                    payload.commentId,
                    CommentInput(content=payload.content, expectedVersion=payload.expectedVersion),
                    workspace,
                    actor,
                    self.db,
                )
            )["data"]
        if name == "create_document":
            values.pop("projectId", None)
            values["teamId"] = self.subject["team_id"]
            result = (
                await documents.create_document(
                    CreateDocumentInput(workspaceId=workspace, **values), actor, self.db
                )
            )["data"]
            self.target = {"team_id": result["teamId"]}
            if payload.projectId or payload.issueId:
                await self.add_link(result["id"], payload)
            return result
        if name in {"update_document", "restore_document"}:
            if values.get("edits"):
                from .edits import apply_edits

                values["content"] = apply_edits(self.subject["content"], payload.edits)
            values.pop("edits", None)
            if name == "restore_document":
                revision = (
                    (
                        await self.db.execute(
                            EXECUTE_SELECT_DOCUMENT_REVISIONS,
                            {
                                "id": payload.documentId,
                                "version": payload.revisionVersion,
                            },
                        )
                    )
                    .mappings()
                    .first()
                )
                if not revision:
                    raise ApiError(404, "Revision not found.", "Not Found")
                values = dict(revision)
            if not values or any(value is None for value in values.values()):
                raise ApiError(
                    400,
                    "Provide a non-null title, content, docType or status.",
                    "Bad Request",
                )
            return (
                await documents.update_document(
                    payload.documentId,
                    UpdateDocumentInput(**values),
                    workspace,
                    actor,
                    self.db,
                )
            )["data"]
        if name == "configure_project_repository":
            return await locate_repository(
                self.db, self.principal.workspace_id, self.principal.user["id"], payload
            )
        if name == "upsert_feature_doc":
            return await upsert_feature_doc(self.db, self.principal, self.subject, payload)
        if name == "delete_attachment":
            # Checked here rather than in prepare(): a replayed key must return its stored result
            # after the row is gone. Reading the parent record comes first, as for
            # read_attachment_*; a file of a comment or document also needs that kind's write
            # scope, not only issues:write.
            # VI: Kiểm tra ở đây thay vì trong prepare(): gọi lại cùng key phải trả kết quả đã lưu
            # VI: khi dòng đã bị xoá. Phải đọc được bản ghi cha trước, như read_attachment_*; tệp
            # VI: của comment hay tài liệu còn cần quyền ghi của loại đó, không chỉ issues:write.
            row = await QueryService(
                self.db, self.principal, self.settings
            )._authorized_attachment(payload.attachmentId)
            scope = {"comment": "comments:write", "document": "documents:write"}.get(
                row["entity_type"]
            )
            if scope:
                self.principal.require(scope)
            await delete_attachment_row(self.db, self.settings, row, self.principal.user["id"])
            return {"id": row["id"], "filename": row["filename"], "deleted": True}
        if name == "create_attachment_upload":
            return upload_link(self.settings, self.principal, self.subject, payload.filename)
        if name == "link_document":
            await self.add_link(payload.documentId, payload)
            return {"documentId": payload.documentId, "linked": True}
        raise ApiError(404, "Tool not found.", "Not Found")

    async def reorder_sub_issues(self, payload) -> dict:
        """Writes the manual order of the locked parent's sub-issues from a complete list.

        The list must name, by id or identifier, every sub-issue this connection can see exactly
        once; anything else is a 400 raised before the first write. Sub-issues outside the
        connection's scope keep their slots and only the visible slots are refilled, so a
        restricted connection cannot move work it cannot read. The advisory lock and the
        `position * 1024` numbering are the web drag-and-drop's, so both writers serialize and
        produce ranks the web orders by. A parent on another sort switches to manual, which is
        what makes the new order visible and raises the parent's version.
        VI: Ghi thứ tự thủ công cho sub-issue của task cha đã khoá từ một danh sách đầy đủ.
        VI: Danh sách phải nêu, theo id hoặc mã, mọi sub-issue kết nối nhìn thấy đúng một lần;
        VI: trường hợp khác trả 400 trước lần ghi đầu tiên. Sub-issue ngoài phạm vi của kết nối
        VI: giữ nguyên vị trí và chỉ các vị trí nhìn thấy được xếp lại, nên kết nối bị giới hạn
        VI: không dời được việc nó không đọc được. Khoá advisory và cách đánh số `vị trí * 1024`
        VI: là của kéo thả trên web, nên hai bên ghi tuần tự và cho ra rank mà web dùng để sắp.
        VI: Task cha đang dùng kiểu sắp khác được chuyển sang manual, nhờ đó thứ tự mới hiển thị
        VI: và version của task cha tăng.
        """
        parent, workspace = self.subject, self.principal.workspace_id
        await team_write_role(self.db, parent["team_id"], self.principal.user["id"])
        await self.db.execute(REORDER_LOCK, {"key": f"manual-order:{workspace}:issue"})
        visible = (
            await self.db.execute(
                context_select_issues_sql(self),
                {**self.policy.params, "issue": parent["id"], "limit": None},
            )
        ).mappings()
        names = {row["id"]: row["identifier"] for row in visible}
        by_key = {key: issue_id for issue_id, name in names.items() for key in (issue_id, name)}
        asked = payload.orderedIssueIds
        ordered = [by_key[key] for key in asked if key in by_key]
        problems = {
            "not sub-issues of this parent": list(
                dict.fromkeys(key for key in asked if key not in by_key)
            ),
            "listed more than once": sorted(
                {names[issue_id] for issue_id in ordered if ordered.count(issue_id) > 1}
            ),
            "missing": [name for issue_id, name in names.items() if issue_id not in ordered],
        }
        if any(problems.values()):
            detail = "; ".join(
                f"{label}: {', '.join(keys)}" for label, keys in problems.items() if keys
            )
            raise ApiError(
                400,
                "orderedIssueIds must list every sub-issue of the parent exactly once "
                f"({detail}). Nothing was changed.",
                "Bad Request",
            )
        slots = iter(ordered)
        siblings = [
            next(slots) if issue_id in names else issue_id
            for issue_id in (
                await self.db.execute(
                    reorder_select_sql("issues", " AND parent_issue_id=:parent"),
                    {"workspace": workspace, "parent": parent["id"]},
                )
            ).scalars()
        ]
        await self.db.execute(
            reorder_update_unnest_sql("issues"), {"ids": siblings, "workspace": workspace}
        )
        version = parent["version"]
        if parent["sub_issue_sort"] != "manual":
            version = (
                await issues.update_issue(
                    parent["id"],
                    UpdateIssueInput(subIssueSort="manual"),
                    workspace,
                    self.principal.user,
                    self.db,
                )
            )["data"]["version"]
        ranks = {issue_id: str((index + 1) * 1024) for index, issue_id in enumerate(siblings)}
        return {
            "id": parent["id"],
            "identifier": parent["identifier"],
            "version": version,
            "subIssueSort": "manual",
            "subIssues": [
                {"id": issue_id, "identifier": names[issue_id], "manualOrder": ranks[issue_id]}
                for issue_id in ordered
            ],
        }

    async def add_link(self, document_id: str, payload) -> None:
        issue_id, project_id = await self.link_target(payload)
        await self.db.execute(
            ADD_LINK_INSERT_DOCUMENT_LINKS,
            {
                "id": cuid(),
                "document": document_id,
                "workspace": self.principal.workspace_id,
                "project": project_id,
                "issue": issue_id,
            },
        )
