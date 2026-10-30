import asyncio
import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.native_projects import UpdateProjectInput, get_project, resolve_project, update_project


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


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_project_slugs_default_rename_alias_and_conflicts():
    asyncio.run(verify_project_slugs())


async def verify_project_slugs():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    factory = async_sessionmaker(engine)
    try:
        async with factory() as db:
            now = _utcnow()
            owner, outsider = _cuid(), _cuid()
            for user_id in (owner, outsider):
                await db.execute(text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Slug user',:email,'ACTIVE',:now,:now)"), {'id': user_id, 'email': _cuid() + '@example.test', 'now': now})
            workspace = (await create_workspace_bootstrap(db, user_id=owner, organization_name='Slugs', workspace_name=_cuid(), now=now))['workspace_id']
            # Projects inserted without a slug get one from the identifier; a clash gets an id suffix.
            # VI: Dự án INSERT không kèm slug nhận slug từ identifier; bị trùng thì thêm hậu tố id.
            first, second, third = _cuid(), _cuid(), _cuid()
            for project, identifier in ((first, 'FLOWIE'), (second, 'Flowie'), (third, 'OPS_2')):
                await db.execute(text("INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Slug project',:identifier,:now,:now)"), {'id': project, 'workspace': workspace, 'identifier': identifier, 'now': now})
            await db.commit()
            actor = {'id': owner, 'name': 'Slug user', 'avatarUrl': None}
            slug_of = lambda project: db.execute(text('SELECT slug FROM projects WHERE id=:id'), {'id': project})
            assert (await slug_of(first)).scalar_one() == 'flowie'
            assert (await slug_of(second)).scalar_one() == 'flowie-' + second[-6:]
            assert (await slug_of(third)).scalar_one() == 'ops-2'

            renamed = (await update_project(first, UpdateProjectInput(slug='flowie-app'), workspace, actor, db))['data']
            assert renamed['slug'] == 'flowie-app'
            # The id, the current slug and every earlier slug resolve to the same project.
            # VI: Id, slug hiện tại và mọi slug cũ đều trỏ về cùng một dự án.
            for key in (first, 'flowie-app', 'flowie', 'FLOWIE'):
                assert (await resolve_project(key, workspace, actor, db))['data'] == {'id': first, 'slug': 'flowie-app'}
            await update_project(first, UpdateProjectInput(slug='flowie-v3'), workspace, actor, db)
            assert (await resolve_project('flowie', workspace, actor, db))['data']['slug'] == 'flowie-v3'

            # A current slug or an alias of another project is refused; the old name stays put.
            # VI: Slug hiện tại hoặc alias của dự án khác bị từ chối; slug cũ giữ nguyên.
            for taken in ('flowie-v3', 'flowie', 'flowie-app'):
                with pytest.raises(ApiError) as error:
                    await update_project(third, UpdateProjectInput(slug=taken), workspace, actor, db)
                assert error.value.status_code == 409
            assert (await slug_of(third)).scalar_one() == 'ops-2'
            # A project may go back to one of its own earlier slugs.
            # VI: Dự án được quay lại một slug cũ của chính nó.
            assert (await update_project(first, UpdateProjectInput(slug='flowie'), workspace, actor, db))['data']['slug'] == 'flowie'

            with pytest.raises(ValidationError):
                UpdateProjectInput(slug='x' * 64)
            for invalid in ('', 'Flowie', 'dự-án', 'a_b', 'a b', 'a/b', 'a--b', '-a', 'a-', 'c' + 'a' * 24):
                with pytest.raises(ApiError) as error:
                    await update_project(third, UpdateProjectInput(slug=invalid), workspace, actor, db)
                assert error.value.status_code == 400, invalid

            for action in (
                resolve_project('flowie', workspace, {'id': outsider}, db),
                update_project(first, UpdateProjectInput(slug='mine'), workspace, {'id': outsider, 'name': 'Outsider', 'avatarUrl': None}, db),
            ):
                with pytest.raises(ApiError) as error:
                    await action
                assert error.value.status_code == 403
            with pytest.raises(ApiError) as error:
                await resolve_project('missing', workspace, actor, db)
            assert error.value.status_code == 404

        # Two concurrent renames to the same free slug: exactly one wins.
        # VI: Hai lần đổi đồng thời sang cùng một slug còn trống: đúng một lần thành công.
        async def rename(project):
            async with factory() as session:
                try:
                    await update_project(project, UpdateProjectInput(slug='race'), workspace, actor, session)
                    await session.commit()
                    return 'ok'
                except ApiError as error:
                    return error.status_code

        assert sorted(map(str, await asyncio.gather(rename(second), rename(third)))) == ['409', 'ok']
    finally:
        await engine.dispose()
