import asyncio
import uuid
import time

from sqlalchemy import text
from ...core.clock import _utcnow
from ...core.identifiers import _cuid

INSTANCE=uuid.uuid4().hex
LAST_PROGRESS={}


async def heartbeat(factory,job,status=None,*,error=None,progress=False):
    async with factory() as db:
        await db.execute(text('''INSERT INTO operation_heartbeats(id,instance_id,job,status,last_seen_at,last_progress_at,failures,last_error_code)
            VALUES (:id,:instance,:job,COALESCE(:status,'running'),:now,:progress,:failed,:error)
            ON CONFLICT(instance_id,job) DO UPDATE SET status=COALESCE(:status,operation_heartbeats.status),last_seen_at=:now,
            last_progress_at=COALESCE(:progress,operation_heartbeats.last_progress_at),
            failures=operation_heartbeats.failures+:failed,last_error_code=CASE WHEN :progress IS NOT NULL THEN NULL ELSE COALESCE(:error,operation_heartbeats.last_error_code) END'''),
            {'id':_cuid(),'instance':INSTANCE,'job':job,'status':status,'now':_utcnow(),
             'progress':_utcnow() if progress else None,'failed':int(error is not None),'error':error})
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
