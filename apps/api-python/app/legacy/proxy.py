from __future__ import annotations

from collections.abc import Iterable

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import Response

HOP_BY_HOP_HEADERS = frozenset(
    {
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
        'host',
        'content-length',
    }
)


def request_headers(headers: Iterable[tuple[str, str]]) -> dict[str, str]:
    return {name: value for name, value in headers if name.lower() not in HOP_BY_HOP_HEADERS}


async def proxy_legacy_request(request: Request, path: str) -> Response:
    """Forward a request to the configured legacy service without changing its contract."""

    client: httpx.AsyncClient = request.app.state.legacy_client
    try:
        legacy_response = await client.request(
            method=request.method,
            url=f'/api/v1/{path}',
            params=request.query_params,
            headers=request_headers(request.headers.items()),
            content=await request.body(),
        )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=503,
            detail='The legacy API is temporarily unavailable.',
        ) from error

    response = Response(content=legacy_response.content, status_code=legacy_response.status_code)
    for name, value in legacy_response.headers.multi_items():
        if name.lower() not in HOP_BY_HOP_HEADERS:
            # append() is required: auth responses legitimately carry two
            # Set-Cookie headers and replacing either would lose a session token.
            response.headers.append(name, value)
    return response
