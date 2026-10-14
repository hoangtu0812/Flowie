from typing import Literal
from pydantic import BaseModel, Field, model_validator

IssueType = Literal["TASK", "BUG"]
BugSeverity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class BugDetails(BaseModel):
    severity: BugSeverity | None = None
    environment: str | None = Field(default=None, max_length=2000)
    reproductionSteps: str | None = Field(default=None, max_length=10000)
    expectedResult: str | None = Field(default=None, max_length=10000)
    actualResult: str | None = Field(default=None, max_length=10000)


class BugCreateFields(BugDetails):
    issueType: IssueType = "TASK"


class BugUpdateFields(BugDetails):
    issueType: IssueType | None = None

    @model_validator(mode="after")
    def required_type(self):
        if "issueType" in self.model_fields_set and self.issueType is None:
            raise ValueError("issueType cannot be null.")
        return self


BUG_COLUMNS = {
    "issueType": "issue_type",
    "severity": "severity",
    "environment": "environment",
    "reproductionSteps": "reproduction_steps",
    "expectedResult": "expected_result",
    "actualResult": "actual_result",
}
