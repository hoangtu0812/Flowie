"""Bounded dependency operations; a listening port alone is not readiness."""
import asyncio
from sqlalchemy import text
from ..storage.minio import MinioStorage


async def database_ready(factory):
    if factory is None:
        return False
    async with factory() as db:
        return (await db.execute(text('SELECT 1'))).scalar_one()==1


async def redis_ready(settings):
    reader,writer=await asyncio.open_connection(settings.redis_host,settings.redis_port)
    try:
        writer.write(b'*1\r\n$4\r\nPING\r\n')
        await writer.drain()
        return await reader.readexactly(7)==b'+PONG\r\n'
    finally:
        writer.close()
        await writer.wait_closed()


async def storage_ready(settings):
    return await MinioStorage(settings).ready()


async def bounded_probe(operation,timeout=3):
    try:
        return bool(await asyncio.wait_for(operation,timeout))
    except Exception:
        return False


async def dependency_status(settings,factory=None):
    results=await asyncio.gather(
        bounded_probe(database_ready(factory)),bounded_probe(redis_ready(settings)),bounded_probe(storage_ready(settings)))
    return dict(zip(['postgres','redis','minio'],results,strict=True))
