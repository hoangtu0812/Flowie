import re

from .process import run_process


class Repository:
    def __init__(self, config):
        self.config = config
        self.path = config.repository_path

    async def git(self, *args):
        code, output = await run_process(["git", *args], self.path, 60, capture=True)
        if code:
            raise RuntimeError("Git operation failed; inspect the local repository.")
        return output

    async def validate(self):
        root = await self.git("rev-parse", "--show-toplevel")
        from pathlib import Path

        if Path(root).resolve() != self.path:
            raise ValueError("Repository path must be the Git root.")
        remote = await self.git("remote", "get-url", "origin")
        if remote.rstrip("/").removesuffix(".git") != self.config.repository_url.rstrip(
            "/"
        ).removesuffix(".git"):
            raise ValueError(
                "The local origin differs from the approved repository URL."
            )
        if await self.git("status", "--porcelain"):
            raise ValueError(
                "Commit or preserve existing work before starting the runner."
            )
        await self.git("check-ref-format", "--branch", self.config.base_ref)
        await self.git("rev-parse", "--verify", f"{self.config.base_ref}^{{commit}}")

    async def branch(self, run_id):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", run_id):
            raise ValueError("Invalid run ID for a local branch.")
        name = f"codex/flowie-{run_id}"
        await self.git("switch", "-c", name, self.config.base_ref)
        return name

    async def commit(self, run_id):
        if not await self.git("status", "--porcelain"):
            raise RuntimeError("The provider produced no reviewable changes.")
        changed = await self.git("diff", "--name-only", "HEAD", "--", "CHANGELOG.md")
        if not changed:
            raise RuntimeError("CHANGELOG.md must record the change before committing.")
        await self.git("add", "--all", "--", ".")
        await self.git("commit", "-m", f"fix: resolve Flowie run {run_id}")
        return await self.git("rev-parse", "HEAD")

    async def publish(self, branch, run_id):
        from urllib.parse import urlsplit

        if urlsplit(self.config.repository_url).hostname != "github.com":
            raise ValueError(
                "Draft PR publishing currently supports GitHub.com repositories."
            )
        await self.git("push", "--set-upstream", "origin", branch)
        code, output = await run_process(
            [
                "gh",
                "pr",
                "create",
                "--repo",
                self.config.repository_url,
                "--draft",
                "--head",
                branch,
                "--base",
                self.config.base_ref.removeprefix("origin/"),
                "--title",
                f"Resolve Flowie run {run_id}",
                "--body",
                "Local agent changes with locally executed test evidence. Review the diff and independent CI before merging.",
            ],
            self.path,
            120,
            capture=True,
        )
        if code:
            raise RuntimeError(
                "PR creation failed; the pushed branch remains available for review."
            )
        url = urlsplit(output)
        if url.scheme != "https" or url.username or url.password or not url.hostname:
            raise RuntimeError("SCM returned an invalid PR URL.")
        return output
