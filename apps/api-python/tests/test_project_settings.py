import asyncio
import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.native_projects import UpdateProjectInput, get_project, update_project


def test_project_icon_is_limited_like_team_icons():
    with pytest.raises(ValidationError):
        UpdateProjectInput(icon='x' * 17)


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_project_settings_update_name_and_icon_only():
    asyncio.run(verify_project_settings())


async def verify_project_settings():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            owner, outsider = _cuid(), _cuid()
            for user_id in (owner, outsider):
                await db.execute(text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Settings user',:email,'ACTIVE',:now,:now)"), {'id': user_id, 'email': _cuid() + '@example.test', 'now': now})
            seed = await create_workspace_bootstrap(db, user_id=owner, organization_name='Settings', workspace_name=_cuid(), now=now)
            workspace, team = seed['workspace_id'], seed['team_id']
            status = (await db.execute(text('SELECT id FROM issue_statuses WHERE workspace_id=:workspace ORDER BY position LIMIT 1'), {'workspace': workspace})).scalar_one()
            project, issue, milestone = _cuid(), _cuid(), _cuid()
            # A project without a team: only the workspace membership check protects it.
            # VI: Dự án không thuộc team: chỉ kiểm tra thành viên workspace bảo vệ nó.
            await db.execute(text("INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Original name',:identifier,:now,:now)"), {'id': project, 'workspace': workspace, 'identifier': project[-8:], 'now': now})
            await db.execute(text('''INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,project_id,creator_id,created_at,updated_at)
                VALUES (:id,:workspace,:team,:status,'SET-1',1,'Linked issue',:project,:user,:now,:now)'''), {'id': issue, 'workspace': workspace, 'team': team, 'status': status, 'project': project, 'user': owner, 'now': now})
            await db.execute(text("INSERT INTO project_milestones(id,workspace_id,project_id,title,created_at,updated_at) VALUES (:id,:workspace,:project,'Linked milestone',:now,:now)"), {'id': milestone, 'workspace': workspace, 'project': project, 'now': now})
            await db.commit()

            async def linked_rows():
                issue_row = (await db.execute(text('SELECT project_id,title,updated_at FROM issues WHERE id=:id'), {'id': issue})).one()
                milestone_row = (await db.execute(text('SELECT project_id,title,updated_at FROM project_milestones WHERE id=:id'), {'id': milestone})).one()
                return tuple(issue_row), tuple(milestone_row)

            before = await linked_rows()
            actor = {'id': owner, 'name': 'Settings user', 'avatarUrl': None}
            updated = (await update_project(project, UpdateProjectInput(name='  Renamed  ', icon=' 🚀 '), workspace, actor, db))['data']
            assert (updated['name'], updated['icon']) == ('Renamed', '🚀')
            reread = (await get_project(project, workspace, actor, db))['data']
            assert (reread['name'], reread['icon'], reread['identifier']) == ('Renamed', '🚀', project[-8:])
            assert await linked_rows() == before

            cleared = (await update_project(project, UpdateProjectInput(icon=''), workspace, actor, db))['data']
            assert (cleared['name'], cleared['icon']) == ('Renamed', None)

            for invalid in ('     ', None, ' a '):
                with pytest.raises(ApiError) as error:
                    await update_project(project, UpdateProjectInput(name=invalid), workspace, actor, db)
                assert error.value.status_code == 400

            with pytest.raises(ApiError) as error:
                await update_project(project, UpdateProjectInput(name='Taken over'), workspace, {'id': outsider, 'name': 'Outsider', 'avatarUrl': None}, db)
            assert error.value.status_code == 403
            name = (await db.execute(text('SELECT name FROM projects WHERE id=:id'), {'id': project})).scalar_one()
            assert name == 'Renamed'
    finally:
        await engine.dispose()
