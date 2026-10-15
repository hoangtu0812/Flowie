from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .query_contract import IssueSelectionQuery


class BulkChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")
    statusId: str | None = None
    assigneeId: str | None = None
    projectId: str | None = None
    cycleId: str | None = None
    priority: Literal["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"] | None = None
    labelIds: list[str] | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def valid_changes(self):
        if not self.model_fields_set:
            raise ValueError("Choose at least one change.")
        for field in self.model_fields_set & {"statusId", "priority", "labelIds"}:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        for field in self.model_fields_set & {
            "statusId",
            "assigneeId",
            "projectId",
            "cycleId",
        }:
            value = getattr(self, field)
            if value is not None and (not value or len(value) > 100):
                raise ValueError("Invalid reference.")
        if self.labelIds is not None and (
            len(set(self.labelIds)) != len(self.labelIds)
            or any(not value or len(value) > 100 for value in self.labelIds)
        ):
            raise ValueError("Invalid or duplicate label reference.")
        return self


class SelectedIssue(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    version: int = Field(ge=1)


class BulkPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspaceId: str = Field(min_length=1)
    requestKey: str = Field(min_length=8, max_length=128)
    selection: Literal["selected", "all_matching"] = "selected"
    confirmAll: bool = False
    items: list[SelectedIssue] = Field(default_factory=list, max_length=1000)
    query: IssueSelectionQuery = Field(default_factory=IssueSelectionQuery)
    changes: BulkChanges

    @model_validator(mode="after")
    def explicit_selection(self):
        if self.selection == "all_matching" and not self.confirmAll:
            raise ValueError("Confirm selecting all matching issues.")
        if self.selection == "selected" and not self.items:
            raise ValueError("Select at least one issue.")
        if len({i.id for i in self.items}) != len(self.items):
            raise ValueError("Duplicate selected issue.")
        return self
