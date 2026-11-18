from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from annotated_types import Le
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..work_items.bug_contracts import (
    BugCreateFields,
    BugSeverity,
    BugUpdateFields,
    IssueType,
)
from ..work_items.contracts import DocType
from .domain import ALL_SCOPES, READ_SCOPES
from .instructions import MAX_WORKFLOW_LENGTH


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("name", "title", mode="before", check_fields=False)
    @classmethod
    def normalize_display_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class ConnectionUpdateInput(StrictInput):
    name: str = Field(min_length=2, max_length=80)
    scopes: list[str] = Field(min_length=1, max_length=20)
    teamIds: list[str] = Field(default_factory=list, max_length=100)
    projectIds: list[str] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_grant(self):
        if not self.name.strip() or set(self.scopes) - ALL_SCOPES:
            raise ValueError("A connection name and supported scopes are required.")
        self.scopes = sorted(set(self.scopes))
        self.teamIds = sorted(set(self.teamIds))
        self.projectIds = sorted(set(self.projectIds))
        return self


class InstructionsInput(StrictInput):
    # None or empty text resets the workspace to the built-in workflow.
    # VI: None hoặc văn bản rỗng đặt lại workspace về quy trình có sẵn.
    workflow: str | None = Field(default=None, max_length=MAX_WORKFLOW_LENGTH)


class ConnectionInput(ConnectionUpdateInput):
    scopes: list[str] = Field(
        default_factory=lambda: sorted(READ_SCOPES), min_length=1, max_length=20
    )
    expiresInDays: int = Field(default=30, ge=1, le=90)


class EmptyInput(StrictInput):
    pass


class AttachmentInput(StrictInput):
    attachmentId: str = Field(min_length=1)
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=10000, ge=1, le=10000)


class ImageAttachmentInput(StrictInput):
    attachmentId: str = Field(min_length=1)


class PageInput(StrictInput):
    limit: int = Field(default=25, ge=1, le=100)
    cursor: str | None = Field(default=None, max_length=1000)


class SearchIssuesInput(PageInput):
    issueType: IssueType | None = None
    severity: BugSeverity | None = None
    projectId: str | None = Field(default=None, min_length=1)
    teamId: str | None = Field(default=None, min_length=1)
    query: str | None = Field(default=None, max_length=200)
    statusId: str | None = None
    category: (
        Literal["TRIAGE", "BACKLOG", "UNSTARTED", "STARTED", "COMPLETED", "CANCELED"]
        | None
    ) = None
    assigneeId: str | None = None
    priority: Literal["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] | None = None
    labelId: str | None = None
    subProjectLabelId: str | None = None
    milestoneId: str | None = None
    updatedAfter: datetime | None = None
    updatedBefore: datetime | None = None
    overdue: bool = False


class IssueInput(StrictInput):
    issueId: str = Field(min_length=1, max_length=100)


class IssuePageInput(IssueInput, PageInput):
    pass


class IssueContextInput(IssueInput):
    limit: int = Field(default=5, ge=1, le=10)
    # Off by default: the project's other documents are rarely about this issue and were most of
    # the response. VI: Mặc định tắt: các tài liệu khác của dự án hiếm khi liên quan tới issue này
    # VI: và từng chiếm phần lớn phản hồi.
    includeProjectDocuments: bool = False
    # Sub-issues have their own cap because each row is three short fields and a parent's plan
    # often lists more children than the 10 comments `limit` allows.
    # VI: Sub-issue có giới hạn riêng vì mỗi dòng chỉ gồm ba trường ngắn và kế hoạch của task cha
    # VI: thường có nhiều task con hơn mức 10 comment mà `limit` cho phép.
    subIssueLimit: int = Field(default=50, ge=1, le=200)


class ProjectInput(StrictInput):
    projectId: str = Field(min_length=1, max_length=100)


class DocumentInput(StrictInput):
    documentId: str = Field(min_length=1, max_length=100)


class DocumentReadInput(DocumentInput):
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=20000, ge=1, le=40000)


class DocumentPartInput(DocumentReadInput):
    # Headings with offsets and section sizes instead of the text; `section` reads one heading's
    # part, with offset/limit counted inside it. Without either, the full text is read as before.
    # VI: Danh sách heading kèm offset và độ dài từng phần thay cho văn bản; `section` đọc phần
    # VI: của một heading, offset/limit tính trong phần đó. Không gửi cả hai thì đọc toàn văn như cũ.
    outline: bool = False
    section: str | None = Field(default=None, min_length=1, max_length=250)

    @model_validator(mode="after")
    def outline_or_section(self):
        if self.outline and self.section:
            raise ValueError("Give outline or section, not both.")
        return self


class DocumentRevisionInput(DocumentReadInput):
    revisionVersion: int = Field(ge=1)


class FeatureDocsInput(IssueInput):
    # Linked FDS/TDS come with their outline; the text only on request or for one section.
    # VI: FDS/TDS liên kết trả kèm mục lục; văn bản chỉ khi yêu cầu hoặc theo một phần.
    includeContent: bool = False
    section: str | None = Field(default=None, min_length=1, max_length=250)


class DocumentDiffInput(DocumentInput):
    fromVersion: int = Field(ge=1)
    toVersion: int | None = Field(default=None, ge=1)
    maxLines: int = Field(default=200, ge=1, le=500)


class SearchDocumentsInput(PageInput):
    projectId: str | None = None
    issueId: str | None = None
    teamId: str | None = None
    query: str | None = Field(default=None, max_length=200)


class IssueOptionsInput(StrictInput):
    teamId: str = Field(min_length=1)
    # Adds that project's sub projects and milestones to the result.
    # VI: Thêm sub project và milestone của dự án đó vào kết quả.
    projectId: str | None = Field(default=None, min_length=1)


class WriteInput(StrictInput):
    idempotencyKey: str = Field(min_length=8, max_length=128)


class VersionInput(WriteInput):
    expectedVersion: int = Field(ge=1)


class CreateIssueTool(WriteInput, BugCreateFields):
    teamId: str = Field(min_length=1)
    projectId: str | None = None
    parentIssueId: str | None = None
    # Omitted: the team's first Unstarted status, the same default as the web app.
    # VI: Bỏ trống: trạng thái Unstarted đầu tiên của team, cùng mặc định với web.
    statusId: str | None = Field(default=None, min_length=1)
    title: str = Field(min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10000)
    priority: Literal["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] = "NONE"
    assigneeId: str | None = None
    # Defaults to the caller. VI: Mặc định là người gọi.
    reporterId: str | None = None
    startDate: str | None = None
    targetDate: str | None = None
    dueDate: str | None = None
    # Effort in man-days, like the web's Effort field. VI: Effort theo man-day, như trường Effort trên web.
    estimatedEffort: float | None = Field(default=None, ge=0, le=10000)
    actualEffort: float | None = Field(default=None, ge=0, le=10000)
    labelIds: list[str] = Field(default_factory=list, max_length=100)
    # Sub projects of projectId (list_issue_options with projectId). VI: Sub project của projectId.
    subProjectLabelIds: list[str] = Field(default_factory=list, max_length=100)
    # Milestone of projectId (list_issue_options with projectId). VI: Milestone của projectId.
    milestoneId: str | None = Field(default=None, min_length=1, max_length=100)


class UpdateIssueTool(VersionInput, IssueInput, BugUpdateFields):
    title: str | None = Field(default=None, min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10000)
    projectId: str | None = None
    # Issue id or identifier of the new parent; null removes the parent.
    # VI: Id hoặc mã của issue cha mới; null để gỡ cha.
    parentIssueId: str | None = Field(default=None, min_length=1, max_length=100)
    assigneeId: str | None = None
    # Null resets the reporter to the creator. VI: Null đưa reporter về người tạo.
    reporterId: str | None = None
    priority: Literal["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] | None = None
    startDate: str | None = None
    targetDate: str | None = None
    dueDate: str | None = None
    # Man-days; null clears the value. VI: Man-day; null xoá giá trị.
    estimatedEffort: float | None = Field(default=None, ge=0, le=10000)
    actualEffort: float | None = Field(default=None, ge=0, le=10000)
    labelIds: list[str] | None = Field(default=None, max_length=100)
    # Replaces the list; changing projectId alone drops the old project's sub projects.
    # VI: Thay cả danh sách; chỉ đổi projectId thì gỡ sub project của dự án cũ.
    subProjectLabelIds: list[str] | None = Field(default=None, max_length=100)
    # Null removes it; changing projectId alone drops the old project's milestone.
    # VI: Null để gỡ; chỉ đổi projectId thì gỡ milestone của dự án cũ.
    milestoneId: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def non_null_required_fields(self):
        for field in ("title", "priority"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        return self


class TransitionIssueTool(VersionInput, IssueInput):
    statusId: str | None = Field(default=None, min_length=1)
    # A status name of the issue's team (case-insensitive), e.g. "In Progress", instead of its id.
    # VI: Tên trạng thái của team (không phân biệt hoa thường), ví dụ "In Progress", thay cho id.
    status: str | None = Field(default=None, min_length=1, max_length=100)
    reason: str = Field(min_length=3, max_length=2000)

    @model_validator(mode="after")
    def one_status(self):
        if bool(self.statusId) == bool(self.status):
            raise ValueError("Give exactly one of statusId or status.")
        return self


class ReorderSubIssuesTool(VersionInput, IssueInput):
    """New order of a parent's sub-issues. `issueId` and `expectedVersion` are the parent's;
    `orderedIssueIds` lists every sub-issue the connection can see, by id or identifier, once.
    VI: Thứ tự mới cho sub-issue của một task cha. `issueId` và `expectedVersion` là của task cha;
    VI: `orderedIssueIds` liệt kê mọi sub-issue kết nối nhìn thấy, theo id hoặc mã, mỗi mục một lần."""

    orderedIssueIds: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        min_length=1, max_length=500
    )


class LogWorkTool(WriteInput, IssueInput):
    """Hours the connection's own user spent on an issue on one day; limits match the web form.
    VI: Số giờ chính người dùng của kết nối làm trên một issue trong một ngày; giới hạn giống form web."""

    workDate: date
    hours: float = Field(gt=0, le=24, multiple_of=0.25)
    note: str | None = Field(default=None, max_length=1000)


class StartIssueTool(VersionInput, IssueInput):
    """Plan comment, schedule and the move to work, in one transaction.
    VI: Comment kế hoạch, lịch và việc chuyển sang làm, trong một transaction."""

    plan: str = Field(min_length=1, max_length=20000)
    startDate: str | None = None
    targetDate: str | None = None
    dueDate: str | None = None
    estimatedEffort: float | None = Field(default=None, ge=0, le=10000)
    # Status name of the issue's team; `statusId` wins when given.
    # VI: Tên trạng thái của team; có `statusId` thì dùng `statusId`.
    status: str = Field(default="In Progress", min_length=1, max_length=100)
    statusId: str | None = Field(default=None, min_length=1)


class FinishIssueTool(VersionInput, IssueInput):
    """Result comment, actual effort and the move to review, in one transaction.
    VI: Comment kết quả, effort thực tế và việc chuyển sang review, trong một transaction."""

    result: str = Field(min_length=1, max_length=20000)
    actualEffort: float | None = Field(default=None, ge=0, le=10000)
    status: str = Field(default="Technical Review", min_length=1, max_length=100)
    statusId: str | None = Field(default=None, min_length=1)


class AddCommentTool(WriteInput, IssueInput):
    parentCommentId: str | None = None
    mentionIds: list[str] = Field(default_factory=list, max_length=100)
    content: str = Field(min_length=1, max_length=20000)


class CreateAttachmentUploadTool(WriteInput, IssueInput):
    # The stored name is cleaned like a web upload; the type is derived from it at upload time.
    # VI: Tên lưu được làm sạch như upload trên web; kiểu file suy ra từ tên lúc upload.
    filename: str = Field(min_length=1, max_length=180)


class DeleteAttachmentTool(WriteInput):
    attachmentId: str = Field(min_length=1)


class UpdateCommentTool(VersionInput):
    commentId: str = Field(min_length=1)
    content: str = Field(min_length=1, max_length=20000)


class CreateDocumentTool(WriteInput):
    title: str = Field(min_length=2, max_length=250)
    content: str = Field(default="", max_length=100000)
    docType: DocType | None = None
    # Agents can draft and submit for review; approving (and so publishing) stays with people.
    # VI: Agent được soạn nháp và gửi duyệt; việc duyệt (và phát hành) do người thực hiện.
    status: Literal["DRAFT", "IN_REVIEW"] | None = None
    teamId: str | None = None
    folderId: str | None = None
    # Send one of them. With both, the issue must belong to that project and the document is
    # linked to the issue (CommandService.link_target checks it).
    # VI: Gửi một trong hai. Gửi cả hai thì issue phải thuộc project đó và tài liệu được liên
    # VI: kết với issue (CommandService.link_target kiểm tra).
    projectId: str | None = None
    issueId: str | None = None
    # Off by default: the agent already has what it wrote; the result carries version and outline.
    # VI: Mặc định tắt: agent đã có nội dung vừa ghi; kết quả có version và mục lục.
    includeContent: bool = False


class DocumentEdit(StrictInput):
    oldText: str = Field(min_length=1, max_length=20000)
    newText: str = Field(max_length=95000)


class UpdateDocumentTool(VersionInput, DocumentInput):
    title: str | None = Field(default=None, min_length=2, max_length=250)
    content: str | None = Field(default=None, max_length=100000)
    # Exact-text replacements applied to the current content instead of resending it.
    # VI: Các thay thế đoạn chính xác áp dụng lên nội dung hiện tại thay vì gửi lại cả bài.
    edits: list[DocumentEdit] | None = Field(default=None, min_length=1, max_length=50)
    docType: DocType | None = None
    # Agents can draft and submit for review; approving (and so publishing) stays with people.
    # VI: Agent được soạn nháp và gửi duyệt; việc duyệt (và phát hành) do người thực hiện.
    status: Literal["DRAFT", "IN_REVIEW"] | None = None
    # Off by default: the agent already has what it wrote; the result carries version and outline.
    # VI: Mặc định tắt: agent đã có nội dung vừa ghi; kết quả có version và mục lục.
    includeContent: bool = False

    @model_validator(mode="after")
    def content_or_edits(self):
        if self.content is not None and self.edits:
            raise ValueError("Give content or edits, not both.")
        return self


class UpsertFeatureDocTool(WriteInput, IssueInput):
    """FDS/TDS of one module/feature of the issue's project.
    VI: FDS/TDS của một module/tính năng thuộc dự án của issue."""

    module: str = Field(min_length=2, max_length=120)
    feature: str = Field(min_length=2, max_length=120)
    docType: Literal["FDS", "TDS"]
    content: str | None = Field(default=None, min_length=1, max_length=95000)
    # Updates an existing document by exact-text replacements instead of `content`.
    # VI: Cập nhật tài liệu đã có bằng các thay thế đoạn chính xác thay cho `content`.
    edits: list[DocumentEdit] | None = Field(default=None, min_length=1, max_length=50)
    changeSummary: str = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def content_or_edits(self):
        if (self.content is None) == (not self.edits):
            raise ValueError("Give exactly one of content or edits.")
        return self

    @field_validator("module", "feature", "changeSummary", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class LinkDocumentTool(WriteInput, DocumentInput):
    projectId: str | None = None
    issueId: str | None = None

    @model_validator(mode="after")
    def one_target(self):
        # Both are accepted when the issue is in that project; see CreateDocumentTool.
        # VI: Nhận cả hai khi issue thuộc project đó; xem CreateDocumentTool.
        if not (self.projectId or self.issueId):
            raise ValueError("Give projectId or issueId.")
        return self


class RestoreDocumentTool(VersionInput, DocumentInput):
    revisionVersion: int = Field(ge=1)
    # Off by default: the agent already has what it wrote; the result carries version and outline.
    # VI: Mặc định tắt: agent đã có nội dung vừa ghi; kết quả có version và mục lục.
    includeContent: bool = False


# Argument names that MCP clients were measured sending instead of the published ones (MCP
# audit, Oct-Nov 2026). Only these exact names are mapped; models stay `extra="forbid"`, so any
# other unknown argument is still rejected.
# VI: Tên tham số mà client MCP đã được ghi nhận gửi thay cho tên công bố (audit MCP, 10-11/2026).
# VI: Chỉ ánh xạ đúng các tên này; model vẫn `extra="forbid"` nên tham số lạ khác vẫn bị từ chối.
# `parentIssueId` is not measured: it is the name `reorder_sub_issues` was requested with, and it
# maps only on tools that have no `parentIssueId` field of their own.
# VI: `parentIssueId` không đến từ số đo: đó là tên được đề xuất cho `reorder_sub_issues`, và chỉ
# VI: được ánh xạ ở tool không có trường `parentIssueId` riêng.
ARGUMENT_ALIASES = {
    "issueId": ("identifier", "issueKey", "parentIssueId"),
    "content": ("body",),
}
# Placeholder that some clients send to tools without parameters.
# VI: Tham số giả mà một số client gửi cho tool không có tham số.
IGNORED_ARGUMENTS = frozenset({"random_string"})


def normalize_arguments(model: type[BaseModel], arguments: dict) -> dict:
    """Tolerates the measured client mistakes before strict validation: drops
    `random_string`, maps an alias to its field when the field itself was not sent (a second
    alias or a clash with the real name stays and fails validation), and lowers a `limit`
    above the field's maximum to that maximum. A `limit` below 1 or of the wrong type is left
    for validation to reject. Returns a new dict; the caller keeps the original for the audit.
    VI: Bỏ qua các lỗi client đã đo trước khi kiểm tra chặt: bỏ `random_string`, đổi alias sang
    VI: trường thật khi client chưa gửi trường đó (alias thứ hai hoặc trùng tên thật vẫn để lại
    VI: và bị lỗi), và hạ `limit` vượt mức tối đa về mức tối đa. `limit` nhỏ hơn 1 hoặc sai kiểu
    VI: để phần kiểm tra từ chối. Trả dict mới; bên gọi giữ bản gốc để ghi audit.
    """
    fields = model.model_fields
    normalized = {
        key: value
        for key, value in arguments.items()
        if key not in IGNORED_ARGUMENTS or key in fields
    }
    for target, aliases in ARGUMENT_ALIASES.items():
        if target in fields and target not in normalized:
            alias = next((name for name in aliases if name in normalized), None)
            if alias and alias not in fields:
                normalized[target] = normalized.pop(alias)
    limit, field = normalized.get("limit"), fields.get("limit")
    if field and isinstance(limit, int) and not isinstance(limit, bool):
        maximum = next((item.le for item in field.metadata if isinstance(item, Le)), None)
        if isinstance(maximum, int) and limit > maximum:
            normalized["limit"] = maximum
    return normalized
