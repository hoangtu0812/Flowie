import asyncio
import json
import logging
import os

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import _utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import _cuid
from app.domains import ai_calls
from app.domains import agent
from app.domains.auth import create_workspace_bootstrap

OPENAI = {'provider': 'OPENAI', 'endpoint': 'https://api.openai.com/v1', 'model': 'm', 'apiKey': 'secret-key'}
GATEWAY = {**OPENAI, 'endpoint': 'http://192.168.98.100:4000/v1'}
GOOGLE = {
    'provider': 'GOOGLE', 'endpoint': 'https://generativelanguage.googleapis.com/v1beta', 'model': 'm', 'apiKey': 'secret-key',
}
HISTORY = [{'role': 'user', 'content': 'hi'}]
OPENAI_OK = {'choices': [{'message': {'content': '{"a":1}'}, 'finish_reason': 'stop'}], 'usage': {'prompt_tokens': 3, 'completion_tokens': 4}}


@pytest.fixture
def provider_calls(monkeypatch):
    """Serve scripted responses and capture requests and sleeps, with no network.
    VI: Trả các phản hồi định sẵn, ghi lại request và thời gian chờ, không dùng mạng.
    """
    real_client = httpx.AsyncClient
    state = {'responses': [], 'requests': [], 'sleeps': [], 'timeouts': []}

    def handler(request):
        state['requests'].append(json.loads(request.content))
        response = state['responses'].pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def client(timeout):
        state['timeouts'].append(timeout)
        return real_client(timeout=timeout, transport=httpx.MockTransport(handler))

    async def sleep(seconds):
        state['sleeps'].append(seconds)

    monkeypatch.setattr(ai_calls.httpx, 'AsyncClient', client)
    monkeypatch.setattr(ai_calls.asyncio, 'sleep', sleep)
    return state


def call(provider=OPENAI, feature='agent.answer'):
    return asyncio.run(ai_calls.call_provider(provider, feature, 'system', HISTORY))


def test_retries_a_passing_failure_and_honours_retry_after(provider_calls):
    provider_calls['responses'] = [
        httpx.Response(429, headers={'retry-after': '2'}),
        httpx.Response(503, headers={'retry-after': '120'}),
        httpx.Response(200, json=OPENAI_OK),
    ]
    assert call() == '{"a":1}'
    assert provider_calls['sleeps'] == [2, ai_calls.MAX_RETRY_DELAY_SECONDS]


def test_gives_up_after_the_last_attempt(provider_calls):
    provider_calls['responses'] = [httpx.Response(500) for _ in range(ai_calls.MAX_ATTEMPTS)]
    with pytest.raises(ApiError, match='HTTP 500'):
        call()
    assert len(provider_calls['requests']) == ai_calls.MAX_ATTEMPTS


def test_retries_a_lost_connection_but_not_a_slow_model(provider_calls):
    provider_calls['responses'] = [httpx.ConnectError('down'), httpx.Response(200, json=OPENAI_OK)]
    assert call() == '{"a":1}'
    provider_calls['responses'] = [httpx.ReadTimeout('slow')]
    with pytest.raises(ApiError, match='did not answer in time'):
        call()
    assert len(provider_calls['requests']) == 3


def test_does_not_retry_a_rejected_request(provider_calls):
    provider_calls['responses'] = [httpx.Response(401, json={'error': 'bad key'})]
    with pytest.raises(ApiError, match='HTTP 401'):
        call()
    assert len(provider_calls['requests']) == 1


def test_drops_each_field_the_model_refuses_without_using_an_attempt(provider_calls):
    provider_calls['responses'] = [
        httpx.Response(400, json={'error': {'message': "Unsupported value: 'temperature'"}}),
        httpx.Response(400, json={'error': {'message': "Unsupported parameter: 'max_completion_tokens'"}}),
        httpx.Response(500),
        httpx.Response(500),
        httpx.Response(200, json=OPENAI_OK),
    ]
    assert call() == '{"a":1}'
    last = provider_calls['requests'][-1]
    assert 'temperature' not in last and 'max_completion_tokens' not in last
    assert last['response_format'] == {'type': 'json_object'}


def test_uses_the_token_field_of_each_endpoint_and_the_feature_limits(provider_calls):
    provider_calls['responses'] = [httpx.Response(200, json=OPENAI_OK), httpx.Response(200, json=OPENAI_OK)]
    call(OPENAI, 'agent.schedule')
    call(GATEWAY, 'agent.schedule')
    official, gateway = provider_calls['requests']
    limit = ai_calls.CALL_LIMITS['agent.schedule'][1]
    assert official['max_completion_tokens'] == limit and 'max_tokens' not in official
    assert gateway['max_tokens'] == limit and 'max_completion_tokens' not in gateway
    assert provider_calls['timeouts'][0].read == ai_calls.CALL_LIMITS['agent.schedule'][0]


@pytest.mark.parametrize(
    'provider, payload',
    [
        (OPENAI, {'choices': [{'message': {'content': '{"a":'}, 'finish_reason': 'length'}]}),
        (OPENAI, {'choices': [{'message': {'content': None}, 'finish_reason': 'length'}]}),
        (GOOGLE, {'candidates': [{'content': {'parts': [{'text': '{"a":'}]}, 'finishReason': 'MAX_TOKENS'}]}),
        (GOOGLE, {'candidates': [{'finishReason': 'MAX_TOKENS'}]}),
    ],
)
def test_a_cut_off_reply_is_reported_as_cut_off(provider_calls, provider, payload):
    provider_calls['responses'] = [httpx.Response(200, json=payload)]
    with pytest.raises(ApiError, match='cut off'):
        call(provider)


@pytest.mark.parametrize(
    'provider, response',
    [
        (OPENAI, httpx.Response(200, text='<html>proxy</html>')),
        (OPENAI, httpx.Response(200, json={'choices': []})),
        (OPENAI, httpx.Response(200, json={'choices': [{'message': {'content': None}}]})),
        (GOOGLE, httpx.Response(200, json={'promptFeedback': {'blockReason': 'SAFETY'}})),
        (GOOGLE, httpx.Response(200, json=[])),
    ],
)
def test_an_empty_or_foreign_reply_is_a_provider_error(provider_calls, provider, response):
    provider_calls['responses'] = [response]
    with pytest.raises(ApiError, match='returned no content'):
        call(provider)


def test_reads_every_google_part(provider_calls):
    provider_calls['responses'] = [
        httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': '{"a"'}, {'text': ':1}'}]}, 'finishReason': 'STOP'}]})
    ]
    assert call(GOOGLE) == '{"a":1}'


def test_logs_the_status_without_the_key(provider_calls, caplog):
    provider_calls['responses'] = [httpx.Response(403, text='denied for secret-key ' + 'x' * 500)]
    with caplog.at_level(logging.WARNING), pytest.raises(ApiError):
        call()
    assert 'status=403' in caplog.text and 'secret-key' not in caplog.text and 'x' * 400 not in caplog.text


def test_records_usage_in_its_own_session_and_survives_a_broken_store(provider_calls):
    asyncio.run(verify_usage(provider_calls))


async def verify_usage(provider_calls):
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            user = _cuid()
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'AI',:email,'ACTIVE',:now,:now)"),
                {'id': user, 'email': user + '@example.test', 'now': now},
            )
            workspace = (
                await create_workspace_bootstrap(db, user_id=user, organization_name='AI', workspace_name=_cuid(), now=now)
            )['workspace_id']
            await db.commit()
            provider = {**OPENAI, 'workspaceId': workspace, 'engine': db.bind}

            provider_calls['responses'] = [httpx.Response(429), httpx.Response(200, json=OPENAI_OK)]
            await ai_calls.call_provider(provider, 'agent.plan', 'system', HISTORY)

            # The caller's uncommitted work rolls back; the failed call must still be on record.
            # VI: Phần chưa commit của nơi gọi bị rollback; lời gọi lỗi vẫn phải có bản ghi.
            provider_calls['responses'] = [
                httpx.Response(200, json={'choices': [{'message': {'content': '{'}, 'finish_reason': 'length'}], 'usage': {'prompt_tokens': 9, 'completion_tokens': 8}})
            ]
            with pytest.raises(ApiError):
                await ai_calls.call_provider(provider, 'agent.plan', 'system', HISTORY)
            await db.rollback()

            rows = (
                await db.execute(
                    text(
                        '''SELECT outcome, status_code, input_tokens, output_tokens, attempts, feature, duration_ms
                           FROM ai_provider_calls WHERE workspace_id = :w ORDER BY created_at'''
                    ),
                    {'w': workspace},
                )
            ).all()
            assert [tuple(row[:6]) for row in rows] == [
                ('ok', 200, 3, 4, 2, 'agent.plan'),
                ('truncated', 200, 9, 8, 1, 'agent.plan'),
            ]
            await db.commit()

            provider_calls['responses'] = [httpx.Response(200, json=OPENAI_OK)]
            broken = {**provider, 'workspaceId': 'no-such-workspace'}
            assert await ai_calls.call_provider(broken, 'agent.plan', 'system', HISTORY) == '{"a":1}'
    finally:
        await engine.dispose()


def test_planner_graph_carries_the_usage_engine_to_the_call(monkeypatch):
    engine = object()
    seen = {}

    async def answer(provider, feature, system, history):
        seen.update(engine=provider['engine'], feature=feature)
        return json.dumps({'summary': 'Xong', 'requiresClarification': False, 'questions': [], 'projects': [], 'issues': []})

    monkeypatch.setattr(agent, 'call_provider', answer)
    result = asyncio.run(
        agent.planner_graph.ainvoke({'provider': {**OPENAI, 'engine': engine}, 'system_prompt': 's', 'history': HISTORY})
    )
    assert result['proposal']['summary'] == 'Xong'
    assert seen == {'engine': engine, 'feature': 'agent.plan'}
