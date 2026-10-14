from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from .bug_contracts import BugCreateFields, BugUpdateFields

IssuePriority = Literal["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]


class CreateIssueInput(BugCreateFields):
    workspaceId: str = Field(min_length=1)
    teamId: str = Field(min_length=1)
    title: str = Field(min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    statusId: str | None = None
    projectId: str | None = None
    parentIssueId: str | None = None
    assigneeId: str | None = None
    priority: IssuePriority = "NONE"
    startDate: str | None = None
    targetDate: str | None = None
    dueDate: str | None = None
    labelIds: list[str] | None = Field(default=None, max_length=100)
    estimatedEffort: float | None = Field(default=None, ge=0)
    actualEffort: float | None = Field(default=None, ge=0)


class UpdateIssueInput(BugUpdateFields):
    title: str | None = Field(default=None, min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    statusId: str | None = None
    projectId: str | None = None
    assigneeId: str | None = None
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
    pinned: bool | None = None
    position: int | None = Field(default=None, ge=0)
