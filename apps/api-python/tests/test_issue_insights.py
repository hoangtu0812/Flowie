import asyncio
import json
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.issue_search import search_page
from app.modules.work_items.issue_insights import issue_insights


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_insights_cover_all_pages_and_share_filters_and_permissions():
    asyncio.run(verify_insights())


async def verify_insights():
    engine=create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    try:
        async with async_sessionmaker(engine)() as db:
            user={'id':_cuid(),'name':'Report owner'}
            now=_utcnow()
            await db.execute(text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"), {**user,'email':_cuid()+'@example.test','now':now})
            seed=await create_workspace_bootstrap(db,user_id=user['id'],organization_name='Reports',workspace_name=_cuid(),now=now)
            workspace,team=seed['workspace_id'],seed['team_id']
            hidden=_cuid()
            await db.execute(text("INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Hidden','HIDE',:now,:now)"), {'id':hidden,'workspace':workspace,'now':now})
            status=(await db.execute(text("SELECT id FROM issue_statuses WHERE workspace_id=:workspace AND category='UNSTARTED' LIMIT 1"), {'workspace':workspace})).scalar_one()
            for fixture_team,count in [(team,150),(hidden,25)]:
                await db.execute(text('''INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,priority,creator_id,created_at,updated_at)
                    SELECT 'c'||md5(:team||n::text),:workspace,:team,:status,'REP-'||:team||'-'||n,n,'Report issue '||n,
                    CASE WHEN n<=120 THEN 'HIGH'::"IssuePriority" ELSE 'LOW'::"IssuePriority" END,:user,:now,:now
                    FROM generate_series(1,:count) n'''), {'team':fixture_team,'workspace':workspace,'status':status,'user':user['id'],'now':now,'count':count})
            options={'limit':100,'includeSubIssues':True}
            first=await search_page(db,workspace,user['id'],'report-secret',options)
            assert len(first['data'])==100 and first['meta']['total']==150
            second=await search_page(db,workspace,user['id'],'report-secret',{**options,'cursor':first['meta']['nextCursor']})
            assert len(second['data'])==50
            before=await issue_insights(db,workspace,user['id'],options,'status','priority')
            after=await issue_insights(db,workspace,user['id'],{**options,'cursor':first['meta']['nextCursor']},'status','priority')
            assert before==after and before['total']==150
            assert sum(row['total'] for row in before['rows'])==150
            for dimension in ['status','assignee','project','priority']:
                result=await issue_insights(db,workspace,user['id'],options,dimension,dimension)
                assert result['total']==150
            filtered={**options,'filters':json.dumps([{'columnId':'priority','type':'option','operator':'is','values':['high']}])}
            page=await search_page(db,workspace,user['id'],'report-secret',filtered)
            report=await issue_insights(db,workspace,user['id'],filtered,'priority','assignee')
            assert page['meta']['total']==report['total']==120
            assert (await issue_insights(db,workspace,user['id'],{**options,'scope':'assigned'},'status','priority'))['total']==0
            await db.rollback()
    finally:
        await engine.dispose()
