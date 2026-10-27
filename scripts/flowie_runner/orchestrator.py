import asyncio
import sys
from time import monotonic
from uuid import uuid4

from .process import run_process
from .repository import Repository

# A log tail bounds what a chatty test can push into a run record; failures normally
# explain themselves at the end of their output.
LOG_TAIL = 2000
# Reported when an approved test is stopped at commandTimeout, matching the exit code
# GNU timeout uses for the same condition.
TIMEOUT_EXIT_CODE = 124


def key():
    return str(uuid4())


def log_tail(output):
    if len(output) <= LOG_TAIL:
        return output
    return f"[log truncated to the last {LOG_TAIL} characters]\n" + output[-LOG_TAIL:]


async def run_approved_test(name, command, path, timeout):
    """Execute one approved command and record what can be audited afterwards.

    A timeout is recorded as a failed check instead of propagating, so the evidence
    for a stopped test still reaches the run record; the caller stops the run on any
    non-zero exit code.
    """
    started = monotonic()
    try:
        code, output = await run_process(
            command, path, timeout, capture=True, merge_errors=True
        )
    except TimeoutError:
        code, output = (
            TIMEOUT_EXIT_CODE,
            "The approved test exceeded commandTimeout and was stopped.",
        )
    return {
        "name": name,
        "command": list(command),
        "exitCode": code,
        "result": "passed" if code == 0 else "failed",
        "durationMs": int((monotonic() - started) * 1000),
        "log": log_tail(output),
    }


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


async def retire(repo, workspace, *, keep_work):
    """Remove a run's worktree, keeping it only when it still holds work to inspect.

    The committed work lives on the run branch in the shared checkout, so removal
    never discards a reviewable result. Cleanup failures are reported rather than
    raised: they must not mask a run's own outcome.
    """
    if workspace is None:
        return None
    try:
        if keep_work and await workspace.dirty():
            print(
                f"Run worktree preserved for inspection: {workspace.path}",
                file=sys.stderr,
                flush=True,
            )
            return str(workspace.path)
        await repo.discard(workspace.path)
        return None
    except Exception:
        print(
            f"Run worktree could not be cleaned up: {workspace.path}",
            file=sys.stderr,
            flush=True,
        )
        return str(workspace.path)


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
    workspaces = []

    async def work():
        workspace = await repo.worktree(run["id"])
        workspaces.append(workspace)
        # Review comes first: a read-only pass writes the plan and target end date
        # to the issue, and only then does the provider edit code with that plan.
        # The version is read after the review because any issue update bumps it; a
        # concurrent edit still fails the update and stops the run before any edit.
        # VI: Review chạy trước: một lượt chỉ đọc ghi kế hoạch và ngày kết thúc dự
        # VI: kiến vào issue, sau đó provider mới sửa code theo kế hoạch đó. Version
        # VI: được đọc sau review vì mọi cập nhật issue đều tăng nó; sửa đồng thời
        # VI: vẫn làm update thất bại và dừng run trước khi sửa code.
        review = await provider.review(config, context, workspace.path)
        current = await client.call("get_issue", {"issueId": issue_id})
        await client.call(
            "update_issue",
            {
                "issueId": issue_id,
                "expectedVersion": current["version"],
                "targetDate": review["targetDate"],
                "idempotencyKey": key(),
            },
        )
        await client.call(
            "add_comment",
            {
                "issueId": issue_id,
                "content": f"Plan before implementation (target end date {review['targetDate']}):\n\n{review['plan']}",
                "idempotencyKey": key(),
            },
        )
        summary = await provider.execute(
            config, {**context, "plan": review["plan"]}, workspace.path
        )
        for index, command in enumerate(config.tests):
            evidence = await run_approved_test(
                f"approved-local-test-{index + 1}",
                command,
                workspace.path,
                config.command_timeout,
            )
            tests.append(evidence)
            if evidence["exitCode"]:
                raise RuntimeError(
                    "An approved local test failed; no result was marked successful."
                )
        commit = await workspace.commit(run["id"])
        url = await workspace.publish(run["id"]) if publish else None
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
            "branch": workspaces[0].branch,
            "commit": result["commit"],
            "pullRequestUrl": result["pullRequestUrl"],
            "worktree": await retire(repo, workspaces[0], keep_work=False),
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
        # Local paths stay out of the server-side report; the operator reads them here.
        await retire(repo, workspaces[0] if workspaces else None, keep_work=True)
        raise
    finally:
        heart.cancel()
        await asyncio.gather(heart, return_exceptions=True)
