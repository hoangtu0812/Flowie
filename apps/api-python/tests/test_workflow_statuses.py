import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.workflow_statuses import mutate_status, statuses
from app.modules.work_items.issue_rules import _ensure_circle_issue_statuses
from app.modules.work_items.contracts import CreateIssueInput
from app.modules.work_items.issues import create_issue


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_workflow_edits_survive_reads_and_reject_conflicts_or_invalid_deletion():
    asyncio.run(verify_workflow())


async def verify_workflow():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    try:
        async with async_sessionmaker(engine)() as db:
            user = {'id':_cuid(),'name':'Workflow owner'}
            now = _utcnow()
            await db.execute(text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"), {**user,'email':_cuid()+'@example.test','now':now})
            seed = await create_workspace_bootstrap(db,user_id=user['id'],organization_name='Workflow',workspace_name=_cuid(),now=now)
            workspace = seed['workspace_id']
            values = {'name':'Quality check','category':'STARTED','color':'#123456','position':20}
            identifier = await mutate_status(db,workspace,user,values)
            initial = next(s for s in await statuses(db,workspace,user) if s['id']==identifier)
            await mutate_status(db,workspace,user,{**values,'name':'Quality review'},identifier=identifier,expected=initial['updatedAt'])
            with pytest.raises(ApiError) as conflict:
                await mutate_status(db,workspace,user,values,identifier=identifier,expected=initial['updatedAt'])
            assert conflict.value.status_code == 409
            await _ensure_circle_issue_statuses(db,workspace)
            edited = next(s for s in await statuses(db,workspace,user) if s['id']==identifier)
            assert edited['name']=='Quality review' and edited['color']=='#123456'
            await create_issue(CreateIssueInput(workspaceId=workspace,teamId=seed['team_id'],title='Workflow issue',statusId=identifier),user,db)
            for remove in [True,False]:
                with pytest.raises(ApiError) as used:
                    await mutate_status(db,workspace,user,{**values,'category':'COMPLETED'},identifier=identifier,expected=edited['updatedAt'],remove=remove)
                assert used.value.status_code==409
            todo = next(s for s in await statuses(db,workspace,user) if s['category']=='UNSTARTED')
            with pytest.raises(ApiError):
                await mutate_status(db,workspace,user,identifier=todo['id'],expected=todo['updatedAt'],remove=True)
            unused = await mutate_status(db,workspace,user,{**values,'name':'Unused'})
            row = next(s for s in await statuses(db,workspace,user) if s['id']==unused)
            await mutate_status(db,workspace,user,identifier=unused,expected=row['updatedAt'],remove=True)
            assert all(s['id']!=unused for s in await statuses(db,workspace,user))
            await db.execute(text("UPDATE workspace_members SET role='MEMBER' WHERE workspace_id=:workspace AND user_id=:user"), {'workspace':workspace,'user':user['id']})
            with pytest.raises(ApiError) as denied:
                await mutate_status(db,workspace,user,values)
            assert denied.value.status_code==403
            await db.rollback()
    finally:
        await engine.dispose()
