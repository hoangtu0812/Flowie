import argparse
import asyncio
import inspect
from contextlib import asynccontextmanager
from dataclasses import replace
import json
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
from flowie_runner.__main__ import main_async
from flowie_runner.claude import REQUIRED_FLAGS, ClaudeProvider
from flowie_runner.config import RunnerConfig
from flowie_runner.codex import CodexProvider
from flowie_runner.orchestrator import LOG_TAIL, execute, log_tail, prepare
from flowie_runner.process import child_environment, run_process
from flowie_runner.repository import Repository


def git_in(path, *args):
    return subprocess.run(
        ["git", *args], cwd=path, check=True, capture_output=True, text=True
    ).stdout.strip()


def fixture_repository(tmp_path):
    # A real local origin lets the runner fetch its base without network access.
    origin = tmp_path / "origin.git"
    subprocess.run(
        ["git", "init", "--quiet", "--bare", "-b", "main", str(origin)],
        check=True,
        capture_output=True,
    )
    repo = tmp_path / "repo"
    repo.mkdir()

    def git(*args):
        return subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)

    git("init", "-b", "main")
    git("config", "user.name", "Runner Test")
    git("config", "user.email", "runner@example.test")
    git("remote", "add", "origin", str(origin))
    (repo / "CHANGELOG.md").write_text(
        "# Changelog\n\n## Unreleased\n", encoding="utf-8"
    )
    git("add", ".")
    git("commit", "-m", "fixture")
    git("push", "--quiet", "origin", "main")
    return RunnerConfig(
        "https://flowie.example.test/mcp/",
        "project",
        "repository",
        str(origin),
        repo,
        "main",
        ((sys.executable, "-c", "print('ok')"),),
    )


def push_base_commit(tmp_path):
    """Advance origin/main from a separate clone, as another author would."""
    other = tmp_path / "other"
    subprocess.run(
        ["git", "clone", "--quiet", str(tmp_path / "origin.git"), str(other)],
        check=True,
        capture_output=True,
    )
    git_in(other, "config", "user.name", "Other Author")
    git_in(other, "config", "user.email", "other@example.test")
    (other / "later.txt").write_text("newer base", encoding="utf-8")
    git_in(other, "add", ".")
    git_in(other, "commit", "-m", "newer base")
    git_in(other, "push", "--quiet", "origin", "main")
    return git_in(other, "rev-parse", "HEAD")


def changelog_editor(seen):
    async def edit(config, context, path):
        seen["path"] = Path(path)
        changelog = Path(path) / "CHANGELOG.md"
        changelog.write_text(
            changelog.read_text() + "\n### Fixed\n- Fixture bug resolved.\n"
        )
        return "Fixture bug fixed with local tests."

    return edit


def client_fixture(repository_url):
    client = AsyncMock()

    async def call(name, args):
        if name == "get_issue":
            return {"id": "issue", "projectId": "project", "title": "Fixture"}
        if name == "get_project_repositories":
            return {
                "items": [
                    {
                        "id": "repository",
                        "repositoryUrl": repository_url,
                        "testCommands": [["evil", "remote command"]],
                    }
                ]
            }
        if name == "get_issue_context":
            return {"comments": []}
        if name == "claim_issue":
            return {
                "id": "fixture-run",
                "leaseToken": "private-lease-token",
                "fencingToken": 1,
            }
        return {}

    client.call.side_effect = call
    return client


def test_parent_tokens_do_not_reach_children_or_inspect(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOWIE_MCP_TOKEN", "never-pass-this")
    monkeypatch.setenv("GH_TOKEN", "never-pass-scm")
    monkeypatch.setenv("DATABASE_URL", "private-database")
    assert not {"FLOWIE_MCP_TOKEN", "GH_TOKEN", "DATABASE_URL"}.intersection(
        child_environment()
    )
    config = fixture_repository(tmp_path)
    client = client_fixture(config.repository_url)
    asyncio.run(prepare(client, config, "issue"))
    assert all(call.args[0] != "claim_issue" for call in client.call.call_args_list)


def test_pending_lists_only_runs_assigned_to_this_connection(tmp_path):
    config = fixture_repository(tmp_path)
    client = AsyncMock()
    client.call.return_value = {"items": [{"issueId": "issue"}]}

    @asynccontextmanager
    async def connect(endpoint):
        yield client

    with (
        patch("flowie_runner.__main__.RunnerConfig") as loader,
        patch("flowie_runner.__main__.Repository") as repository,
        patch("flowie_runner.__main__.CodexProvider") as provider,
        patch("flowie_runner.__main__.connect", connect),
    ):
        loader.load.return_value = config
        repository.return_value, provider.return_value = AsyncMock(), AsyncMock()
        result = asyncio.run(
            main_async(argparse.Namespace(config="fixture.json", command="pending"))
        )
    assert result == {"issueIds": ["issue"]}
    name, arguments = client.call.call_args.args
    assert name == "list_runs"
    assert arguments["state"] == "PENDING"
    assert arguments["assignedToThisConnection"] is True


def test_failed_run_keeps_its_worktree_and_leaves_the_checkout_clean(tmp_path):
    config = fixture_repository(tmp_path)
    client = client_fixture(config.repository_url)
    provider, seen = AsyncMock(), {}

    async def fail(config_, context, path):
        seen["path"] = Path(path)
        (Path(path) / "work.txt").write_text("preserved")
        raise RuntimeError("provider failed")

    provider.execute.side_effect = fail
    with pytest.raises(RuntimeError):
        asyncio.run(execute(client, config, "issue", provider))
    # The provider worked in its own worktree, and the failed work is still there.
    assert seen["path"] != config.repository_path
    assert (seen["path"] / "work.txt").read_text() == "preserved"
    assert not (config.repository_path / "work.txt").exists()
    # The shared checkout stays clean and valid, so the next run is not blocked.
    assert git_in(config.repository_path, "status", "--porcelain") == ""
    asyncio.run(Repository(config).validate())
    result = next(
        call.args[1]
        for call in client.call.call_args_list
        if call.args[0] == "report_run_result"
    )
    assert result["outcome"] == "FAILED"
    assert str(seen["path"]) not in result["summary"]


def test_failed_run_without_changes_leaves_no_worktree_behind(tmp_path):
    config = fixture_repository(tmp_path)
    client = client_fixture(config.repository_url)
    provider, seen = AsyncMock(), {}

    async def fail(config_, context, path):
        seen["path"] = Path(path)
        raise RuntimeError("provider failed before editing")

    provider.execute.side_effect = fail
    with pytest.raises(RuntimeError):
        asyncio.run(execute(client, config, "issue", provider))
    assert not seen["path"].exists()
    assert git_in(config.repository_path, "worktree", "list").count("\n") == 0


def test_runner_records_executed_tests_and_never_auto_publishes(tmp_path):
    config = fixture_repository(tmp_path)
    client, provider, seen = client_fixture(config.repository_url), AsyncMock(), {}
    provider.execute.side_effect = changelog_editor(seen)
    result = asyncio.run(execute(client, config, "issue", provider))
    assert result["state"] == "AWAITING_REVIEW" and result["pullRequestUrl"] is None
    payload = next(
        call.args[1]
        for call in client.call.call_args_list
        if call.args[0] == "report_run_result"
    )
    (evidence,) = payload["tests"]
    assert evidence["name"] == "approved-local-test-1"
    assert evidence["command"] == [sys.executable, "-c", "print('ok')"]
    assert (evidence["exitCode"], evidence["result"]) == (0, "passed")
    assert evidence["log"] == "ok"
    assert isinstance(evidence["durationMs"], int) and evidence["durationMs"] >= 0
    assert len(payload["commit"]) == 40
    # A successful run removes its worktree; the branch in the shared checkout keeps
    # the reviewable commit, and the checkout itself was never touched.
    assert result["worktree"] is None and not seen["path"].exists()
    assert result["branch"] == "codex/flowie-fixture-run"
    assert git_in(config.repository_path, "rev-parse", result["branch"]) == payload["commit"]
    assert git_in(config.repository_path, "status", "--porcelain") == ""
    assert "Fixture bug resolved" not in (
        config.repository_path / "CHANGELOG.md"
    ).read_text()


def test_each_run_starts_from_the_current_origin_base(tmp_path):
    config = fixture_repository(tmp_path)
    stale = git_in(config.repository_path, "rev-parse", "main")
    moved = push_base_commit(tmp_path)
    client, provider, seen = client_fixture(config.repository_url), AsyncMock(), {}
    provider.execute.side_effect = changelog_editor(seen)
    result = asyncio.run(execute(client, config, "issue", provider))
    # The run branches from the freshly fetched origin base, not the stale local ref.
    assert git_in(config.repository_path, "rev-parse", f"{result['branch']}^") == moved
    assert git_in(config.repository_path, "rev-parse", "main") == stale
    assert moved != stale


def test_failing_approved_test_records_its_output_and_exit_code(tmp_path):
    config = replace(
        fixture_repository(tmp_path),
        tests=(
            (
                sys.executable,
                "-c",
                "import sys; print('boom', file=sys.stderr); sys.exit(3)",
            ),
        ),
    )
    client, provider, seen = client_fixture(config.repository_url), AsyncMock(), {}
    provider.execute.side_effect = changelog_editor(seen)
    with pytest.raises(RuntimeError):
        asyncio.run(execute(client, config, "issue", provider))
    payload = next(
        call.args[1]
        for call in client.call.call_args_list
        if call.args[0] == "report_run_result"
    )
    assert payload["outcome"] == "FAILED"
    (evidence,) = payload["tests"]
    assert (evidence["exitCode"], evidence["result"]) == (3, "failed")
    # stderr joins the captured stream, so a failure's diagnostics are not lost.
    assert evidence["log"] == "boom"


def test_timed_out_approved_test_is_recorded_as_a_failure(tmp_path):
    config = replace(
        fixture_repository(tmp_path),
        tests=((sys.executable, "-c", "import time; time.sleep(30)"),),
        command_timeout=1,
    )
    client, provider, seen = client_fixture(config.repository_url), AsyncMock(), {}
    provider.execute.side_effect = changelog_editor(seen)
    with pytest.raises(RuntimeError):
        asyncio.run(execute(client, config, "issue", provider))
    payload = next(
        call.args[1]
        for call in client.call.call_args_list
        if call.args[0] == "report_run_result"
    )
    (evidence,) = payload["tests"]
    assert (evidence["exitCode"], evidence["result"]) == (124, "failed")
    assert "commandTimeout" in evidence["log"]


def test_log_tail_keeps_the_end_and_marks_truncation():
    assert log_tail("short output") == "short output"
    tail = log_tail("head" + "x" * 5000)
    assert tail.endswith("x" * LOG_TAIL) and "head" not in tail
    assert f"truncated to the last {LOG_TAIL} characters" in tail
    # The reported tail stays inside the 4000-character contract bound.
    assert len(tail) < 4000


def test_providers_accept_the_run_worktree_path():
    # The orchestrator hands every provider the run's worktree instead of the shared
    # checkout; the adapter tests that exercise this end to end need a POSIX shell.
    for provider in (ClaudeProvider(), CodexProvider()):
        assert list(inspect.signature(provider.execute).parameters) == [
            "config",
            "context",
            "path",
        ]


def test_worktree_root_must_sit_outside_the_checkout(tmp_path):
    config = fixture_repository(tmp_path)
    asyncio.run(Repository(config).validate())
    inside = replace(config, worktree_root=config.repository_path / "runs")
    with pytest.raises(ValueError):
        asyncio.run(Repository(inside).validate())


def test_lease_loss_cancels_the_provider(tmp_path):
    config = fixture_repository(tmp_path)
    client, provider = client_fixture(config.repository_url), AsyncMock()
    original = client.call.side_effect

    async def revoked(name, args):
        if name == "heartbeat_run":
            raise RuntimeError("revoked")
        return await original(name, args)

    client.call.side_effect = revoked
    canceled = []

    async def wait(*args):
        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            canceled.append(True)
            raise

    provider.execute.side_effect = wait

    class AbsentWorktree:
        """Stands in for a run worktree so the lease can expire before any git work."""

        path, branch = tmp_path / "absent-worktree", "codex/fixture"

        async def dirty(self):
            return False

    with patch(
        "flowie_runner.repository.Repository.worktree",
        new=AsyncMock(return_value=AbsentWorktree()),
    ):
        with pytest.raises(RuntimeError):
            asyncio.run(
                execute(client, config, "issue", provider, heartbeat_interval=0.01)
            )
    assert canceled


def test_codex_adapter_requires_supported_flags_and_process_timeout(tmp_path):
    config = fixture_repository(tmp_path)
    with patch(
        "flowie_runner.codex.run_process", new=AsyncMock(return_value=(0, "old CLI"))
    ):
        with pytest.raises(RuntimeError):
            asyncio.run(CodexProvider().doctor(config))
    with pytest.raises(TimeoutError):
        asyncio.run(
            run_process(
                [sys.executable, "-c", "import time; time.sleep(30)"], tmp_path, 0.1
            )
        )


def test_runner_rejects_remote_credentials_and_unreviewed_config(tmp_path):
    value = {
        "endpoint": "https://user:secret@example.test/mcp/",
        "repositoryUrl": "https://github.com/fixture/repo.git",
        "repositoryPath": str(tmp_path),
        "baseRef": "main",
        "projectId": "project",
        "repositoryId": "repository",
        "tests": [["python", "--version"]],
    }
    path = tmp_path / "config.json"
    path.write_text(json.dumps(value))
    with pytest.raises(ValueError):
        RunnerConfig.load(path)


FAKE_CLAUDE = """#!{python}
import json, os, sys
args = sys.argv[1:]
if args == ["--help"]:
    print({help!r})
elif args[:2] == ["auth", "status"]:
    print(json.dumps({{"loggedIn": {logged_in}}}))
    sys.exit(0 if {logged_in} else 1)
else:
    prompt = sys.stdin.read()
    with open("CHANGELOG.md", "a") as handle:
        handle.write("- Fixture fixed.\\n")
    with open({record!r}, "w") as handle:
        json.dump({{"args": args, "env": sorted(os.environ), "prompt": prompt}}, handle)
    print(json.dumps({{"type": "result", "subtype": "success", "is_error": False,
                      "structured_output": {{"summary": "Fixture fixed by Claude."}}}}))
"""


def fake_claude(tmp_path, *, flags=None, logged_in=True):
    help_text = " ".join(flags if flags is not None else REQUIRED_FLAGS)
    script = tmp_path / "claude"
    script.write_text(
        FAKE_CLAUDE.format(
            python=sys.executable,
            help=help_text,
            logged_in=logged_in,
            record=str(tmp_path / "record.json"),
        )
    )
    script.chmod(0o755)
    return str(script)


@pytest.mark.skipif(os.name == "nt", reason="fake CLI uses a POSIX shebang")
def test_claude_adapter_requires_flags_and_login(tmp_path):
    config = fixture_repository(tmp_path)
    old = replace(config, claude=fake_claude(tmp_path, flags=["--print"]))
    with pytest.raises(RuntimeError, match="Update Claude Code"):
        asyncio.run(ClaudeProvider().doctor(old))
    logged_out = replace(config, claude=fake_claude(tmp_path, logged_in=False))
    with pytest.raises(RuntimeError, match="Sign in"):
        asyncio.run(ClaudeProvider().doctor(logged_out))
    ready = replace(config, claude=fake_claude(tmp_path))
    asyncio.run(ClaudeProvider().doctor(ready))


@pytest.mark.skipif(os.name == "nt", reason="fake CLI uses a POSIX shebang")
def test_claude_adapter_edits_checkout_without_tokens(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("FLOWIE_MCP_TOKEN", "never-pass-this")
    monkeypatch.setenv("GH_TOKEN", "never-pass-scm")
    monkeypatch.setenv("DATABASE_URL", "private-database")
    config = replace(fixture_repository(tmp_path), claude=fake_claude(tmp_path))
    summary = asyncio.run(
        ClaudeProvider().execute(
            config,
            {"issue": {"identifier": "FL-7", "title": "Fixture"}},
            config.repository_path,
        )
    )
    assert summary == "Fixture fixed by Claude."
    assert "Fixture fixed" in (config.repository_path / "CHANGELOG.md").read_text()
    record = json.loads((tmp_path / "record.json").read_text())
    assert not {"FLOWIE_MCP_TOKEN", "GH_TOKEN", "DATABASE_URL"}.intersection(
        record["env"]
    )
    args = record["args"]
    assert "--dangerously-skip-permissions" not in args
    assert {"--print", "--restricted", "--strict-mcp-config"} <= set(args)
    assert args[args.index("--permission-mode") + 1] == "acceptEdits"
    assert args[args.index("--tools") + 1] == "Read,Edit,Write,Glob,Grep"
    assert args[args.index("--name") + 1] == "Flowie FL-7"
    session = args[args.index("--session-id") + 1]
    assert f"claude --resume {session}" in capsys.readouterr().err
    assert "untrusted data" in record["prompt"] and "Fixture" in record["prompt"]


def test_runner_config_selects_provider(tmp_path):
    value = {
        "endpoint": "https://flowie.example.test/mcp/",
        "repositoryUrl": "https://github.com/fixture/repo.git",
        "repositoryPath": str(tmp_path),
        "baseRef": "main",
        "projectId": "project",
        "repositoryId": "repository",
        "tests": [["python", "--version"]],
    }
    path = tmp_path / "config.json"
    path.write_text(json.dumps(value))
    assert RunnerConfig.load(path).provider == "codex"
    path.write_text(
        json.dumps({**value, "provider": "claude", "claude": "/opt/claude"})
    )
    loaded = RunnerConfig.load(path)
    assert (loaded.provider, loaded.claude) == ("claude", "/opt/claude")
    path.write_text(json.dumps({**value, "provider": "other"}))
    with pytest.raises(ValueError):
        RunnerConfig.load(path)
    path.write_text(json.dumps({**value, "worktreeRoot": "relative/runs"}))
    with pytest.raises(ValueError):
        RunnerConfig.load(path)
    absolute = tmp_path / "runs"
    path.write_text(json.dumps({**value, "worktreeRoot": str(absolute)}))
    assert RunnerConfig.load(path).worktree_root == absolute.resolve()
