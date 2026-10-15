import asyncio
import json
import os
from unittest.mock import patch

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.native_projects import public_list_projects, public_get_project
from app.domains.native_initiatives import list_initiatives, initiative_activity
from app.domains.native_issues import issue_options
from app.modules.search.service import search


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
@pytest.mark.parametrize('role', ['MEMBER', 'ADMIN', 'OWNER'])
def test_portfolio_scope_filters_before_hydration_and_counts(role):
    asyncio.run(verify_scope(role))


async def verify_scope(role):
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            owner, member = {'id': _cuid(), 'name': 'Scope owner'}, {'id': _cuid(), 'name': 'Scope member'}
            for user in [owner, member]:
                await db.execute(text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"), {**user,'email':_cuid()+'@example.test','now':now})
            seed = await create_workspace_bootstrap(db,user_id=owner['id'],organization_name='Scope',workspace_name=_cuid(),now=now)
            workspace, team = seed['workspace_id'], seed['team_id']
            await db.execute(text("INSERT INTO workspace_members(id,workspace_id,user_id,status,role,created_at,updated_at) VALUES (:id,:workspace,:user,'ACTIVE',:role,:now,:now)"), {'id':_cuid(),'workspace':workspace,'user':member['id'],'role':role,'now':now})
            hidden, visible, initiative = _cuid(), _cuid(), _cuid()
            for project, project_team in [(hidden,team),(visible,None)]:
                await db.execute(text("INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,:name,:identifier,:now,:now)"), {'id':project,'workspace':workspace,'team':project_team,'name':'Scope restricted project' if project_team else 'Scope accessible project','identifier':project,'now':now})
            await db.execute(text("INSERT INTO initiatives(id,workspace_id,name,created_at,updated_at) VALUES (:id,:workspace,'Scope initiative',:now,:now)"), {'id':initiative,'workspace':workspace,'now':now})
            for project in [hidden, visible]:
                await db.execute(text('INSERT INTO initiative_projects(initiative_id,project_id,created_at) VALUES (:initiative,:project,:now)'), {'initiative':initiative,'project':project,'now':now})
                await db.execute(text("INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at) VALUES (:id,:workspace,:actor,'initiative.project.linked','initiative',:initiative,CAST(:metadata AS jsonb),:now)"), {'id':_cuid(),'workspace':workspace,'actor':owner['id'],'initiative':initiative,'metadata':json.dumps({'projectId':project,'projectName':'Scope project'}),'now':now})

            async def assert_visible(expected):
                projects = await public_list_projects(workspace,None,member,db)
                assert {p['id'] for p in projects['data']} == expected
                initiatives = await list_initiatives(workspace,member,db)
                item = next(i for i in initiatives['data'] if i['id']==initiative)
                assert {link['project']['id'] for link in item['projectLinks']} == expected
                assert item['_count']['projectLinks'] == len(expected)
                events = await initiative_activity(initiative,workspace,member,db)
                assert {e['metadata']['projectId'] for e in events['data']} == expected
                result = await search(db,workspace,member['id'],'scope-secret','Scope',kind='project')
                assert {r['id'] for r in result['data']} == expected
                with patch.object(db, 'commit', db.flush):
                    options = await issue_options(workspace,None,member,db)
                assert {p['id'] for p in options['data']['projects']} == expected

            assert (await public_get_project(visible[1:],workspace,member,db))['data']['id'] == visible
            with pytest.raises(ApiError) as denied:
                await public_get_project(hidden[1:],workspace,member,db)
            assert denied.value.status_code == 403
            await assert_visible({visible})
            await db.execute(text("INSERT INTO team_members(team_id,user_id,created_at) VALUES (:team,:user,:now)"), {'team':team,'user':member['id'],'now':now})
            await assert_visible({hidden, visible})
            with patch.object(db, 'commit', db.flush):
                scoped_options = await issue_options(workspace,team,member,db)
            assert {p['id'] for p in scoped_options['data']['projects']} == {hidden, visible}
            await db.execute(text('DELETE FROM team_members WHERE team_id=:team AND user_id=:user'), {'team':team,'user':member['id']})
            await assert_visible({visible})
            await db.execute(text("UPDATE workspace_members SET status='INVITED' WHERE workspace_id=:workspace AND user_id=:user"), {'workspace':workspace,'user':member['id']})
            with pytest.raises(ApiError):
                await public_list_projects(workspace,None,member,db)
            with pytest.raises(ApiError):
                await list_initiatives(workspace,member,db)
            await db.rollback()
    finally:
        await engine.dispose()
