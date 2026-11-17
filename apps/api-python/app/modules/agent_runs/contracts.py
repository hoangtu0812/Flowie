from __future__ import annotations

from urllib.parse import urlsplit

from pydantic import Field, model_validator

from ..mcp.contracts import StrictInput, WriteInput


def check_repository(url: str, branch: str) -> None:
    """Rejects a repository URL that is not credential-free HTTPS and a base branch that git
    could read as an option or a range; the web form and the MCP tool share these rules.
    VI: Từ chối URL repository không phải HTTPS sạch thông tin đăng nhập và base branch mà git
    VI: có thể hiểu thành tuỳ chọn hay khoảng; form web và tool MCP dùng chung quy tắc này."""
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.fragment
    ):
        raise ValueError("A credential-free HTTPS repository URL is required.")
    if branch.startswith("-") or ".." in branch or any(c.isspace() for c in branch):
        raise ValueError("Invalid base branch.")


class RepositoryInput(StrictInput):
    projectId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=100)
    repositoryUrl: str = Field(max_length=2048)
    baseBranch: str = Field(min_length=1, max_length=250)
    testCommands: list[list[str]] = Field(default_factory=list, max_length=20)
    instructions: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def trusted_commands(self):
        check_repository(self.repositoryUrl, self.baseBranch)
        if any(
            not command or len(command) > 50 or any(len(arg) > 2000 for arg in command)
            for command in self.testCommands
        ):
            raise ValueError("Test commands must be bounded argument arrays.")
        return self


class ConfigureRepositoryTool(WriteInput):
    """Repository location an MCP client may set. Test commands and instructions are absent on
    purpose: coding agents run and follow them, so only an administrator edits them on the web;
    `extra="forbid"` rejects a call that sends them.
    VI: Vị trí repository mà client MCP được đặt. Cố ý không có test commands và instructions:
    VI: coding agent chạy và làm theo chúng, nên chỉ quản trị viên sửa trên web; `extra="forbid"`
    VI: từ chối lời gọi gửi kèm chúng."""

    projectId: str = Field(min_length=1, max_length=100)
    repositoryId: str | None = Field(default=None, min_length=1, max_length=100)
    name: str = Field(min_length=2, max_length=100)
    repositoryUrl: str = Field(max_length=2048)
    baseBranch: str = Field(min_length=1, max_length=250)

    @model_validator(mode="after")
    def trusted_location(self):
        check_repository(self.repositoryUrl, self.baseBranch)
        return self
