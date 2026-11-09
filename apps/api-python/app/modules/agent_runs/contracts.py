from __future__ import annotations

from urllib.parse import urlsplit

from pydantic import Field, model_validator

from ..mcp.contracts import StrictInput


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
