"""Optional real encrypted S3, PostgreSQL and physical MinIO recovery rehearsal."""

import asyncio
from dataclasses import replace
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings, _async_database_url
from app.storage.minio import MinioStorage

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
from flowie_backup import manifest
from flowie_backup.repository import Repository
from flowie_backup.process import run

TOOLS = [
    "BACKUP_RESTIC_BINARY",
    "BACKUP_MINIO_BINARY",
    "BACKUP_PG_BIN",
    "MCP_TEST_DATABASE_URL",
]


@pytest.mark.skipif(
    any(not os.getenv(key) for key in TOOLS),
    reason="Real backup rehearsal tools not configured",
)
def test_encrypted_s3_snapshot_restores_database_and_minio_bytes(tmp_path, monkeypatch):
    asyncio.run(rehearse(tmp_path, monkeypatch))


async def rehearse(root, monkeypatch):
    database = urlsplit(os.environ["MCP_TEST_DATABASE_URL"])
    if (
        database.hostname not in {"localhost", "127.0.0.1", "::1"}
        or database.username != "flowie_test"
        or not database.path.startswith("/flowie_")
    ):
        raise ValueError("Rehearsal requires an isolated loopback synthetic database.")
    binary = Path(os.environ["BACKUP_MINIO_BINARY"]).resolve()
    restic = str(Path(os.environ["BACKUP_RESTIC_BINARY"]).resolve())
    pg_bin = Path(os.environ["BACKUP_PG_BIN"]).resolve()
    extension = ".exe" if os.name == "nt" else ""
    capture = root / "capture"
    capture.mkdir()
    data = root / "source-minio"
    log = (root / "minio.log").open("wb")
    processes = []

    def start(directory):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        process = subprocess.Popen(
            [
                str(binary),
                "server",
                str(directory),
                "--address",
                f"127.0.0.1:{port}",
                "--console-address",
                "127.0.0.1:0",
            ],
            stdout=log,
            stderr=log,
            env={
                **os.environ,
                "MINIO_ROOT_USER": "minioadmin",
                "MINIO_ROOT_PASSWORD": "minioadmin123",
            },
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        processes.append(process)
        endpoint = f"http://127.0.0.1:{port}"
        for _ in range(120):
            if process.poll() is not None:
                raise RuntimeError("Synthetic MinIO exited")
            try:
                with urlopen(endpoint + "/minio/health/ready", timeout=1):
                    return process, endpoint
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("Synthetic MinIO readiness timed out")

    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"]),
        isolation_level="AUTOCOMMIT",
    )
    restored_db = "flowie_restore_" + uuid4().hex
    created_db = False
    tables = [
        "users",
        "workspaces",
        "issues",
        "documents",
        "attachments",
        "_prisma_migrations",
    ]
    try:
        process, endpoint = start(data)
        settings = replace(
            Settings.from_environment(),
            s3_endpoint=endpoint,
            s3_access_key="minioadmin",
            s3_secret_key="minioadmin123",
            s3_bucket="flowie-source",
        )
        storage = MinioStorage(settings)
        body = bytes(range(256)) * 64
        key = "fixture/tài liệu % #.bin"
        await storage.put(key, body, "application/octet-stream")
        assert await storage.get(key) == body
        pg_env = {
            **os.environ,
            "PGHOST": database.hostname,
            "PGPORT": str(database.port or 5432),
            "PGUSER": database.username,
            "PGPASSWORD": unquote(database.password or ""),
            "PGDATABASE": database.path[1:],
        }
        run(
            [
                str(pg_bin / ("pg_dump" + extension)),
                "-Fc",
                "--no-owner",
                "--no-acl",
                "--file",
                str(capture / "database.dump"),
            ],
            env=pg_env,
        )
        async with engine.connect() as connection:
            before = {
                table: (
                    await connection.execute(text(f'SELECT COUNT(*) FROM "{table}"'))
                ).scalar_one()
                for table in tables
            }
        process.terminate()
        process.wait(timeout=20)
        shutil.copytree(data, capture / "objects")
        (capture / "production.env").write_text(
            "SYNTHETIC_SECRET=fixture-never-production", encoding="utf8"
        )
        manifest.create(
            capture,
            {
                "revision": "synthetic-rehearsal",
                "databaseFormat": "pg_dump-custom",
                "objectsFormat": "minio-data-directory",
            },
        )
        _, endpoint = start(data)
        password = root / "repository-password"
        password.write_text(uuid4().hex + uuid4().hex, encoding="ascii")
        monkeypatch.setenv("RESTIC_PASSWORD_FILE", str(password))
        monkeypatch.setenv("RESTIC_REPOSITORY", f"s3:{endpoint}/flowie-recovery")
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "minioadmin")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "minioadmin123")
        repository = Repository(restic, rehearsal=True)
        repository.call("init")
        snapshot = repository.backup(capture)
        repository.call("check", "--read-data")
        repository.retention()
        restored = root / "restored"
        repository.restore(snapshot, restored)
        checked = manifest.verify(restored)
        base = next(restored.rglob("manifest.json")).parent
        assert checked["revision"] == "synthetic-rehearsal"
        assert (
            base / "production.env"
        ).read_text() == "SYNTHETIC_SECRET=fixture-never-production"
        _, endpoint = start(base / "objects")
        recovered = MinioStorage(replace(settings, s3_endpoint=endpoint))
        assert await recovered.get(key) == body
        async with engine.connect() as connection:
            await connection.execute(text(f'CREATE DATABASE "{restored_db}"'))
            created_db = True
        run(
            [
                str(pg_bin / ("pg_restore" + extension)),
                "--exit-on-error",
                "--no-owner",
                "--no-acl",
                "--dbname",
                restored_db,
                str(base / "database.dump"),
            ],
            env=pg_env,
        )
        restored_url = (
            os.environ["MCP_TEST_DATABASE_URL"].rsplit("/", 1)[0] + "/" + restored_db
        )
        recovered_engine = create_async_engine(_async_database_url(restored_url))
        try:
            async with recovered_engine.connect() as connection:
                after = {
                    table: (
                        await connection.execute(
                            text(f'SELECT COUNT(*) FROM "{table}"')
                        )
                    ).scalar_one()
                    for table in tables
                }
                assert after == before
                assert (
                    await connection.execute(
                        text(
                            "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL"
                        )
                    )
                ).scalar_one() == 0
        finally:
            await recovered_engine.dispose()
        # Wrong repository passwords must never decrypt a restored capture.
        wrong = root / "wrong-password"
        wrong.write_text("incorrect-synthetic-password")
        monkeypatch.setenv("RESTIC_PASSWORD_FILE", str(wrong))
        with pytest.raises(RuntimeError):
            repository.call("snapshots", "--json")
        (root / "rehearsal-result.json").write_text(
            json.dumps(
                {
                    "snapshot": snapshot,
                    "databaseCounts": after,
                    "objectBytes": len(body),
                    "manifestFiles": len(checked["files"]),
                }
            )
        )
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=20)
        log.close()
        if created_db:
            async with engine.connect() as connection:
                await connection.execute(
                    text(f'DROP DATABASE "{restored_db}" WITH (FORCE)')
                )
        await engine.dispose()
