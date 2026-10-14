"""Benchmark synthetic issues on a local test database, rolling fixtures back."""

import argparse
import asyncio
import json
import statistics
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api-python"))
from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap


def baseline_list(ref):
    def source(path, package):
        content = subprocess.check_output(
            ["git", "show", f"{ref}:{path}"], cwd=ROOT
        ).decode("utf-8")
        namespace = {
            "__package__": package,
            "__name__": package + ".benchmark_snapshot",
        }
        exec(compile(content, path, "exec"), namespace)
        return namespace

    rows = source(
        "apps/api-python/app/modules/work_items/issue_queries.py",
        "app.modules.work_items",
    )
    api = source("apps/api-python/app/domains/native_issues.py", "app.domains")
    api["_issue_row"] = rows["_issue_row"]
    return api["list_issues"]


async def main(args):
    parsed = urlsplit(args.database)
    if (
        parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
        or parsed.username != "flowie_test"
        or not parsed.path.startswith("/flowie_")
    ):
        raise SystemExit("A loopback flowie_test database named flowie_* is required.")
    engine = create_async_engine(_async_database_url(args.database))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    count = [0]

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def query_count(*_):
        count[0] += 1

    if args.hydrate_all:
        from app.modules.work_items.issue_queries import _issue_rows
        from app.modules.access.projects import _workspace_access

        async def operation(workspace, team, categories, scope, user, db):
            await _workspace_access(db, workspace, user["id"])
            ids = (
                (
                    await db.execute(
                        text(
                            "SELECT id FROM issues WHERE workspace_id=:workspace AND team_id=:team ORDER BY created_at DESC,id DESC"
                        ),
                        {"workspace": workspace, "team": team},
                    )
                )
                .scalars()
                .all()
            )
            return {"data": await _issue_rows(db, ids, workspace, user["id"])}
    elif args.baseline_ref:
        operation = baseline_list(args.baseline_ref)
    else:
        from app.domains.native_issues import list_issues

        operation = list_issues
    reports = []
    try:
        for size in (1000, 10000):
            async with factory() as db:
                user = {"id": _cuid(), "name": "Performance fixture"}
                now = _utcnow()
                await db.execute(
                    text(
                        "INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES (:id,:email,:name,'ACTIVE',:now,:now)"
                    ),
                    {**user, "email": user["id"] + "@example.test", "now": now},
                )
                seed = await create_workspace_bootstrap(
                    db,
                    user_id=user["id"],
                    organization_name="Benchmark",
                    workspace_name=_cuid(),
                    now=now,
                )
                status = (
                    await db.execute(
                        text(
                            "SELECT id FROM issue_statuses WHERE workspace_id=:id AND category='UNSTARTED' LIMIT 1"
                        ),
                        {"id": seed["workspace_id"]},
                    )
                ).scalar_one()
                await db.execute(
                    text("""INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,created_at,updated_at)
                    SELECT :prefix || n,:workspace,:team,:status,'GEN-' || n,n,'Synthetic task ' || n,:user,:now,:now FROM generate_series(1,:size) n"""),
                    {
                        "prefix": user["id"],
                        "workspace": seed["workspace_id"],
                        "team": seed["team_id"],
                        "status": status,
                        "user": user["id"],
                        "size": size,
                        "now": now,
                    },
                )
                samples, queries, returned = [], [], []
                for sample in range(args.samples):
                    count[0] = 0
                    started = time.perf_counter()
                    result = await operation(
                        seed["workspace_id"], seed["team_id"], None, None, user, db
                    )
                    samples.append((time.perf_counter() - started) * 1000)
                    queries.append(count[0])
                    returned.append(len(result["data"]))
                    print(
                        json.dumps(
                            {
                                "size": size,
                                "sample": sample + 1,
                                "ms": round(samples[-1], 2),
                                "queries": count[0],
                                "returned": returned[-1],
                            }
                        ),
                        flush=True,
                    )
                reports.append(
                    {
                        "dataset": size,
                        "samples": args.samples,
                        "medianMs": round(statistics.median(samples), 2),
                        "p95Ms": round(
                            statistics.quantiles(samples, n=100, method="inclusive")[
                                94
                            ],
                            2,
                        ),
                        "queries": queries,
                        "returned": returned,
                    }
                )
                await db.rollback()
    finally:
        await engine.dispose()
    Path(args.output).write_text(
        json.dumps(
            {
                "baselineRef": args.baseline_ref,
                "hydrateAll": args.hydrate_all,
                "results": reports,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


parser = argparse.ArgumentParser()
parser.add_argument("--database", required=True)
parser.add_argument("--baseline-ref")
parser.add_argument("--hydrate-all", action="store_true")
parser.add_argument("--samples", type=int, default=5)
parser.add_argument("--output", required=True)
asyncio.run(main(parser.parse_args()))
