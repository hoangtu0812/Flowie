import asyncio
import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.workspaces import UpdateWorkspaceInput, resolve_workspace, update_workspace


def test_workspace_slug_is_limited_to_63_characters():
    with pytest.raises(ValidationError):
        UpdateWorkspaceInput(slug='x' * 64)


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_workspace_slugs_rename_alias_permissions_and_conflicts():
    asyncio.run(verify_workspace_slugs())


async def verify_workspace_slugs():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    factory = async_sessionmaker(engine)
    run = _cuid()[-8:]
    try:
        async with factory() as db:
            now = _utcnow()
            owner, other_owner, member = _cuid(), _cuid(), _cuid()
            for user_id in (owner, other_owner, member):
                await db.execute(text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Slug user',:email,'ACTIVE',:now,:now)"), {'id': user_id, 'email': _cuid() + '@example.test', 'now': now})
            first = (await create_workspace_bootstrap(db, user_id=owner, organization_name='First', workspace_name=f'First {run}', now=now))['workspace_id']
            second = (await create_workspace_bootstrap(db, user_id=other_owner, organization_name='Second', workspace_name=f'Second {run}', now=now))['workspace_id']
            await db.execute(text("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,'MEMBER','ACTIVE',:now,:now)"), {'id': _cuid(), 'workspace': first, 'user': member, 'now': now})
            await db.commit()
            actor = {'id': owner}
            original = (await resolve_workspace(first, actor, db))['data']['slug']
            assert original == f'first-{run}'

            # Saving only the icon keeps the slug, and saving only the slug keeps the icon.
            # VI: Chỉ lưu icon thì giữ slug, chỉ lưu slug thì giữ icon.
            await update_workspace(first, UpdateWorkspaceInput(icon='🏭'), actor, db)
            renamed = (await update_workspace(first, UpdateWorkspaceInput(slug=f'bsr-{run}'), actor, db))['data']
            assert (renamed['slug'], renamed['icon']) == (f'bsr-{run}', '🏭')
            audit = (await db.execute(text("SELECT metadata FROM audit_logs WHERE workspace_id=:w AND action='workspace.slug.updated'"), {'w': first})).scalar_one()
            assert (audit['slug'], audit['previous']) == (f'bsr-{run}', original)

            # The id, the current slug and an earlier slug resolve; non-members get 404.
            # VI: Id, slug hiện tại và slug cũ đều phân giải được; người ngoài nhận 404.
            for key in (first, f'bsr-{run}', original, original.upper()):
                assert (await resolve_workspace(key, actor, db))['data'] == {'id': first, 'slug': f'bsr-{run}'}
            for key, user_id in ((f'bsr-{run}', other_owner), ('missing-workspace', owner)):
                with pytest.raises(ApiError) as error:
                    await resolve_workspace(key, {'id': user_id}, db)
                assert error.value.status_code == 404

            # Another workspace cannot take the current slug or an alias.
            # VI: Workspace khác không lấy được slug hiện tại hay alias.
            for taken in (f'bsr-{run}', original):
                with pytest.raises(ApiError) as error:
                    await update_workspace(second, UpdateWorkspaceInput(slug=taken), {'id': other_owner}, db)
                assert error.value.status_code == 409
            for invalid in ('', 'BSR', 'phòng-dtd', 'a_b', 'a--b', '-a', 'admin', 'auth', 'c' + 'a' * 24):
                with pytest.raises(ApiError) as error:
                    await update_workspace(second, UpdateWorkspaceInput(slug=invalid), {'id': other_owner}, db)
                assert error.value.status_code == 400, invalid
            with pytest.raises(ApiError) as error:
                await update_workspace(first, UpdateWorkspaceInput(slug=f'mine-{run}'), {'id': member}, db)
            assert error.value.status_code == 403

            # A new workspace named like an alias gets a suffix instead of the alias.
            # VI: Workspace mới trùng tên với alias nhận hậu tố thay vì lấy alias.
            third = (await create_workspace_bootstrap(db, user_id=owner, organization_name='Third', workspace_name=f'First {run}', now=now))['workspace_id']
            await db.commit()
            assert (await resolve_workspace(third, actor, db))['data']['slug'] == f'first-{run}-2'

        # Two concurrent renames to the same free slug: exactly one wins.
        # VI: Hai lần đổi đồng thời sang cùng một slug còn trống: đúng một lần thành công.
        async def rename(workspace, user_id):
            async with factory() as session:
                try:
                    await update_workspace(workspace, UpdateWorkspaceInput(slug=f'race-{run}'), {'id': user_id}, session)
                    return 'ok'
                except ApiError as error:
                    return error.status_code

        results = await asyncio.gather(rename(first, owner), rename(second, other_owner))
        assert sorted(map(str, results)) == ['409', 'ok']
    finally:
        await engine.dispose()
