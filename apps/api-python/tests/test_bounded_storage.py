import asyncio
from unittest.mock import patch

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import ApiError
from app.storage.minio import MinioStorage


def test_export_storage_reads_enforce_the_byte_budget():
    async def verify():
        original = httpx.AsyncClient
        transport = httpx.MockTransport(
            lambda request: httpx.Response(200, content=b"12345678")
        )
        with patch(
            "app.storage.minio.httpx.AsyncClient",
            lambda **kwargs: original(transport=transport, **kwargs),
        ):
            storage = MinioStorage(Settings.from_environment())
            assert await storage.get("synthetic", maximum_bytes=8) == b"12345678"
            with pytest.raises(ApiError):
                await storage.get("synthetic", maximum_bytes=7)

    asyncio.run(verify())
