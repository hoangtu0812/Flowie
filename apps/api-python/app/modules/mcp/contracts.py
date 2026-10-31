from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator

from ..work_items.bug_contracts import BugCreateFields, BugUpdateFields, IssueType, BugSeverity
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


class ProjectInput(StrictInput):
    projectId: str = Field(min_length=1, max_length=100)


class DocumentInput(StrictInput):
    documentId: str = Field(min_length=1, max_length=100)


class DocumentReadInput(DocumentInput):
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=20000, ge=1, le=40000)


class DocumentRevisionInput(DocumentReadInput):
    revisionVersion: int = Field(ge=1)


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


class WriteInput(StrictInput):
    idempotencyKey: str = Field(min_length=8, max_length=128)


class VersionInput(WriteInput):
    expectedVersion: int = Field(ge=1)


class CreateIssueTool(WriteInput, BugCreateFields):
    teamId: str = Field(min_length=1)
    projectId: str | None = None
    parentIssueId: str | None = None
    statusId: str = Field(min_length=1)
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


class UpdateCommentTool(VersionInput):
    commentId: str = Field(min_length=1)
    content: str = Field(min_length=1, max_length=20000)


class CreateDocumentTool(WriteInput):
    title: str = Field(min_length=2, max_length=250)
    content: str = Field(default="", max_length=100000)
    docType: Literal["FDS", "TDS", "ADR", "RCA", "GUIDE", "OTHER"] | None = None
    # Agents can draft and submit for review; approving (and so publishing) stays with people.
    # VI: Agent được soạn nháp và gửi duyệt; việc duyệt (và phát hành) do người thực hiện.
    status: Literal["DRAFT", "IN_REVIEW"] | None = None
    teamId: str | None = None
    folderId: str | None = None
    projectId: str | None = None
    issueId: str | None = None

    @model_validator(mode="after")
    def one_target(self):
        if self.projectId and self.issueId:
            raise ValueError(
                "Link a document to either a project or an issue per request."
            )
        return self


class DocumentEdit(StrictInput):
    oldText: str = Field(min_length=1, max_length=20000)
    newText: str = Field(max_length=95000)


class UpdateDocumentTool(VersionInput, DocumentInput):
    title: str | None = Field(default=None, min_length=2, max_length=250)
    content: str | None = Field(default=None, max_length=100000)
    # Exact-text replacements applied to the current content instead of resending it.
    # VI: Các thay thế đoạn chính xác áp dụng lên nội dung hiện tại thay vì gửi lại cả bài.
    edits: list[DocumentEdit] | None = Field(default=None, min_length=1, max_length=50)
    docType: Literal["FDS", "TDS", "ADR", "RCA", "GUIDE", "OTHER"] | None = None
    # Agents can draft and submit for review; approving (and so publishing) stays with people.
    # VI: Agent được soạn nháp và gửi duyệt; việc duyệt (và phát hành) do người thực hiện.
    status: Literal["DRAFT", "IN_REVIEW"] | None = None

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
        if bool(self.projectId) == bool(self.issueId):
            raise ValueError("Exactly one projectId or issueId is required.")
        return self


class RestoreDocumentTool(VersionInput, DocumentInput):
    revisionVersion: int = Field(ge=1)
