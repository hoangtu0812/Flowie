import argparse
import asyncio
import json

from .claude import ClaudeProvider
from .codex import CodexProvider
from .config import RunnerConfig
from .orchestrator import execute, prepare
from .repository import Repository
from .transport import connect


async def main_async(args):
    config = RunnerConfig.load(args.config)
    provider = ClaudeProvider() if config.provider == "claude" else CodexProvider()
    await Repository(config).validate()
    await provider.doctor(config)
    if args.command == "doctor":
        return {
            "ready": True,
            "provider": "Claude Code" if config.provider == "claude" else "Codex CLI",
            "publishing": "requires --publish",
        }
    async with connect(config.endpoint) as client:
        if args.command == "pending":
            # shortcut: first 100 queued runs only; drain the rest on the next poll.
            page = await client.call(
                "list_runs",
                {"state": "PENDING", "projectId": config.project_id, "limit": 100},
            )
            return {"issueIds": [row["issueId"] for row in page.get("items", [])]}
        if args.command == "inspect":
            issue, _ = await prepare(client, config, args.issue)
            return {
                "issueId": issue,
                "projectId": config.project_id,
                "contextLoaded": True,
                "claimed": False,
            }
        return await execute(client, config, args.issue, provider, publish=args.publish)


def main():
    parser = argparse.ArgumentParser(
        description="Local Flowie runner using the existing Codex or Claude Code login."
    )
    parser.add_argument(
        "--config",
        required=True,
        help="Locally reviewed JSON configuration; never include tokens.",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor")
    sub.add_parser(
        "pending", help="List issues with automation runs awaiting a runner."
    )
    for name in ["inspect", "run"]:
        command = sub.add_parser(name)
        command.add_argument("--issue", required=True)
        if name == "run":
            command.add_argument(
                "--publish",
                action="store_true",
                help="Authorize pushing the run branch and creating a draft PR using existing gh credentials.",
            )
    try:
        print(
            json.dumps(asyncio.run(main_async(parser.parse_args())), ensure_ascii=False)
        )
    except KeyboardInterrupt:
        raise SystemExit("Runner canceled; local work is preserved.")
    except Exception:
        raise SystemExit(
            "Runner stopped. Inspect Flowie run state, configuration and preserved local work before retrying."
        )


if __name__ == "__main__":
    main()
