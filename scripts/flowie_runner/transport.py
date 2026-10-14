from contextlib import asynccontextmanager
import json
import os

import httpx2
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client


class FlowieClient:
    def __init__(self, session):
        self.session = session

    async def call(self, name, arguments):
        result = await self.session.call_tool(name, arguments)
        if result.is_error:
            # Server error content may include task context; keep process logs generic.
            raise RuntimeError(f"Flowie tool {name} failed.")
        payload = result.structured_content
        if payload is None:
            block = next((item for item in result.content if item.type == "text"), None)
            payload = json.loads(block.text) if block else None
        if not isinstance(payload, dict):
            raise RuntimeError("Flowie returned an invalid result envelope.")
        return payload.get("data", payload)


@asynccontextmanager
async def connect(endpoint):
    token = os.environ.get("FLOWIE_MCP_TOKEN")
    if not token:
        raise ValueError("Set FLOWIE_MCP_TOKEN in this parent process.")
    async with httpx2.AsyncClient(
        headers={"Authorization": f"Bearer {token}"}, timeout=60
    ) as client:
        async with streamable_http_client(endpoint, http_client=client) as streams:
            async with ClientSession(*streams) as session:
                await session.initialize()
                yield FlowieClient(session)
