import importlib
import json
from pathlib import Path
import sys
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
from flowie_backup import manifest
from flowie_backup.capture import stopped_writers
from flowie_backup.repository import Repository


def test_manifest_detects_corruption_unexpected_files_and_traversal(tmp_path):
    source = tmp_path / "capture"
    source.mkdir()
    (source / "database.dump").write_bytes(b"synthetic database")
    assert manifest.create(source, {"revision": "fixture"}) == 1
    assert len(manifest.verify(source)["files"]) == 1
    (source / "database.dump").write_bytes(b"changed")
    with pytest.raises(ValueError):
        manifest.verify(source)
    (source / "database.dump").write_bytes(b"synthetic database")
    (source / "unexpected").write_bytes(b"not inventoried")
    with pytest.raises(ValueError):
        manifest.verify(source)
    data = json.loads((source / "manifest.json").read_text())
    data["files"][0]["path"] = "../outside"
    (source / "manifest.json").write_text(json.dumps(data))
    with pytest.raises(ValueError):
        manifest.verify(source)


def test_writer_restart_on_failed_capture_preserves_previously_stopped_services():
    module = importlib.import_module("flowie_backup.capture")
    config = {
        "writers": ["api", "worker"],
        "objectsContainer": "minio",
        "migrationContainer": "migrate",
        "databaseContainer": "postgres",
    }
    calls = []

    def state(container):
        return {
            "Running": container not in {"worker", "migrate"},
            "Health": {"Status": "healthy"},
        }

    with (
        patch.object(module, "state", state),
        patch.object(module, "run", lambda args: calls.append(args)),
    ):
        with pytest.raises(RuntimeError, match="synthetic"):
            with stopped_writers(config):
                raise RuntimeError("synthetic failure")
    assert calls == [
        ["docker", "stop", "--time", "60", "api"],
        ["docker", "stop", "--time", "60", "minio"],
        ["docker", "start", "minio"],
        ["docker", "start", "api"],
    ]
    with patch.object(module, "state", lambda _: {"Running": True}):
        with pytest.raises(RuntimeError, match="migration"):
            with stopped_writers(config):
                pytest.fail("Must reject capture during migration")


def test_repository_requires_explicit_offhost_configuration_and_restore_target(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("RESTIC_PASSWORD_FILE", str(tmp_path / "password"))
    for location in [
        "",
        str(tmp_path / "local"),
        "s3:http://insecure.example/bucket",
        "s3:https://127.0.0.1/bucket",
        "s3:https://user:password@host/bucket",
    ]:
        monkeypatch.setenv("RESTIC_REPOSITORY", location)
        with pytest.raises(ValueError):
            Repository()
    monkeypatch.setenv("RESTIC_REPOSITORY", "s3:https://independent.example/bucket")
    repository = Repository()
    with pytest.raises(ValueError):
        repository.restore("latest", tmp_path / "restore")
    with pytest.raises(ValueError):
        repository.restore("snapshot", tmp_path)
    with patch.object(repository, "call") as call:
        repository.retention()
        assert (
            "--dry-run" in call.call_args.args and "--prune" not in call.call_args.args
        )
