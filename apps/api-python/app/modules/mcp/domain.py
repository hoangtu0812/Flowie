from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from ...core.errors import ApiError

READ_SCOPES = frozenset(
    {
        "context:read",
        "projects:read",
        "issues:read",
        "comments:read",
        "documents:read",
        "activities:read",
        "reviews:read",
        "runs:read",
    }
)
WRITE_SCOPES = frozenset(
    {
        "issues:write",
        "issues:transition",
        "comments:write",
        "documents:write",
        "runs:write",
    }
)
ALL_SCOPES = READ_SCOPES | WRITE_SCOPES


@dataclass(frozen=True, slots=True)
class Principal:
    connection_id: str
    workspace_id: str
    user: dict[str, Any]
    scopes: frozenset[str]
    team_ids: tuple[str, ...]
    project_ids: tuple[str, ...]
    connection_name: str = ""
    # The workspace's saved MCP workflow, None when it uses the built-in one.
    # VI: Quy trình MCP đã lưu của workspace, None khi dùng quy trình có sẵn.
    instructions: str | None = None

    def require(self, *scopes: str) -> None:
        if not set(scopes).issubset(self.scopes):
            raise ApiError(
                403, "This connection does not have the required scope.", "Forbidden"
            )


principal_context: ContextVar[Principal] = ContextVar("flowie_mcp_principal")


def current_principal() -> Principal:
    try:
        return principal_context.get()
    except LookupError as error:
        raise ApiError(
            401, "An MCP connection token is required.", "Unauthorized"
        ) from error
