import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from .issue_search import IssueFilter


class IssueSelectionQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    noTeam: bool = False
    noProject: bool = False
    issueType: Literal["TASK", "BUG"] | None = None
    teamId: str | None = Field(default=None, max_length=100)
    projectId: str | None = Field(default=None, max_length=100)
    assigneeId: str | None = Field(default=None, max_length=100)
    creatorId: str | None = Field(default=None, max_length=100)
    cycleId: str | None = Field(default=None, max_length=100)
    scope: Literal["assigned", "created", "subscribed", "activity"] | None = None
    categories: list[
        Literal["triage", "backlog", "unstarted", "started", "completed", "canceled"]
    ] = Field(default_factory=list, max_length=6)
    query: str | None = Field(default=None, max_length=200)
    filters: list[IssueFilter] = Field(default_factory=list, max_length=20)
    includeSubIssues: bool = True

    def options(self):
        values = self.model_dump()
        values["categories"] = ",".join(values["categories"])
        values["filters"] = json.dumps(values["filters"])
        return values
