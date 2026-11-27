import asyncio
from dataclasses import replace

import httpx

from app.core.config import Settings
from app.modules.sandbox import notify
from app.sandbox_manager import terminal_token

TOKEN = 'm' * 64
USER = 'cowner000000000000000000'


def session(name, state, agent='claude'):
    return {'name': name, 'state': state, 'agent': agent, 'preview': f'{name} {state}'}


def test_only_finishing_and_waiting_agent_sessions_count():
    before = {'a': 'working', 'b': 'idle', 'c': 'working', 'd': 'working', 'sh': 'shell'}
    now = [session('a', 'idle'), session('b', 'waiting'), session('c', 'working'), session('d', 'waiting'),
           session('sh', 'shell', None), session('new', 'waiting')]
    assert [(kind, s['name']) for kind, s in notify.changes(before, now)] == [
        ('finished', 'a'), ('waiting', 'b'), ('waiting', 'd'),
    ]


def test_a_pass_notifies_on_changes_and_forgets_stopped_sandboxes(monkeypatch):
    settings = replace(Settings.from_environment(), sandbox_manager_token=TOKEN)
    states = [[session('DTD-7-flowie', 'working')], [session('DTD-7-flowie', 'idle')]]
    running = [[{'userId': USER, 'state': 'running'}], [{'userId': USER, 'state': 'running'}], []]
    sent = []

    def handler(request):
        if request.url.port == 4100:
            return httpx.Response(200, json=running.pop(0))
        assert request.url.path == f'/{terminal_token(TOKEN, USER)}/sessions'
        return httpx.Response(200, json=states.pop(0))

    async def fake_notify(factory, user_id, kind, found):
        sent.append((user_id, kind, found['name']))
        return True

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(notify, 'notify', fake_notify)
    seen: dict = {}
    assert asyncio.run(notify.check_sandboxes(settings, None, seen)) == 0  # first look only records
    assert asyncio.run(notify.check_sandboxes(settings, None, seen)) == 1
    assert sent == [(USER, 'finished', 'DTD-7-flowie')]
    asyncio.run(notify.check_sandboxes(settings, None, seen))
    assert seen == {}
