import asyncio
import json
from pathlib import Path
import subprocess
import sys
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
from flowie_runner.config import RunnerConfig
from flowie_runner.codex import CodexProvider
from flowie_runner.orchestrator import execute, prepare
from flowie_runner.process import child_environment, run_process
from flowie_runner.repository import Repository


def fixture_repository(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()

    def git(*args):
        return subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)

    git("init", "-b", "main")
    git("config", "user.name", "Runner Test")
    git("config", "user.email", "runner@example.test")
    git("remote", "add", "origin", "https://github.com/fixture/repo.git")
    (repo / "CHANGELOG.md").write_text(
        "# Changelog\n\n## Unreleased\n", encoding="utf-8"
    )
    git("add", ".")
    git("commit", "-m", "fixture")
    return RunnerConfig(
        "https://flowie.example.test/mcp/",
        "project",
        "repository",
        "https://github.com/fixture/repo.git",
        repo,
        "main",
        ((sys.executable, "-c", "print('ok')"),),
    )


def client_fixture():
    client = AsyncMock()

    async def call(name, args):
        if name == "get_issue":
            return {"id": "issue", "projectId": "project", "title": "Fixture"}
        if name == "get_project_repositories":
            return {
                "items": [
                    {
                        "id": "repository",
                        "repositoryUrl": "https://github.com/fixture/repo.git",
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
    client = client_fixture()
    asyncio.run(prepare(client, fixture_repository(tmp_path), "issue"))
    assert all(call.args[0] != "claim_issue" for call in client.call.call_args_list)


def test_runner_checks_repo_and_preserves_failed_work(tmp_path):
    config = fixture_repository(tmp_path)
    client = client_fixture()
    provider = AsyncMock()

    async def fail(*args):
        (config.repository_path / "work.txt").write_text("preserved")
        raise RuntimeError("provider failed")

    provider.execute.side_effect = fail
    with pytest.raises(RuntimeError):
        asyncio.run(execute(client, config, "issue", provider))
    assert (config.repository_path / "work.txt").exists()
    names = [call.args[0] for call in client.call.call_args_list]
    assert "report_run_result" in names
    result = next(
        call.args[1]
        for call in client.call.call_args_list
        if call.args[0] == "report_run_result"
    )
    assert result["outcome"] == "FAILED"
    with pytest.raises(ValueError):
        asyncio.run(Repository(config).validate())


def test_runner_records_executed_tests_and_never_auto_publishes(tmp_path):
    config = fixture_repository(tmp_path)
    client, provider = client_fixture(), AsyncMock()

    async def edit(*args):
        path = config.repository_path / "CHANGELOG.md"
        path.write_text(path.read_text() + "\n### Fixed\n- Fixture bug resolved.\n")
        return "Fixture bug fixed with local tests."

    provider.execute.side_effect = edit
    result = asyncio.run(execute(client, config, "issue", provider))
    assert result["state"] == "AWAITING_REVIEW" and result["pullRequestUrl"] is None
    payload = next(
        call.args[1]
        for call in client.call.call_args_list
        if call.args[0] == "report_run_result"
    )
    assert payload["tests"] == [{"name": "approved-local-test-1", "result": "passed"}]
    assert len(payload["commit"]) == 40


def test_lease_loss_cancels_the_provider(tmp_path):
    config, client, provider = (
        fixture_repository(tmp_path),
        client_fixture(),
        AsyncMock(),
    )
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
    with patch(
        "flowie_runner.repository.Repository.branch",
        new=AsyncMock(return_value="codex/fixture"),
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
