"""Reference MCP client for connection checks and explicit tool calls."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path

import httpx2
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client


async def run(args) -> None:
    token = os.environ.get("FLOWIE_MCP_TOKEN", "")
    if not token:
        raise SystemExit("Set FLOWIE_MCP_TOKEN before connecting.")
    async with httpx2.AsyncClient(
        headers={"Authorization": f"Bearer {token}"}, timeout=60
    ) as client:
        async with streamable_http_client(args.url, http_client=client) as streams:
            async with ClientSession(*streams) as session:
                await session.initialize()
                if args.command == "list":
                    result = await session.list_tools()
                    print(
                        json.dumps(
                            [
                                {"name": tool.name, "description": tool.description}
                                for tool in result.tools
                            ],
                            ensure_ascii=False,
                            indent=2,
                        )
                    )
                else:
                    arguments = (
                        json.loads(Path(args.arguments).read_text(encoding="utf-8"))
                        if args.arguments
                        else {}
                    )
                    result = await session.call_tool(args.tool, arguments)
                    print(
                        json.dumps(
                            result.structured_content
                            or result.model_dump(mode="json", by_alias=True),
                            ensure_ascii=False,
                            indent=2,
                        )
                    )
                    if result.is_error:
                        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url", required=True, help="Flowie MCP endpoint, ending in /mcp/."
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    call = sub.add_parser("call")
    call.add_argument("tool")
    call.add_argument("--arguments", help="UTF-8 JSON file containing tool arguments.")
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
