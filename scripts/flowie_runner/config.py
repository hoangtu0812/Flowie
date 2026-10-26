from dataclasses import dataclass
import json
from pathlib import Path
from urllib.parse import urlsplit


@dataclass(frozen=True)
class RunnerConfig:
    endpoint: str
    project_id: str
    repository_id: str
    repository_url: str
    repository_path: Path
    base_ref: str
    tests: tuple[tuple[str, ...], ...]
    codex: str = "codex"
    command_timeout: int = 900
    provider: str = "codex"
    claude: str = "claude"
    worktree_root: Path | None = None

    def __post_init__(self):
        # Each run gets its own worktree under this root, beside the checkout rather
        # than inside it. Resolving the default here keeps every caller, including
        # direct construction, working with a concrete path.
        if self.worktree_root is None:
            object.__setattr__(
                self,
                "worktree_root",
                self.repository_path.parent
                / f"{self.repository_path.name}.flowie-worktrees",
            )

    @property
    def base_branch(self) -> str:
        """The base branch name on origin; `baseRef` may name it either way."""
        return self.base_ref.removeprefix("origin/")

    @classmethod
    def load(cls, filename):
        value = json.loads(Path(filename).read_text(encoding="utf-8"))
        if set(value) - {
            "endpoint",
            "projectId",
            "repositoryId",
            "repositoryUrl",
            "repositoryPath",
            "baseRef",
            "tests",
            "codex",
            "commandTimeout",
            "provider",
            "claude",
            "worktreeRoot",
        }:
            raise ValueError("Unknown runner configuration field.")
        for key in ["endpoint", "repositoryUrl"]:
            url = urlsplit(value[key])
            local = (
                key == "endpoint"
                and url.hostname in {"localhost", "127.0.0.1"}
                and url.scheme == "http"
            )
            if (
                (url.scheme != "https" and not local)
                or not url.hostname
                or url.username
                or url.password
                or url.query
                or url.fragment
            ):
                raise ValueError(
                    "Use credential-free HTTPS URLs (loopback MCP may use HTTP)."
                )
        if not urlsplit(value["endpoint"]).path.endswith("/mcp/"):
            raise ValueError("The endpoint must end with /mcp/.")
        tests = value.get("tests", [])
        if (
            not isinstance(tests, list)
            or not 1 <= len(tests) <= 20
            or any(
                not isinstance(command, list)
                or not command
                or len(command) > 50
                or any(
                    not isinstance(arg, str) or not arg or len(arg) > 2000
                    for arg in command
                )
                for command in tests
            )
        ):
            raise ValueError("Approve 1–20 local test commands as argument arrays.")
        base = value["baseRef"]
        if (
            not isinstance(base, str)
            or base.startswith("-")
            or ".." in base
            or any(c.isspace() for c in base)
        ):
            raise ValueError("Invalid base ref.")
        timeout = value.get("commandTimeout", 900)
        if type(timeout) is not int or not 1 <= timeout <= 3600:
            raise ValueError("Command timeout must be between 1 and 3600 seconds.")
        provider = value.get("provider", "codex")
        if provider not in {"codex", "claude"}:
            raise ValueError("Provider must be codex or claude.")
        worktrees = value.get("worktreeRoot")
        if worktrees is not None:
            if not isinstance(worktrees, str) or not worktrees:
                raise ValueError("The worktree root must be an absolute directory path.")
            # Resolved without requiring existence: the runner creates it on first use.
            worktrees = Path(worktrees).expanduser()
            if not worktrees.is_absolute():
                raise ValueError(
                    "The worktree root must be an absolute directory path."
                )
            worktrees = worktrees.resolve()
        return cls(
            value["endpoint"],
            value["projectId"],
            value["repositoryId"],
            value["repositoryUrl"],
            Path(value["repositoryPath"]).resolve(strict=True),
            base,
            tuple(tuple(command) for command in tests),
            value.get("codex", "codex"),
            timeout,
            provider,
            value.get("claude", "claude"),
            worktrees,
        )
