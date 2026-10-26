import asyncio
import os
from dataclasses import replace
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import _utcnow
from app.core.config import Settings, _async_database_url
from app.core.identifiers import _cuid, _hash_token
from app.db.session import get_session
from app.domains.auth import create_workspace_bootstrap
from app.main import create_app
from app.modules.identity.security.sessions import access_token
from app.services.notification_events import _teams_webhooks
from app.modules.notifications.outbox import deliver
from app.services.microsoft_teams import teams_available, teams_message, valid_teams_webhook


def test_teams_webhook_accepts_only_workflow_trigger_hosts():
    logic = 'https://prod-01.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x'
    platform = 'https://default1.ab.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/abc/triggers/manual/paths/invoke'
    assert valid_teams_webhook(f' {logic} ') == logic
    assert valid_teams_webhook(platform) == platform
    for rejected in [
        logic.replace('https://', 'http://'),
        'https://evil.example/workflows/abc',
        'https://logic.azure.com.evil.example/workflows/abc',
        'https://user:pass@prod-01.westus.logic.azure.com/workflows/abc',
        'https://prod-01.westus.logic.azure.com:8443/workflows/abc',
        'https://prod-01.westus.logic.azure.com/other/abc',
        'https://outlook.office.com/webhook/abc',
    ]:
        assert valid_teams_webhook(rejected) is None, rejected


def test_teams_requires_microsoft_sign_in():
    settings = replace(
        Settings.from_environment(),
        azure_ad_tenant_id='tenant',
        azure_ad_client_id='client',
        azure_ad_client_secret='secret',
    )
    assert teams_available(settings)
    assert not teams_available(replace(settings, azure_ad_client_secret=''))


def test_teams_message_carries_embed_content():
    message = teams_message(
        {
            'title': 'DTD-1 · Fix login',
            'author': {'name': 'Tu changed status'},
            'description': 'Body',
            'fields': [{'name': 'Status', 'value': 'Todo → Done'}],
            'footer': {'text': 'Flowie · Issue'},
            'url': 'https://flowie.example/ws/issue/DTD-1',
        }
    )
    card = message['attachments'][0]['content']
    assert message['attachments'][0]['contentType'] == 'application/vnd.microsoft.card.adaptive'
    assert [block['type'] for block in card['body']] == ['TextBlock', 'TextBlock', 'TextBlock', 'FactSet', 'TextBlock']
    assert card['body'][3]['facts'] == [{'title': 'Status', 'value': 'Todo → Done'}]
    assert card['actions'][0]['url'] == 'https://flowie.example/ws/issue/DTD-1'


def test_outbox_delivers_card_to_each_teams_channel():
    client = MagicMock()
    client.post = AsyncMock(return_value=MagicMock(raise_for_status=MagicMock()))
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    urls = ['https://a.logic.azure.com/workflows/1', 'https://b.logic.azure.com/workflows/2']
    with patch('app.modules.notifications.outbox.httpx.AsyncClient', return_value=client), patch.dict(
        'os.environ', {'DISCORD_BOT_TOKEN': '', 'DISCORD_BOT_CHANNEL_ID': ''}
    ):
        asyncio.run(deliver({'discord_embed': {'title': 'Event'}, 'teams_urls': urls, 'records': []}))
    assert [call.args[0] for call in client.post.call_args_list] == urls
    assert client.post.call_args_list[0].kwargs['json']['type'] == 'message'


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database is not configured')
def test_teams_channels_are_gated_permissioned_and_routed_by_project():
    asyncio.run(verify_teams_channels())


async def verify_teams_channels():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    factory = async_sessionmaker(engine)
    owner, member = _cuid(), _cuid()
    sessions = {owner: _cuid(), member: _cuid()}
    seed = None
    base = replace(
        Settings.from_environment(),
        database_url=os.environ['MCP_TEST_DATABASE_URL'],
        auth_jwt_secret='teams-test-secret-at-least-32-characters-long',
        azure_ad_tenant_id='', azure_ad_client_id='', azure_ad_client_secret='',
    )
    enabled = replace(base, azure_ad_tenant_id='tenant', azure_ad_client_id='client', azure_ad_client_secret='secret')
    workspace_hook = 'https://prod-01.westus.logic.azure.com:443/workflows/workspace/triggers/manual/paths/invoke'
    project_hook = 'https://prod-01.westus.logic.azure.com:443/workflows/project/triggers/manual/paths/invoke'
    try:
        async with factory() as db:
            now = _utcnow()
            for identifier in [owner, member]:
                await db.execute(
                    text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Teams fixture',:email,'ACTIVE',:now,:now)"),
                    {'id': identifier, 'email': identifier + '@example.test', 'now': now},
                )
                await db.execute(
                    text('INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at,created_at,last_used_at) VALUES (:id,:user,:hash,:expires,:now,:now)'),
                    {'id': sessions[identifier], 'user': identifier, 'hash': _hash_token(_cuid()), 'expires': now + timedelta(days=1), 'now': now},
                )
            seed = await create_workspace_bootstrap(db, user_id=owner, organization_name='Teams', workspace_name=_cuid(), now=now)
            workspace = seed['workspace_id']
            await db.execute(
                text("INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at) VALUES (:id,:workspace,:user,'MEMBER','ACTIVE',:now,:now)"),
                {'id': _cuid(), 'workspace': workspace, 'user': member, 'now': now},
            )
            project, other_project, issue = _cuid(), _cuid(), _cuid()
            for identifier in [project, other_project]:
                await db.execute(
                    text("INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Teams target',:id,:now,:now)"),
                    {'id': identifier, 'workspace': workspace, 'now': now},
                )
            status = (await db.execute(text('SELECT id FROM issue_statuses WHERE workspace_id=:workspace LIMIT 1'), {'workspace': workspace})).scalar_one()
            await db.execute(
                text("INSERT INTO issues(id,workspace_id,team_id,project_id,status_id,identifier,number,title,creator_id,created_at,updated_at) VALUES (:id,:workspace,:team,:project,:status,'TMS-1',1,'Teams issue',:user,:now,:now)"),
                {'id': issue, 'workspace': workspace, 'team': seed['team_id'], 'project': project, 'status': status, 'user': owner, 'now': now},
            )
            await db.commit()

        async def session():
            async with factory() as db:
                yield db

        async def call(settings, user, method, path, **kwargs):
            app = create_app(settings)
            app.dependency_overrides[get_session] = session
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://test') as client:
                client.cookies.set('flowie_access', access_token({'id': user}, sessions[user], settings))
                return await client.request(method, f'/api/v1/integrations/teams{path}workspaceId={workspace}', **kwargs)

        assert (await call(base, owner, 'GET', '?')).status_code == 403
        assert (await call(enabled, member, 'POST', '?', json={'webhookUrl': workspace_hook})).status_code == 403
        assert (await call(enabled, owner, 'POST', '?', json={'webhookUrl': 'https://evil.example/workflows/x'})).status_code == 400
        saved = await call(enabled, owner, 'POST', '?', json={'webhookUrl': workspace_hook})
        assert saved.status_code == 200 and workspace_hook not in saved.text

        project_path = f'/projects/{project}?'
        assert (await call(enabled, member, 'PUT', project_path, json={'webhookUrl': project_hook})).status_code == 403
        saved = await call(enabled, owner, 'PUT', project_path, json={'webhookUrl': project_hook, 'channelName': 'DTD'})
        assert saved.status_code == 200 and saved.json()['data']['channelName'] == 'DTD'
        viewed = (await call(enabled, member, 'GET', project_path)).json()
        assert viewed['canManage'] is False and viewed['data']['channelName'] == 'DTD'

        with patch('app.services.notification_events.teams_available', return_value=True):
            async with factory() as db:
                assert set(await _teams_webhooks(db, workspace, 'issue', issue)) == {workspace_hook, project_hook}
                assert set(await _teams_webhooks(db, workspace, 'project', project)) == {workspace_hook, project_hook}
                assert await _teams_webhooks(db, workspace, 'project', other_project) == [workspace_hook]
        with patch('app.services.notification_events.teams_available', return_value=False):
            async with factory() as db:
                assert await _teams_webhooks(db, workspace, 'issue', issue) == []

        assert (await call(enabled, owner, 'DELETE', project_path)).status_code == 200
        assert (await call(enabled, owner, 'GET', project_path)).json()['data'] is None
    finally:
        async with factory() as db:
            if seed:
                await db.execute(text('DELETE FROM organizations WHERE id=:id'), {'id': seed['organization_id']})
            await db.execute(text('DELETE FROM users WHERE id=ANY(CAST(:ids AS text[]))'), {'ids': [owner, member]})
            await db.commit()
        await engine.dispose()
