"""Bounded dependency operations; a listening port alone is not readiness."""
import asyncio

from ..storage.minio import MinioStorage
from .queries import (
    DATABASE_READY_SELECT,
)


async def database_ready(factory):
    if factory is None:
        return False
    async with factory() as db:
        return (await db.execute(DATABASE_READY_SELECT)).scalar_one()==1


async def storage_ready(settings):
    return await MinioStorage(settings).ready()


async def bounded_probe(operation,timeout=3):
    try:
        return bool(await asyncio.wait_for(operation,timeout))
    except Exception:
        return False


async def dependency_status(settings,factory=None):
    results=await asyncio.gather(
        bounded_probe(database_ready(factory)),bounded_probe(storage_ready(settings)))
    return dict(zip(['postgres','minio'],results,strict=True))
