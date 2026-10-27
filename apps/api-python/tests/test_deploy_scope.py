from pathlib import Path
import subprocess

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "deploy-scope.sh"
CHANGELOG = "# Changelog\n\n## Unreleased\n\n## [0.1.0] — 2026-10-01 09:00 +07\n\n- First.\n"


def git(repo, *args):
    return subprocess.run(
        ["git", *args], cwd=repo, check=True, capture_output=True, text=True
    ).stdout.strip()


def commit(repo, files):
    for name, content in files.items():
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    git(repo, "add", "-A")
    git(repo, "commit", "--quiet", "-m", "change")
    return git(repo, "rev-parse", "HEAD")


def scope(repo, before, after):
    return subprocess.run(
        ["bash", str(SCRIPT), before, after],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


@pytest.fixture
def repo(tmp_path):
    git(tmp_path, "init", "--quiet", "-b", "main")
    git(tmp_path, "config", "user.name", "Scope Test")
    git(tmp_path, "config", "user.email", "scope@example.test")
    commit(tmp_path, {"CHANGELOG.md": CHANGELOG, "apps/web/page.tsx": "a\n"})
    return tmp_path


def test_documentation_and_unreleased_entries_skip_deploy(repo):
    base = git(repo, "rev-parse", "HEAD")
    changelog = CHANGELOG.replace("## Unreleased\n", "## Unreleased\n\n- Docs.\n")
    head = commit(
        repo,
        {
            "CHANGELOG.md": changelog,
            "AGENTS.md": "rules\n",
            "docs/release-process.md": "steps\n",
            "apps/web/README.md": "readme\n",
        },
    )
    assert scope(repo, base, head) == "deploy=false"


def test_application_change_deploys(repo):
    base = git(repo, "rev-parse", "HEAD")
    head = commit(repo, {"apps/web/page.tsx": "b\n", "docs/notes.md": "n\n"})
    assert scope(repo, base, head) == "deploy=true"


def test_release_heading_deploys(repo):
    base = git(repo, "rev-parse", "HEAD")
    release = CHANGELOG.replace(
        "## Unreleased\n", "## Unreleased\n\n## [0.2.0] — 2026-10-27 09:00 +07\n"
    )
    head = commit(repo, {"CHANGELOG.md": release})
    assert scope(repo, base, head) == "deploy=true"


def test_renaming_code_into_docs_deploys(repo):
    base = git(repo, "rev-parse", "HEAD")
    (repo / "docs").mkdir()
    git(repo, "mv", "apps/web/page.tsx", "docs/page.tsx")
    git(repo, "commit", "--quiet", "-m", "move")
    assert scope(repo, base, git(repo, "rev-parse", "HEAD")) == "deploy=true"


@pytest.mark.parametrize("before", ["0" * 40, "f" * 40, "not-a-sha"])
def test_new_or_unreachable_base_deploys(repo, before):
    assert scope(repo, before, git(repo, "rev-parse", "HEAD")) == "deploy=true"
