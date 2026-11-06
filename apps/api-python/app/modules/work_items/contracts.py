from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from .bug_contracts import BugCreateFields, BugUpdateFields

# Every document type REST and MCP accept. `documents.doc_type` is TEXT without a CHECK
# constraint, so this list is the only gate: adding a type needs no migration.
# VI: Mọi loại tài liệu REST và MCP chấp nhận. `documents.doc_type` là TEXT không có CHECK
# VI: constraint, nên danh sách này là chốt kiểm tra duy nhất: thêm loại không cần migration.
DocType = Literal[
    "FDS", "TDS", "BRD", "SRS", "PROTOTYPE", "TEST", "MINUTES", "ADR", "RCA", "GUIDE", "OTHER"
]

IssuePriority = Literal["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]


class CreateIssueInput(BugCreateFields):
    workspaceId: str = Field(min_length=1)
    teamId: str | None = Field(default=None, min_length=1)
    title: str = Field(min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    statusId: str | None = None
    projectId: str | None = None
    parentIssueId: str | None = None
    assigneeId: str | None = None
    # Defaults to the creator. VI: Mặc định là người tạo.
    reporterId: str | None = None
    priority: IssuePriority = "NONE"
    startDate: str | None = None
    targetDate: str | None = None
    dueDate: str | None = None
    labelIds: list[str] | None = Field(default=None, max_length=100)
    estimatedEffort: float | None = Field(default=None, ge=0)
    actualEffort: float | None = Field(default=None, ge=0)


SubIssueSort = Literal["manual", "identifier-asc", "identifier-desc", "status-asc", "status-desc"]


class UpdateIssueInput(BugUpdateFields):
    # Version the client read; a different current version refuses the update (409) so a drag on
    # a stale timeline never overwrites someone else's change. Omitted keeps last-write-wins.
    # VI: Version client đã đọc; version hiện tại khác thì từ chối (409) để thao tác kéo trên
    # VI: timeline cũ không ghi đè thay đổi của người khác. Không gửi thì giữ ghi-sau-thắng.
    expectedVersion: int | None = Field(default=None, ge=1)
    subIssueSort: SubIssueSort | None = None
    title: str | None = Field(default=None, min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    statusId: str | None = None
    projectId: str | None = None
    parentIssueId: str | None = None
    assigneeId: str | None = None
    # Null resets the reporter to the creator. VI: Null đưa reporter về người tạo.
    reporterId: str | None = None
    priority: IssuePriority | None = None
    startDate: str | None = None
    targetDate: str | None = None
    dueDate: str | None = None
    labelIds: list[str] | None = Field(default=None, max_length=100)
    releaseIds: list[str] | None = Field(default=None, max_length=100)
    estimatedEffort: float | None = Field(default=None, ge=0)
    actualEffort: float | None = Field(default=None, ge=0)


class CommentInput(BaseModel):
    expectedVersion: int | None = Field(default=None, ge=1)
    mentionIds: list[str] | None = Field(default=None, max_length=100)
    content: str | None = Field(default=None, min_length=1, max_length=20_000)
    body: dict[str, Any] | None = None


class CreateCommentInput(CommentInput):
    clientRequestKey: str | None = Field(default=None, min_length=8, max_length=128)
    parentCommentId: str | None = Field(default=None, min_length=1)
    workspaceId: str = Field(min_length=1)
    issueId: str = Field(min_length=1)


class CreateDocumentInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    teamId: str | None = None
    folderId: str | None = None
    title: str = Field(min_length=2, max_length=250)
    content: str = Field(default="", max_length=100000)
    icon: str | None = Field(default=None, min_length=1, max_length=32)
    sourceType: Literal["markdown", "flowie", "upload", "link"] = "markdown"
    sourceUrl: str | None = Field(default=None, max_length=2048)
    docType: DocType = "OTHER"
    status: Literal["DRAFT", "IN_REVIEW", "APPROVED"] = "DRAFT"
    pinned: bool = False
    position: int | None = Field(default=None, ge=0)


class UpdateDocumentInput(BaseModel):
    expectedVersion: int | None = Field(default=None, ge=1)
    folderId: str | None = None
    title: str | None = Field(default=None, min_length=2, max_length=250)
    content: str | None = Field(default=None, max_length=100000)
    icon: str | None = Field(default=None, min_length=1, max_length=32)
    sourceType: Literal["markdown", "flowie", "upload", "link"] | None = None
    sourceUrl: str | None = Field(default=None, max_length=2048)
    docType: DocType | None = None
    status: Literal["DRAFT", "IN_REVIEW", "APPROVED"] | None = None
    pinned: bool | None = None
    position: int | None = Field(default=None, ge=0)

    @field_validator('title', 'content', 'sourceType', 'docType', 'status', 'pinned', 'position')
    @classmethod
    def reject_explicit_null(cls, value):
        if value is None:
            raise ValueError('Omit unchanged document fields instead of sending null.')
        return value
