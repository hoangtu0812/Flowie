from pathlib import Path
import re
import shutil
from urllib.parse import urlsplit

from .process import run_process

BRANCH_PREFIX = "codex/flowie-"
# Fetching and checking out a base can involve the network; ordinary ref reads cannot.
NETWORK_TIMEOUT = 300
LOCAL_TIMEOUT = 60


def _same_remote(left, right):
    return (
        left.rstrip("/").removesuffix(".git") == right.rstrip("/").removesuffix(".git")
    )


async def _git(path, *args, timeout=LOCAL_TIMEOUT):
    code, output = await run_process(["git", *args], path, timeout, capture=True)
    if code:
        raise RuntimeError("Git operation failed; inspect the local repository.")
    return output


class Repository:
    """The shared checkout. It owns refs and run worktrees; a run never modifies it."""

    def __init__(self, config):
        self.config = config
        self.path = config.repository_path

    async def git(self, *args, timeout=LOCAL_TIMEOUT):
        return await _git(self.path, *args, timeout=timeout)

    async def validate(self):
        toplevel = await self.git("rev-parse", "--show-toplevel")
        if Path(toplevel).resolve() != self.path:
            raise ValueError("Repository path must be the Git root.")
        remote = await self.git("remote", "get-url", "origin")
        if not _same_remote(remote, self.config.repository_url):
            raise ValueError(
                "The local origin differs from the approved repository URL."
            )
        await self.git("check-ref-format", "--branch", self.config.base_branch)
        # Run worktrees stay outside the checkout so the shared tree is never dirtied
        # and `git add --all` inside one run cannot absorb another run's directory.
        worktrees = self.config.worktree_root
        if worktrees == self.path or self.path in worktrees.parents:
            raise ValueError("The worktree root must be outside the repository path.")

    async def base_commit(self):
        # Every run starts from the current origin base instead of whatever a previous
        # run or a human left in local refs. The explicit refspec makes the result
        # independent of the checkout's own fetch configuration.
        branch = self.config.base_branch
        await self.git(
            "fetch",
            "--no-tags",
            "--prune",
            "origin",
            f"+refs/heads/{branch}:refs/remotes/origin/{branch}",
            timeout=NETWORK_TIMEOUT,
        )
        return await self.git(
            "rev-parse", "--verify", f"refs/remotes/origin/{branch}^{{commit}}"
        )

    async def worktree(self, run_id):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", run_id):
            raise ValueError("Invalid run ID for a local branch.")
        commit = await self.base_commit()
        path = self.config.worktree_root / run_id
        self.config.worktree_root.mkdir(parents=True, exist_ok=True)
        await self.git("worktree", "prune")
        await self.discard(path)
        # -B restarts a reclaimed run from the current base rather than failing on the
        # branch left behind by its previous attempt.
        await self.git(
            "worktree",
            "add",
            "--quiet",
            "-B",
            f"{BRANCH_PREFIX}{run_id}",
            str(path),
            commit,
            timeout=NETWORK_TIMEOUT,
        )
        workspace = RunWorktree(self.config, path, f"{BRANCH_PREFIX}{run_id}")
        if await workspace.dirty():
            raise RuntimeError("The new run worktree is not clean.")
        return workspace

    async def discard(self, path):
        if not Path(path).exists():
            await self.git("worktree", "prune")
            return
        # A directory git no longer tracks as a worktree (interrupted run, manual
        # delete) still has to disappear before the path can be reused.
        code, _ = await run_process(
            ["git", "worktree", "remove", "--force", str(path)],
            self.path,
            LOCAL_TIMEOUT,
            capture=True,
        )
        if code:
            shutil.rmtree(path, ignore_errors=True)
        await self.git("worktree", "prune")
        if Path(path).exists():
            raise RuntimeError("The run worktree could not be removed.")


class RunWorktree:
    """One run's isolated checkout of the base commit on its own branch."""

    def __init__(self, config, path, branch):
        self.config, self.path, self.branch = config, path, branch

    async def git(self, *args, timeout=LOCAL_TIMEOUT):
        return await _git(self.path, *args, timeout=timeout)

    async def dirty(self):
        return bool(await self.git("status", "--porcelain"))

    async def commit(self, run_id):
        if not await self.dirty():
            raise RuntimeError("The provider produced no reviewable changes.")
        if not await self.git("diff", "--name-only", "HEAD", "--", "CHANGELOG.md"):
            raise RuntimeError("CHANGELOG.md must record the change before committing.")
        await self.git("add", "--all", "--", ".")
        await self.git("commit", "-m", f"fix: resolve Flowie run {run_id}")
        return await self.git("rev-parse", "HEAD")

    async def publish(self, run_id):
        if urlsplit(self.config.repository_url).hostname != "github.com":
            raise ValueError(
                "Draft PR publishing currently supports GitHub.com repositories."
            )
        await self.git(
            "push", "--set-upstream", "origin", self.branch, timeout=NETWORK_TIMEOUT
        )
        code, output = await run_process(
            [
                "gh",
                "pr",
                "create",
                "--repo",
                self.config.repository_url,
                "--draft",
                "--head",
                self.branch,
                "--base",
                self.config.base_branch,
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
