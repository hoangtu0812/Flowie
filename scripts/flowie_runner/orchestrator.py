import asyncio
from uuid import uuid4

from .process import run_process
from .repository import Repository


def key():
    return str(uuid4())


async def prepare(client, config, issue_id):
    issue = await client.call("get_issue", {"issueId": issue_id})
    if issue.get("projectId") != config.project_id:
        raise ValueError("The issue is outside the locally approved project.")
    repositories = await client.call(
        "get_project_repositories", {"projectId": config.project_id}
    )
    selected = next(
        (
            row
            for row in repositories.get("items", [])
            if row["id"] == config.repository_id
        ),
        None,
    )
    if not selected or selected["repositoryUrl"] != config.repository_url:
        raise ValueError(
            "Project repository configuration differs from local approval."
        )
    context = await client.call("get_issue_context", {"issueId": issue["id"]})
    # Remote test commands are informational; only local command arrays execute.
    return issue["id"], {
        "issue": issue,
        "context": context,
        "repositoryInstructions": selected.get("instructions", ""),
    }


async def execute(
    client, config, issue_id, provider, *, publish=False, heartbeat_interval=60
):
    repo = Repository(config)
    await repo.validate()
    await provider.doctor(config)
    issue_id, context = await prepare(client, config, issue_id)
    run = await client.call(
        "claim_issue", {"issueId": issue_id, "idempotencyKey": key()}
    )
    lease = {
        "runId": run["id"],
        "leaseToken": run["leaseToken"],
        "fencingToken": run["fencingToken"],
    }

    async def heartbeat():
        while True:
            await asyncio.sleep(heartbeat_interval)
            await client.call("heartbeat_run", {**lease, "idempotencyKey": key()})

    tests = []

    async def work():
        branch = await repo.branch(run["id"])
        summary = await provider.execute(config, context)
        for index, command in enumerate(config.tests):
            code, _ = await run_process(command, repo.path, config.command_timeout)
            tests.append(
                {
                    "name": f"approved-local-test-{index + 1}",
                    "result": "passed" if code == 0 else "failed",
                }
            )
            if code:
                raise RuntimeError(
                    "An approved local test failed; no result was marked successful."
                )
        commit = await repo.commit(run["id"])
        url = await repo.publish(branch, run["id"]) if publish else None
        await client.call("heartbeat_run", {**lease, "idempotencyKey": key()})
        return {
            "outcome": "AWAITING_REVIEW",
            "summary": summary,
            "commit": commit,
            "pullRequestUrl": url,
            "tests": tests,
        }

    heart = asyncio.create_task(heartbeat())
    worker = asyncio.create_task(work())
    try:
        done, _ = await asyncio.wait(
            [heart, worker], return_when=asyncio.FIRST_COMPLETED
        )
        if heart in done:
            await heart
            raise RuntimeError("Run heartbeat stopped unexpectedly.")
        result = await worker
        await client.call(
            "report_run_result", {**lease, "idempotencyKey": key(), **result}
        )
        return {
            "runId": run["id"],
            "state": "AWAITING_REVIEW",
            "commit": result["commit"],
            "pullRequestUrl": result["pullRequestUrl"],
        }
    except BaseException as error:
        worker.cancel()
        await asyncio.gather(worker, return_exceptions=True)
        try:
            if isinstance(error, (asyncio.CancelledError, KeyboardInterrupt)):
                await client.call("release_issue", {**lease, "idempotencyKey": key()})
            else:
                await client.call(
                    "report_run_result",
                    {
                        **lease,
                        "idempotencyKey": key(),
                        "outcome": "FAILED",
                        "summary": "Local execution stopped before a successful reviewable result. Inspect preserved work on the local machine.",
                        "tests": tests,
                    },
                )
        except Exception:
            try:
                await client.call("release_issue", {**lease, "idempotencyKey": key()})
            except Exception:
                pass
        raise
    finally:
        heart.cancel()
        await asyncio.gather(heart, return_exceptions=True)
