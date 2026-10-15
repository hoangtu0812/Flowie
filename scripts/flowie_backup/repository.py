import json
import os
import re
from urllib.parse import urlsplit

from .process import run


class Repository:
    def __init__(self, binary="restic", *, rehearsal=False):
        self.binary = binary
        location = os.environ.get("RESTIC_REPOSITORY", "")
        if not location or not os.environ.get("RESTIC_PASSWORD_FILE"):
            raise ValueError(
                "Set RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE outside Git."
            )
        if not rehearsal:
            endpoint = urlsplit(location.removeprefix("s3:"))
            if (
                not location.startswith("s3:https://")
                or endpoint.hostname in {"localhost", "127.0.0.1", "::1"}
                or endpoint.username
                or endpoint.password
            ):
                raise ValueError(
                    "Production backups require an independent HTTPS S3 repository with credentials in the environment."
                )

    def call(self, *arguments, cwd=None):
        return run([self.binary, *arguments], cwd=cwd)

    def backup(self, directory):
        output = self.call(
            "backup",
            ".",
            "--tag",
            "flowie-ct107",
            "--host",
            "ct107",
            "--json",
            cwd=directory,
        )
        summaries = [
            entry
            for line in output.splitlines()
            if (entry := json.loads(line)).get("message_type") == "summary"
        ]
        if len(summaries) != 1 or not summaries[0].get("snapshot_id"):
            raise RuntimeError("Backup did not return a committed snapshot identifier.")
        return summaries[0]["snapshot_id"]

    def retention(self, *, apply=False):
        args = [
            "forget",
            "--tag",
            "flowie-ct107",
            "--host",
            "ct107",
            "--group-by",
            "host,tags",
            "--keep-daily",
            "7",
            "--keep-weekly",
            "4",
            "--keep-monthly",
            "6",
        ]
        args += ["--prune"] if apply else ["--dry-run"]
        self.call(*args)

    def restore(self, snapshot, target):
        if not snapshot or not re.fullmatch(r"[a-f0-9]{8,64}", snapshot):
            raise ValueError("Choose an explicit snapshot identifier for restore.")
        if target.exists():
            raise ValueError("Restore target must not exist.")
        target.mkdir(mode=0o700)
        self.call("restore", snapshot, "--target", str(target), "--verify")
