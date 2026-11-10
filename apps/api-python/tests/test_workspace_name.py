import asyncio
import os
from dataclasses import replace

import httpx
import pytest
from argon2 import PasswordHasher
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings, _async_database_url
from app.db.session import get_session
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.main import create_app
from app.modules.workspaces.api import UpdateWorkspaceInput


def test_workspace_name_contract_preserves_partial_updates_and_unicode_limit():
    assert UpdateWorkspaceInput(icon='🏭').model_dump(exclude_unset=True) == {'icon': '🏭'}
    assert UpdateWorkspaceInput(name='📚' * 120).name == '📚' * 120
    with pytest.raises(ValidationError):
        UpdateWorkspaceInput(name='x' * 121)


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_workspace_name_permissions_validation_audit_and_stable_urls():
    asyncio.run(verify_workspace_name())


async def verify_workspace_name():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    settings = replace(Settings.from_environment(), auth_jwt_secret='workspace-name-test-secret-at-least-32-characters', auth_cookie_secure=False)
    user_ids = [_cuid() for _ in range(6)]
    owner, admin, member, viewer, inactive, outsider = user_ids
    organization_id = None
    clients = []
    password = 'Synthetic-name-test-password-2026'
    try:
        async with factory() as db:
            now = _utcnow()
            password_hash = PasswordHasher().hash(password)
            for user_id in user_ids:
                await db.execute(text("INSERT INTO users(id,email,name,password_hash,status,created_at,updated_at) VALUES (:id,:email,'Synthetic rename user',:hash,'ACTIVE',:now,:now)"), {'id': user_id, 'email': user_id + '@example.test', 'hash': password_hash, 'now': now})
            seed = await create_workspace_bootstrap(db, user_id=owner, organization_name='Synthetic name organization', workspace_name='Original ' + _cuid(), now=now)
            workspace = seed['workspace_id']
            organization_id = await db.scalar(text('SELECT organization_id FROM workspaces WHERE id=:id'), {'id': workspace})
            for user_id, role, status in [(admin, 'ADMIN', 'ACTIVE'), (member, 'MEMBER', 'ACTIVE'), (viewer, 'ADMIN_VIEWER', 'ACTIVE'), (inactive, 'ADMIN', 'INVITED')]:
                await db.execute(text('INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,:role,:status,:now,:now)'), {'id': _cuid(), 'workspace': workspace, 'user': user_id, 'role': role, 'status': status, 'now': now})
            await db.execute(text('UPDATE users SET is_platform_admin=true WHERE id=:id'), {'id': outsider})
            await db.commit()

        app = create_app(settings)
        async def session_dependency():
            async with factory() as db:
                yield db
        app.dependency_overrides[get_session] = session_dependency
        app.state.session_factory = factory
        for user_id in user_ids:
            client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver')
            clients.append(client)
            login = await client.post('/api/v1/auth/login', json={'email': user_id + '@example.test', 'password': password})
            assert login.status_code == 200, login.text
        owner_client, admin_client, member_client, viewer_client, inactive_client, outsider_client = clients
        url = f'/api/v1/workspaces/{workspace}'
        memberships = (await owner_client.get('/api/v1/workspaces/me')).json()['data']
        before = next(item['workspace'] for item in memberships if item['workspace']['id'] == workspace)
        old_slug = before['slug']
        current_slug = 'renamed-' + _cuid()[-8:]
        changed = await owner_client.patch(url, json={'icon': '🏭', 'slug': current_slug})
        assert changed.status_code == 200, changed.text
        async with factory() as db:
            aliases = list((await db.execute(text('SELECT slug FROM workspace_slugs WHERE workspace_id=:id ORDER BY slug'), {'id': workspace})).scalars())

        renamed = await owner_client.patch(url, json={'name': ' \tPhòng nghiên cứu 📚\n '})
        assert renamed.status_code == 200, renamed.text
        value = renamed.json()['data']
        assert (value['id'], value['name'], value['slug'], value['icon']) == (workspace, 'Phòng nghiên cứu 📚', current_slug, '🏭')
        assert value['organization'] == before['organization']
        for key in (workspace, old_slug, current_slug):
            resolved = await owner_client.get('/api/v1/workspaces/resolve', params={'key': key})
            assert resolved.status_code == 200, resolved.text
            assert resolved.json()['data'] == {'id': workspace, 'slug': current_slug}
        async with factory() as db:
            assert list((await db.execute(text('SELECT slug FROM workspace_slugs WHERE workspace_id=:id ORDER BY slug'), {'id': workspace})).scalars()) == aliases
            audit = (await db.execute(text("SELECT metadata FROM audit_logs WHERE workspace_id=:id AND action='workspace.name.updated'"), {'id': workspace})).scalar_one()
            assert audit == {'name': value['name'], 'previous': before['name']}

        by_admin = await admin_client.patch(url, json={'name': '研究ワークスペース'})
        assert by_admin.status_code == 200, by_admin.text
        assert by_admin.json()['data']['name'] == '研究ワークスペース'
        for invalid in ('', ' \t\n\u00a0 ', None):
            rejected = await owner_client.patch(url, json={'name': invalid})
            assert rejected.status_code == 400, rejected.text
        assert (await owner_client.patch(url, json={'name': 'x' * 121})).status_code == 400
        for client in (member_client, viewer_client, inactive_client, outsider_client):
            rejected = await client.patch(url, json={'name': 'Not allowed'})
            assert rejected.status_code == 403, rejected.text
        assert (await viewer_client.get('/api/v1/workspaces/me')).status_code == 200
        assert (await owner_client.patch(url, json={'name': ' 研究ワークスペース '})).status_code == 200
        assert (await owner_client.patch(url, json={'icon': '📚'})).json()['data']['name'] == '研究ワークスペース'
        async with factory() as db:
            audits = (await db.execute(text("SELECT metadata FROM audit_logs WHERE workspace_id=:id AND action='workspace.name.updated' ORDER BY created_at"), {'id': workspace})).scalars().all()
            assert len(audits) == 2
            assert audits[1] == {'name': '研究ワークスペース', 'previous': value['name']}
            persisted = (await db.execute(text('SELECT name, slug FROM workspaces WHERE id=:id'), {'id': workspace})).one()
            assert tuple(persisted) == ('研究ワークスペース', current_slug)
    finally:
        for client in clients:
            await client.aclose()
        async with factory() as db:
            if organization_id:
                await db.execute(text('DELETE FROM organizations WHERE id=:id'), {'id': organization_id})
            await db.execute(text('DELETE FROM users WHERE id=ANY(:ids)'), {'ids': user_ids})
            await db.commit()
        await engine.dispose()
