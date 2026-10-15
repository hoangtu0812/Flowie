import asyncio
import os
from datetime import timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker,create_async_engine

from app.core.config import _async_database_url
from app.core.clock import _utcnow
from app.core.identifiers import _cuid
from app.core.errors import ApiError
from app.core.readiness import database_ready
from app.domains.auth import create_workspace_bootstrap
from app.modules.operations import heartbeats
from app.modules.operations.api import overview


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'),reason='Test database not configured')
def test_operations_persistence_distinguishes_failed_stale_and_denied():
    asyncio.run(verify())


async def verify():
    engine=create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    factory=async_sessionmaker(engine)
    instance='audit-'+_cuid()
    try:
        assert await database_ready(factory)
        with patch.object(heartbeats,'INSTANCE',instance):
            await heartbeats.heartbeat(factory,'test-job')
            await heartbeats.heartbeat(factory,'test-job','degraded',error='TestFailure')
            await heartbeats.heartbeat(factory,'test-job')
            async with factory() as db:
                row=(await db.execute(text('SELECT * FROM operation_heartbeats WHERE instance_id=:instance'),{'instance':instance})).mappings().one()
                assert row['status']=='degraded' and row['failures']==1 and row['last_error_code']=='TestFailure'
            await heartbeats.heartbeat(factory,'test-job','running',progress=True)
            async with factory() as db:
                user={'id':_cuid(),'name':'Operations owner'}
                now=_utcnow()
                await db.execute(text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),{**user,'email':_cuid()+'@example.test','now':now})
                seed=await create_workspace_bootstrap(db,user_id=user['id'],organization_name='Operations',workspace_name=_cuid(),now=now)
                await db.execute(text('UPDATE operation_heartbeats SET last_seen_at=:past WHERE instance_id=:instance'),{'past':now-timedelta(seconds=90),'instance':instance})
                data=(await overview(seed['workspace_id'],user,db))['data']
                job=next(j for j in data['jobs'] if j['instance']==instance)
                assert job['status']=='stale' and job['lastProgressAt'] is not None and job['lastErrorCode'] is None
                await db.execute(text("UPDATE workspace_members SET role='MEMBER' WHERE workspace_id=:workspace AND user_id=:user"),{'workspace':seed['workspace_id'],'user':user['id']})
                with pytest.raises(ApiError) as denied:
                    await overview(seed['workspace_id'],user,db)
                assert denied.value.status_code==403
                await db.rollback()
    finally:
        async with factory() as db:
            await db.execute(text('DELETE FROM operation_heartbeats WHERE instance_id=:instance'),{'instance':instance})
            await db.commit()
        await engine.dispose()
