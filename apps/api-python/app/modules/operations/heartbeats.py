import asyncio
import time
import uuid

from ...core.clock import utcnow
from ...core.identifiers import cuid
from .commands import (
    HEARTBEAT_INSERT_OPERATION_HEARTBEATS,
)

INSTANCE=uuid.uuid4().hex
LAST_PROGRESS: dict[str, float] = {}


async def heartbeat(factory,job,status=None,*,error=None,progress=False):
    async with factory() as db:
        await db.execute(HEARTBEAT_INSERT_OPERATION_HEARTBEATS,
            {'id':cuid(),'instance':INSTANCE,'job':job,'status':status,'now':utcnow(),
             'progress':utcnow() if progress else None,'failed':int(error is not None),'error':error})
        await db.commit()


async def supervise(factory,job,operation,stop):
    task=asyncio.create_task(operation)
    try:
        while not task.done():
            try:
                await heartbeat(factory,job)
            except Exception:
                pass
            try:
                await asyncio.wait_for(asyncio.shield(task),15)
            except TimeoutError:
                continue
        await task
        if not stop.is_set():
            await heartbeat(factory,job,'failed',error='UnexpectedExit')
    except asyncio.CancelledError:
        raise
    except Exception as error:
        try:
            await heartbeat(factory,job,'failed',error=type(error).__name__)
        except Exception:
            pass
        raise
    finally:
        if not task.done():
            task.cancel()
        await asyncio.gather(task,return_exceptions=True)
        if stop.is_set():
            try:
                await heartbeat(factory,job,'stopped')
            except Exception:
                pass


async def progress(factory,job,operation):
    try:
        result=await operation
    except Exception as error:
        try:
            await heartbeat(factory,job,'degraded',error=type(error).__name__)
        except Exception:
            pass
        raise
    if time.monotonic()-LAST_PROGRESS.get(job,0)>=15:
        try:
            await heartbeat(factory,job,'running',progress=True)
            LAST_PROGRESS[job]=time.monotonic()
        except Exception:
            pass
    return result
