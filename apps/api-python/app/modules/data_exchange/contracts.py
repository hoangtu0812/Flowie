from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..work_items.query_contract import IssueSelectionQuery

IMPORT_FIELDS = (
    "externalId",
    "title",
    "description",
    "priority",
    "issueType",
    "severity",
    "environment",
    "reproductionSteps",
    "expectedResult",
    "actualResult",
    "statusId",
    "projectId",
    "assigneeId",
    "startDate",
    "targetDate",
    "dueDate",
)


class CsvInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspaceId: str = Field(min_length=1, max_length=100)
    teamId: str = Field(min_length=1, max_length=100)
    csv: str = Field(min_length=1, max_length=2 * 1024 * 1024)


class ImportPreview(CsvInput):
    requestKey: str = Field(min_length=8, max_length=128)
    sourceKey: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    mapping: dict[str, str] = Field(min_length=2, max_length=16)
    duplicateMode: Literal["skip", "error"] = "skip"


class IssueExport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspaceId: str = Field(min_length=1, max_length=100)
    query: IssueSelectionQuery = Field(default_factory=IssueSelectionQuery)


class DocumentExport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspaceId: str = Field(min_length=1, max_length=100)
    documentIds: list[str] = Field(min_length=1, max_length=100)
    includeAttachments: bool = False
