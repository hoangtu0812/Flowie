from __future__ import annotations

import asyncio
from collections.abc import Iterable

from .config import Settings


async def _tcp_ready(host: str, port: int, timeout: float = 1.5) -> bool:
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout)
        del reader
        writer.close()
        await writer.wait_closed()
        return True
    except (OSError, TimeoutError):
        return False


async def dependency_status(settings: Settings) -> dict[str, bool]:
    """Return TCP readiness for services shared with the legacy API.

    These probes never include credentials or connection strings in a response
    or log message.
    """

    dependencies: Iterable[tuple[str, str, int]] = (
        ('postgres', settings.postgres_host, settings.postgres_port),
        ('redis', settings.redis_host, settings.redis_port),
        ('minio', settings.minio_host, settings.minio_port),
    )
    results = await asyncio.gather(*(_tcp_ready(host, port) for _, host, port in dependencies))
    return {name: result for (name, _, _), result in zip(dependencies, results, strict=True)}
