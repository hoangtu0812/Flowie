import json
import shutil
import re
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from . import manifest
from .process import run


def state(container):
    return json.loads(
        run(["docker", "inspect", "--format", "{{json .State}}", container])
    )


@contextmanager
def stopped_writers(config):
    writers = config["writers"]
    containers = [*writers, config["objectsContainer"]]
    names = [*containers, config["databaseContainer"], config["migrationContainer"]]
    if (
        not writers
        or len(writers) > 10
        or len(set(names)) != len(names)
        or any(
            not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}", name)
            for name in names
        )
    ):
        raise ValueError(
            "Configure distinct, valid container names for application writers, database, migration and storage."
        )
    initial = {name: state(name) for name in containers}
    if state(config["migrationContainer"])["Running"]:
        raise RuntimeError("A migration is running; retry after deployment completes.")
    restarted = []
    try:
        # Stop application writers before object storage; PostgreSQL stays online for pg_dump.
        for container in containers:
            if initial[container]["Running"]:
                # Include an attempted stop because a timed-out client may still stop its container.
                restarted.append(container)
                run(["docker", "stop", "--time", "60", container])
        yield
    finally:
        failures = []
        # Storage starts before application writers; stopped-before-backup containers stay stopped.
        for container in reversed(restarted):
            try:
                run(["docker", "start", container])
                if container == config["objectsContainer"]:
                    for _ in range(60):
                        current = state(container)
                        if current.get("Health", {}).get("Status") == "healthy":
                            break
                        time.sleep(1)
                    else:
                        raise RuntimeError("Object storage did not become healthy.")
            except RuntimeError:
                failures.append(container)
        if failures:
            raise RuntimeError(
                "Could not restart every captured service; inspect Docker immediately."
            )


def capture(config, root):
    production_env = Path(config["productionEnv"]).resolve(strict=True)
    if not production_env.is_file():
        raise ValueError("Production configuration is not a file.")
    revision = (
        run(["git", "-C", config["source"], "rev-parse", "HEAD"]).decode().strip()
    )
    with stopped_writers(config):
        with (root / "database.dump").open("wb") as output:
            run(
                [
                    "docker",
                    "exec",
                    config["databaseContainer"],
                    "sh",
                    "-ec",
                    'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl',
                ],
                stdout=output,
            )
        run(
            [
                "docker",
                "cp",
                f"{config['objectsContainer']}:/data/.",
                str(root / "objects"),
            ]
        )
        shutil.copyfile(production_env, root / "production.env")
        (root / "production.env").chmod(0o600)
    return manifest.create(
        root,
        {
            "revision": revision,
            "capturedAt": datetime.now(timezone.utc).isoformat(),
            "consistency": "application-writers-and-object-store-stopped",
            "databaseFormat": "pg_dump-custom",
            "objectsFormat": "minio-data-directory",
        },
    )
