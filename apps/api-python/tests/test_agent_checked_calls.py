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


def test_deadline_report_counts_open_issues_in_the_askers_teams():
    asyncio.run(_with_workspace(verify_deadlines)())


async def verify_deadlines(db, owner, seed):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    workspace = seed['workspace_id']
    now = utcnow()
    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    statuses = (
        await db.execute(text('SELECT id, category FROM issue_statuses WHERE workspace_id = :w'), {'w': workspace})
    ).mappings().all()
    open_status = next(row['id'] for row in statuses if row['category'] not in ('COMPLETED', 'CANCELED'))
    done_status = next(row['id'] for row in statuses if row['category'] == 'COMPLETED')
    prefix = 'D' + cuid()[:6].upper().replace('-', 'X')
    # Counted: due today, in 3 days, 2 days late. Not counted: done, archived, beyond the window.
    # VI: Được đếm: hạn hôm nay, sau 3 ngày, trễ 2 ngày. Không đếm: đã xong, đã lưu trữ, ngoài khoảng.
    cases = ((0, open_status, None), (3, open_status, None), (-2, open_status, None), (0, done_status, None), (0, open_status, now), (9, open_status, None))
    for number, (offset, status, archived) in enumerate(cases, start=1):
        await db.execute(
            text(
                """INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,due_date,archived_at,created_at,updated_at)
                   VALUES (:id,:w,:t,:s,:identifier,:n,:title,:u,:due,:archived,:now,:now)"""
            ),
            {
                'id': cuid(), 'w': workspace, 't': seed['team_id'], 's': status, 'identifier': f'{prefix}-{number}',
                'n': number, 'title': f'Issue {number}', 'u': owner, 'due': today + timedelta(days=offset), 'archived': archived, 'now': now,
            },
        )
    # A second team of the owner, with one issue due today, to check narrowing by team name.
    # VI: Team thứ hai của owner, có một issue hạn hôm nay, để kiểm tra việc thu hẹp theo tên team.
    ops_key = 'O' + cuid()[:5].upper()
    ops = cuid()
    await db.execute(
        text("INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:w,'Ops',:key,:now,:now)"),
        {'id': ops, 'w': workspace, 'key': ops_key, 'now': now},
    )
    await db.execute(text('INSERT INTO team_members(team_id,user_id) VALUES (:t,:u)'), {'t': ops, 'u': owner})
    await db.execute(
        text(
            """INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,due_date,created_at,updated_at)
               VALUES (:id,:w,:t,:s,:identifier,1,'Ops issue',:u,:due,:now,:now)"""
        ),
        {'id': cuid(), 'w': workspace, 't': ops, 's': open_status, 'identifier': f'{ops_key}-1', 'u': owner, 'due': today, 'now': now},
    )
    seed_key = (await db.execute(text('SELECT identifier FROM teams WHERE id = :id'), {'id': seed['team_id']})).scalar_one()
    outsider = await _user(db, now)
    await _member(db, workspace, outsider, now)
    await db.commit()

    insight = await agent._deadline_insight(db, workspace, owner)
    assert (insight['data']['dueToday'], insight['data']['dueSoon'], insight['data']['overdue']) == (2, 1, 1)
    assert insight['data']['teamScope'] == []
    seed_only = await agent._deadline_insight(db, workspace, owner, f'có bao nhiêu deadline hôm nay ?\n{seed_key.lower()}')
    assert (seed_only['data']['dueToday'], seed_only['data']['dueSoon'], seed_only['data']['overdue']) == (1, 1, 1)
    assert [row['identifier'] for row in seed_only['data']['issues']] == [f'{prefix}-1', f'{prefix}-2']
    assert f'{prefix}-1 Issue 1' in seed_only['content'] and 'Ops issue' not in seed_only['content']
    ops_only = await agent._deadline_insight(db, workspace, owner, 'deadline hôm nay của team Ops')
    assert [row['identifier'] for row in ops_only['data']['issues']] == [f'{ops_key}-1']
    assert ops_only['content'].startswith(f'Hôm nay ({today.date().isoformat()}) team Ops có 1 issue')
    hidden = await agent._deadline_insight(db, workspace, outsider, f'deadline {ops_key}')
    assert hidden['data']['issues'] == [] and hidden['data']['teams'] == [] and hidden['data']['teamScope'] == []


def test_progress_facts_narrow_to_the_teams_the_question_names():
    asyncio.run(_with_workspace(verify_fact_scope)())


async def verify_fact_scope(db, owner, seed):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    workspace = seed['workspace_id']
    now = utcnow()
    late = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None) - timedelta(days=3)
    status = (
        await db.execute(
            text("SELECT id FROM issue_statuses WHERE workspace_id = :w AND category NOT IN ('COMPLETED','CANCELED') LIMIT 1"),
            {'w': workspace},
        )
    ).scalar_one()
    ops_key = 'O' + cuid()[:5].upper()
    ops = cuid()
    await db.execute(
        text("INSERT INTO teams(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:w,'Ops',:key,:now,:now)"),
        {'id': ops, 'w': workspace, 'key': ops_key, 'now': now},
    )
    await db.execute(text('INSERT INTO team_members(team_id,user_id) VALUES (:t,:u)'), {'t': ops, 'u': owner})
    # One overdue issue per team; Ops also owns a project and a team-less project holds an Ops issue.
    # VI: Mỗi team một issue quá hạn; Ops có thêm một dự án, và một dự án không gắn team chứa issue của Ops.
    ops_project, shared_project, seed_project = cuid(), cuid(), cuid()
    for project, team, key in ((ops_project, ops, 'OPSP'), (shared_project, None, 'SHRP'), (seed_project, seed['team_id'], 'SEDP')):
        await db.execute(
            text("INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:w,:t,:key,:key,:now,:now)"),
            {'id': project, 'w': workspace, 't': team, 'key': key + cuid()[:4].upper(), 'now': now},
        )
    seed_key = (await db.execute(text('SELECT identifier FROM teams WHERE id = :id'), {'id': seed['team_id']})).scalar_one()
    for team, key, project in ((seed['team_id'], seed_key, seed_project), (ops, ops_key, shared_project)):
        await db.execute(
            text(
                """INSERT INTO issues(id,workspace_id,team_id,project_id,status_id,identifier,number,title,creator_id,due_date,created_at,updated_at)
                   VALUES (:id,:w,:t,:p,:s,:identifier,900,'Late',:u,:due,:now,:now)"""
            ),
            {'id': cuid(), 'w': workspace, 't': team, 'p': project, 's': status, 'identifier': f'{key}-900', 'u': owner, 'due': late, 'now': now},
        )
    await db.commit()

    everything = await agent._portfolio_facts(db, workspace, owner)
    assert everything['teamScope'] == [] and everything['issueCounts']['total'] == 2
    assert {row['identifier'] for row in everything['overdue']['issues']} == {f'{seed_key}-900', f'{ops_key}-900'}

    ops_only = await agent._portfolio_facts(db, workspace, owner, f'Tình hình thế nào?\n{ops_key.lower()}')
    assert ops_only['teamScope'] == ['Ops'] and ops_only['deadlines']['teamScope'] == ['Ops']
    assert ops_only['issueCounts']['total'] == 1 and ops_only['overdue']['total'] == 1
    assert [row['identifier'] for row in ops_only['overdue']['issues']] == [f'{ops_key}-900']
    assert [team['teamName'] for team in ops_only['workloadByTeam']] == ['Ops']
    buckets = ('delayed', 'atRisk', 'onTrack', 'insufficientData')
    projects = {project['identifier'][:4] for bucket in buckets for project in ops_only['projects'][bucket]}
    assert projects == {'OPSP', 'SHRP'}


def test_questions_never_reach_the_planner_without_the_q_and_a_tool():
    asyncio.run(_with_workspace(verify_question_routing)())


async def verify_question_routing(db, owner, seed):
    # A new workspace has the fixed reports but not the Q&A tool, as in the reported conversation.
    # VI: Workspace mới có các báo cáo cố định nhưng chưa có tool hỏi đáp, đúng như hội thoại được báo lỗi.
    workspace = seed['workspace_id']
    team_key = (await db.execute(text('SELECT identifier FROM teams WHERE id = :id'), {'id': seed['team_id']})).scalar_one()
    user = {'id': owner}

    async def send(message, conversation_id=None):
        return await agent._process_message(None, workspace, message, conversation_id, [], user, db, agent._ignore_progress)

    first = await send('có bao nhiêu deadline hôm nay ?')
    assert first['responseType'] == 'INSIGHT' and first['insight']['capability'] == 'issues.overdue'
    conversation = first['conversation']['id']
    narrowed = await send(team_key, conversation)
    assert narrowed['responseType'] == 'INSIGHT' and narrowed['insight']['data']['teamScope'] != []
    everything = await send('tất cả issue', conversation)
    assert everything['responseType'] == 'INSIGHT' and everything['insight']['data']['teamScope'] == []

    open_question = await send('Tình hình các dự án thế nào?')
    assert open_question['responseType'] == 'INSIGHT'
    assert open_question['insight']['capability'] == agent.ANALYST_TOOL
    assert open_question['insight']['data'] == {'installed': False}
    assert 'Agent personalization' in open_question['insight']['content']
