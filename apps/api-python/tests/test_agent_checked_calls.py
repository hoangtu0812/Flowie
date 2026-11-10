import asyncio
import json
import os
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.agent import api as agent
from app.modules.identity.auth import create_workspace_bootstrap

KEY = Fernet.generate_key().decode('ascii')
HISTORY = [{'role': 'user', 'content': 'Lập kế hoạch'}]
PROPOSAL = json.dumps({'summary': 'Xong', 'requiresClarification': False, 'questions': [], 'projects': [], 'issues': []})


def _replies(monkeypatch, *replies):
    calls = []

    async def fake(provider, feature, system, history):
        calls.append(history)
        reply = replies[len(calls) - 1]
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(agent, 'call_provider', fake)
    return calls


def _checked(parse):
    return asyncio.run(agent._call_checked({}, 'agent.plan', 's', HISTORY, parse))


def test_a_malformed_reply_is_corrected_once(monkeypatch):
    calls = _replies(monkeypatch, 'not json', PROPOSAL)
    assert _checked(agent._parse_agent_proposal).summary == 'Xong'
    assert calls[1][1] == {'role': 'assistant', 'content': 'not json'}
    assert 'required JSON format' in calls[1][2]['content'] and calls[1][2]['role'] == 'user'


def test_a_broken_rule_goes_back_to_the_model_with_its_reason(monkeypatch):
    calls = _replies(monkeypatch, 'first', 'second')

    def parse(raw):
        if raw == 'first':
            raise ApiError(502, 'The dates are outside the project.', 'Bad Gateway')
        return raw

    assert _checked(parse) == 'second'
    assert 'The dates are outside the project.' in calls[1][2]['content']


def test_a_second_bad_reply_reaches_the_caller(monkeypatch):
    calls = _replies(monkeypatch, 'bad', 'still bad')
    with pytest.raises(ValidationError):
        _checked(agent._parse_agent_proposal)
    assert len(calls) == 2


def test_a_provider_failure_is_not_corrected(monkeypatch):
    calls = _replies(monkeypatch, ApiError(502, 'Provider down.', 'Bad Gateway'))
    with pytest.raises(ApiError):
        _checked(agent._parse_agent_proposal)
    assert len(calls) == 1


def test_validation_text_never_returns_to_the_prompt(monkeypatch):
    calls = _replies(monkeypatch, '{"summary": "x", "extra": "SECRET-ECHO"}', PROPOSAL)
    _checked(agent._parse_agent_proposal)
    assert 'SECRET-ECHO' not in calls[1][2]['content']


def test_planner_turns_a_second_malformed_reply_into_a_clarification(monkeypatch):
    calls = _replies(monkeypatch, 'bad', 'still bad')
    result = asyncio.run(agent._draft_proposal({'provider': {}, 'system_prompt': 's', 'history': HISTORY}))
    assert result['proposal']['requiresClarification'] is True and len(calls) == 2


def _request():
    settings = SimpleNamespace(
        auth_jwt_secret='test-secret', agent_provider_allowed_hosts=(), agent_secrets_encryption_key=KEY
    )
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=settings)))


async def _user(db, now):
    user = cuid()
    await db.execute(
        text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Agent',:email,'ACTIVE',:now,:now)"),
        {'id': user, 'email': user + '@example.test', 'now': now},
    )
    return user


async def _member(db, workspace, user, now):
    await db.execute(
        text(
            """INSERT INTO workspace_members(id,workspace_id,user_id,role,status,created_at,updated_at)
               VALUES (:id,:w,:u,'MEMBER','ACTIVE',:now,:now)"""
        ),
        {'id': cuid(), 'w': workspace, 'u': user, 'now': now},
    )


async def _provider(db, workspace, enabled=True):
    await db.execute(
        text(
            """INSERT INTO workspace_agent_providers(id,workspace_id,provider,endpoint,model,api_key_encrypted,enabled,updated_at)
               VALUES (:id,:w,'OPENAI','https://api.openai.com/v1','m',:key,:enabled,:now)"""
        ),
        {
            'id': cuid(), 'w': workspace, 'enabled': enabled, 'now': utcnow(),
            'key': Fernet(KEY.encode('ascii')).encrypt(b'secret').decode('ascii'),
        },
    )


def _with_workspace(verify):
    async def run(*args):
        engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
        try:
            async with async_sessionmaker(engine)() as db:
                now = utcnow()
                owner = await _user(db, now)
                seed = await create_workspace_bootstrap(
                    db, user_id=owner, organization_name='Agent', workspace_name=cuid(), now=now
                )
                await db.commit()
                await verify(db, owner, seed, *args)
        finally:
            await engine.dispose()

    return run


def test_hourly_limit_counts_each_person_apart(monkeypatch):
    asyncio.run(_with_workspace(verify_limit)(monkeypatch))


async def verify_limit(db, owner, seed, monkeypatch):
    monkeypatch.setattr(agent, 'AGENT_HOURLY_LIMIT', 2)
    workspace = seed['workspace_id']
    await _provider(db, workspace)
    other = await _user(db, utcnow())
    await db.commit()
    request = _request()
    for _ in range(2):
        assert (await agent._configured_provider(request, db, workspace, owner))['provider'] == 'OPENAI'
    with pytest.raises(ApiError) as limited:
        await agent._configured_provider(request, db, workspace, owner)
    assert limited.value.status_code == 429
    assert (await agent._configured_provider(request, db, workspace, other))['provider'] == 'OPENAI'


def test_a_workspace_without_a_provider_does_not_use_up_the_limit(monkeypatch):
    asyncio.run(_with_workspace(verify_no_provider)(monkeypatch))


async def verify_no_provider(db, owner, seed, monkeypatch):
    monkeypatch.setattr(agent, 'AGENT_HOURLY_LIMIT', 1)
    request = _request()
    for _ in range(3):
        with pytest.raises(ApiError) as missing:
            await agent._configured_provider(request, db, seed['workspace_id'], owner)
        assert missing.value.status_code == 409


def test_provider_check_reports_the_outcome_and_needs_a_manager(monkeypatch):
    asyncio.run(_with_workspace(verify_check)(monkeypatch))


async def verify_check(db, owner, seed, monkeypatch):
    workspace = seed['workspace_id']
    request = _request()
    user = {'id': owner}
    with pytest.raises(ApiError) as unsaved:
        await agent.check_provider('OPENAI', request, workspace, user, db)
    assert unsaved.value.status_code == 404

    # A disabled provider can be tested, because that is how it is checked before activation.
    # VI: Provider đang tắt vẫn thử được, vì đó là cách kiểm tra trước khi kích hoạt.
    await _provider(db, workspace, enabled=False)
    member = await _user(db, utcnow())
    await _member(db, workspace, member, utcnow())
    await db.commit()
    with pytest.raises(ApiError) as denied:
        await agent.check_provider('OPENAI', request, workspace, {'id': member}, db)
    assert denied.value.status_code == 403

    seen = []

    async def answers(provider, feature, system, history):
        seen.append((provider['apiKey'], feature))
        return '{"ok":true}'

    monkeypatch.setattr(agent, 'call_provider', answers)
    assert await agent.check_provider('OPENAI', request, workspace, user, db) == {'data': {'reachable': True}}
    assert seen == [('secret', 'agent.test')]

    async def rejects(provider, feature, system, history):
        raise ApiError(502, 'The OpenAI provider rejected the request (HTTP 401).', 'Bad Gateway')

    monkeypatch.setattr(agent, 'call_provider', rejects)
    assert await agent.check_provider('OPENAI', request, workspace, user, db) == {
        'data': {'reachable': False, 'reason': 'The OpenAI provider rejected the request (HTTP 401).'}
    }


def test_mentioned_issues_are_limited_to_the_askers_teams():
    asyncio.run(_with_workspace(verify_mentions)())


async def verify_mentions(db, owner, seed):
    workspace = seed['workspace_id']
    now = utcnow()
    status = (
        await db.execute(text('SELECT id FROM issue_statuses WHERE workspace_id = :w LIMIT 1'), {'w': workspace})
    ).scalar_one()
    prefix = 'M' + cuid()[:6].upper().replace('-', 'X')
    for number, archived in ((1, None), (2, now)):
        await db.execute(
            text(
                """INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,description,creator_id,archived_at,created_at,updated_at)
                   VALUES (:id,:w,:t,:s,:identifier,:n,:title,:description,:u,:archived,:now,:now)"""
            ),
            {
                'id': cuid(), 'w': workspace, 't': seed['team_id'], 's': status, 'identifier': f'{prefix}-{number}',
                'n': number, 'title': f'Issue {number}', 'description': 'x' * 2000, 'u': owner, 'archived': archived, 'now': now,
            },
        )
    outsider = await _user(db, now)
    await _member(db, workspace, outsider, now)
    await db.commit()

    message = f'{prefix.lower()}-1 và {prefix}-1 và {prefix}-2 ra sao, còn NOPE-9?'
    found = await agent._mentioned_issues(db, workspace, owner, message)
    assert [row['identifier'] for row in found] == [f'{prefix}-1']
    assert found[0]['title'] == 'Issue 1' and len(found[0]['description']) == agent.MENTIONED_ISSUE_DESCRIPTION_CHARS
    assert await agent._mentioned_issues(db, workspace, outsider, message) == []
    assert await agent._mentioned_issues(db, workspace, owner, 'Tình hình chung thế nào?') == []
