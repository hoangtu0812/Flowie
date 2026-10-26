from __future__ import annotations

from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, model_validator

from ..mcp.contracts import StrictInput, WriteInput, IssueInput, PageInput


class ClaimInput(WriteInput, IssueInput):
    pass


class RunInput(StrictInput):
    runId: str = Field(min_length=1)


class CancelInput(WriteInput, RunInput):
    pass


class LeaseInput(WriteInput, RunInput):
    leaseToken: str = Field(min_length=16, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    fencingToken: int = Field(ge=1)


class ResultInput(LeaseInput):
    outcome: Literal["AWAITING_REVIEW", "FAILED"]
    summary: str = Field(min_length=3, max_length=10000)
    commit: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{7,64}$")
    pullRequestUrl: str | None = Field(default=None, max_length=2048)
    tests: list[dict[str, str]] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def evidence(self):
        if self.pullRequestUrl:
            parsed = urlsplit(self.pullRequestUrl)
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.username
                or parsed.password
            ):
                raise ValueError(
                    "A credential-free HTTPS pull request URL is required."
                )
        if self.outcome == "AWAITING_REVIEW" and not self.commit:
            raise ValueError("A commit is required for a code result awaiting review.")
        if any(
            len(key) > 100 or len(value) > 2000
            for test in self.tests
            for key, value in test.items()
        ):
            raise ValueError("Test evidence entries are too large.")
        return self


class RunPageInput(PageInput):
    state: (
        Literal["PENDING", "RUNNING", "AWAITING_REVIEW", "FAILED", "CANCELED"] | None
    ) = None
    projectId: str | None = None
    # True returns only runs directed at the calling connection, so a runner polls its
    # own queue instead of work routed to another agent.
    assignedToThisConnection: bool | None = None


class RepositoryInput(StrictInput):
    projectId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=100)
    repositoryUrl: str = Field(max_length=2048)
    baseBranch: str = Field(min_length=1, max_length=250)
    testCommands: list[list[str]] = Field(default_factory=list, max_length=20)
    instructions: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def trusted_commands(self):
        parsed = urlsplit(self.repositoryUrl)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.fragment
        ):
            raise ValueError("A credential-free HTTPS repository URL is required.")
        if any(
            not command or len(command) > 50 or any(len(arg) > 2000 for arg in command)
            for command in self.testCommands
        ):
            raise ValueError("Test commands must be bounded argument arrays.")
        if (
            self.baseBranch.startswith("-")
            or ".." in self.baseBranch
            or any(c.isspace() for c in self.baseBranch)
        ):
            raise ValueError("Invalid base branch.")
        return self


class AutomationInput(StrictInput):
    name: str = Field(min_length=2, max_length=100)
    connectionId: str = Field(min_length=1)
    projectId: str = Field(min_length=1)
    labelId: str = Field(min_length=1)
    enabled: bool = False
    dailyLimit: int = Field(default=5, ge=1, le=25)
