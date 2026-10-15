import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from . import manifest
from .capture import capture
from .repository import Repository


def main():
    parser = argparse.ArgumentParser(
        description="Encrypted Flowie backup and isolated restore verification"
    )
    parser.add_argument(
        "command",
        choices=[
            "initialize",
            "capture",
            "check",
            "retention",
            "restore",
            "verify",
            "status",
        ],
    )
    parser.add_argument("--config", type=Path)
    parser.add_argument("--binary", default="restic")
    parser.add_argument("--rehearsal", action="store_true")
    parser.add_argument("--allow-maintenance", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--snapshot")
    parser.add_argument("--target", type=Path)
    parser.add_argument(
        "--status-file", type=Path, default=Path("/var/lib/flowie-backup/status.json")
    )
    args = parser.parse_args()
    os.umask(0o077)
    if args.command == "verify":
        if not args.target:
            parser.error("--target is required")
        data = manifest.verify(args.target)
        print(
            json.dumps(
                {
                    "verified": True,
                    "files": len(data["files"]),
                    "revision": data.get("revision"),
                }
            )
        )
        return
    if args.command == "status":
        data = json.loads(args.status_file.read_text())
        age = (
            datetime.now(timezone.utc) - datetime.fromisoformat(data["completedAt"])
        ).total_seconds()
        if data.get("state") != "SUCCEEDED" or age > 28 * 3600:
            raise RuntimeError(
                "Backup is failed or older than the 28-hour alert threshold."
            )
        print(json.dumps({"state": data["state"], "ageHours": round(age / 3600, 2)}))
        return
    repository = Repository(args.binary, rehearsal=args.rehearsal)
    if args.command == "initialize":
        repository.call("init")
    elif args.command == "check":
        repository.call("check", "--read-data")
    elif args.command == "retention":
        repository.retention(apply=args.apply)
    elif args.command == "restore":
        if not args.target or not args.snapshot:
            parser.error("--snapshot and --target are required")
        repository.restore(args.snapshot, args.target)
        data = manifest.verify(args.target)
        print(json.dumps({"verified": True, "files": len(data["files"])}))
    elif args.command == "capture":
        if not args.allow_maintenance or not args.config:
            parser.error(
                "capture requires --config and --allow-maintenance; application writers briefly stop"
            )
        config = json.loads(args.config.read_text())
        configured_root = Path(config["scratch"])
        if configured_root.is_symlink():
            raise ValueError("Scratch directory must not be a symbolic link.")
        root = configured_root.resolve()
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if root.is_symlink() or root.stat().st_mode & 0o077:
            raise ValueError("Scratch directory must be private (0700).")
        # Keep this inode locked throughout capture/upload; systemd and deployment use the same lock.
        import fcntl

        lock_path = Path(config["source"]) / ".flowie-operation.lock"
        if not lock_path.is_file() or lock_path.is_symlink():
            raise ValueError(
                "Provision the shared lock owned by the deployment user before capture."
            )
        with lock_path.open("r+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                with tempfile.TemporaryDirectory(
                    prefix="capture-", dir=root
                ) as directory:
                    files = capture(config, Path(directory))
                    snapshot = repository.backup(directory)
                status = {
                    "state": "SUCCEEDED",
                    "snapshot": snapshot,
                    "files": files,
                    "completedAt": datetime.now(timezone.utc).isoformat(),
                }
            except Exception:
                status = {
                    "state": "FAILED",
                    "completedAt": datetime.now(timezone.utc).isoformat(),
                }
                write_status(args.status_file, status)
                raise
            write_status(args.status_file, status)
            print(json.dumps(status))


def write_status(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data), encoding="utf8")
    temporary.chmod(0o600)
    temporary.replace(path)
