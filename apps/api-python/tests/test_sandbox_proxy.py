import asyncio
import contextlib
import json
import os
import subprocess
import threading
import time
from dataclasses import replace
from types import SimpleNamespace

import httpx
import jwt
import pytest
import websockets
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from websockets.asyncio.server import serve

from app.core.config import Settings
from app.core.errors import ApiError, api_error_handler
from app.modules.identity.auth import current_user
from app.modules.sandbox import api as sandbox
from app.sandbox_manager import termi_token

TOKEN = 'm' * 64
ME = {'id': 'ctwwf9lkb5z0bsyzit9na6opp', 'email': 'me@bsr.com.vn'}
STRANGER = {'id': 'cstranger0000000000000000', 'email': 'other@bsr.com.vn'}
ORIGIN = 'https://flowie.example'


def make_client(user, monkeypatch, handler=None):
    settings = replace(
        Settings.from_environment(),
        sandbox_users=('me@bsr.com.vn',),
        sandbox_manager_token=TOKEN,
        app_url=ORIGIN + '/flowie',
    )
    app = FastAPI()
    app.state.settings = settings
    app.include_router(sandbox.router)
    app.add_exception_handler(ApiError, api_error_handler)  # type: ignore[arg-type]
    app.dependency_overrides[current_user] = lambda: user
    if handler is not None:
        real = httpx.AsyncClient
        monkeypatch.setattr(sandbox.httpx, 'AsyncClient', lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    return TestClient(app)


def test_people_outside_sandbox_users_get_403_and_nothing_is_called(monkeypatch):
    calls = []
    client = make_client(STRANGER, monkeypatch, lambda request: calls.append(request) or httpx.Response(200))
    assert client.get('/api/v1/sandbox').status_code == 403
    assert client.put('/api/v1/sandbox').status_code == 403
    assert client.get('/api/v1/sandbox/ui/api/sessions').status_code == 403
    assert calls == []


def test_status_hides_the_address_and_reports_none_when_missing(monkeypatch):
    def manager(request):
        assert request.headers['authorization'] == f'Bearer {TOKEN}'
        assert request.url.path == f"/sandboxes/{ME['id']}"
        return httpx.Response(404, json={'error': 'No sandbox'}) if request.method == 'GET' else httpx.Response(
            200, json={'userId': ME['id'], 'state': 'running', 'address': '172.31.250.130'}
        )

    client = make_client(ME, monkeypatch, manager)
    assert client.get('/api/v1/sandbox').json() == {'data': {'state': 'none'}}
    assert client.put('/api/v1/sandbox').json() == {'data': {'state': 'running'}}


def test_ui_proxy_reaches_only_the_callers_container_without_flowie_credentials(monkeypatch):
    seen = []

    def termi(request):
        seen.append(request)
        return httpx.Response(200, json={'ok': True}, headers={'set-cookie': 'x=1', 'x-termi-build': '7'})

    client = make_client(ME, monkeypatch, termi)
    response = client.post(
        '/api/v1/sandbox/ui/api/send?session=main',
        json={'text': 'hi'},
        headers={'x-termi': '1', 'authorization': 'Bearer flowie', 'x-termi-token': 'forged'},
        cookies={'flowie_access': 'secret'},
    )
    assert response.status_code == 200
    assert 'set-cookie' not in response.headers
    assert response.headers['x-termi-build'] == '7'
    client.get('/api/v1/sandbox/ui/%2e%2e/m/other/api/sessions')
    for request in seen:
        assert request.url.host == f"flowie-sandbox-{ME['id']}"
        assert request.url.port == 7680
        assert request.headers['host'] == 'localhost:7680'
        assert request.headers['x-termi-token'] == termi_token(TOKEN, ME['id'])
        assert 'cookie' not in request.headers
        assert 'authorization' not in request.headers
    assert seen[0].url.path == '/api/send'
    assert seen[0].url.query == b'session=main'
    assert seen[0].content == b'{"text":"hi"}'


def test_ui_without_trailing_slash_redirects(monkeypatch):
    client = make_client(ME, monkeypatch)
    response = client.get('/api/v1/sandbox/ui', follow_redirects=False)
    assert response.status_code == 307
    assert response.headers['location'] == 'ui/'


@pytest.mark.parametrize(('path', 'origin'), [('term/ws', 'https://evil.example'), ('term/ws', None), ('api/x', ORIGIN)])
def test_socket_refuses_other_origins_and_non_terminal_paths(monkeypatch, path, origin):
    client = make_client(ME, monkeypatch)
    headers = {'origin': origin} if origin else {}
    with pytest.raises(WebSocketDisconnect) as closed, client.websocket_connect(f'/api/v1/sandbox/ui/{path}', headers=headers):
        pass
    assert closed.value.code == 4403


def test_socket_is_piped_to_the_callers_ttyd_with_termi_credentials(monkeypatch):
    seen = {}
    ready = threading.Event()
    port_box = {}

    async def echo(connection):
        seen['headers'] = connection.request.headers
        seen['path'] = connection.request.path
        async for message in connection:
            await connection.send(message)

    def run_upstream():
        async def main():
            async with serve(echo, '127.0.0.1', 0, subprotocols=[websockets.Subprotocol('tty')]) as server:
                port_box['port'] = server.sockets[0].getsockname()[1]
                ready.set()
                await asyncio.Future()

        asyncio.run(main())

    threading.Thread(target=run_upstream, daemon=True).start()
    ready.wait(5)
    monkeypatch.setattr(sandbox, 'container_name', lambda user_id: '127.0.0.1' if user_id == ME['id'] else 'nowhere')
    monkeypatch.setattr(sandbox, 'TERMI_PORT', port_box['port'])

    async def signed_in(socket):
        return ME

    monkeypatch.setattr(sandbox, '_socket_user', signed_in)
    client = make_client(ME, monkeypatch)
    with client.websocket_connect('/api/v1/sandbox/ui/term/ws?arg=main', headers={'origin': ORIGIN}, subprotocols=['tty']) as socket:
        socket.send_bytes(b'\x001')
        assert socket.receive_bytes() == b'\x001'
    assert seen['path'] == '/term/ws?arg=main'
    assert seen['headers']['X-Termi-Token'] == termi_token(TOKEN, ME['id'])
    assert seen['headers']['Origin'] == 'http://localhost:7680'
    assert seen['headers']['Host'] == 'localhost:7680'
    assert 'Cookie' not in seen['headers']


def test_open_terminal_outlives_the_access_token_but_not_the_session(monkeypatch):
    settings = Settings.from_environment()
    now = int(time.time())
    claims = {'sub': ME['id'], 'sid': 's1', 'ver': 1, 'iat': now - 3600, 'exp': now - 60,
              'token_use': 'access', 'aud': 'flowie-web', 'iss': 'flowie'}
    token = jwt.encode(claims, settings.auth_jwt_secret, algorithm='HS256')
    sessions = {'s1'}

    async def identity(db, claims):
        return ME if claims['sid'] in sessions else None

    monkeypatch.setattr(sandbox, 'active_identity', identity)
    socket = SimpleNamespace(
        cookies={'flowie_access': token},
        app=SimpleNamespace(state=SimpleNamespace(settings=settings, session_factory=contextlib.nullcontext)),
    )
    with pytest.raises(ApiError):
        asyncio.run(sandbox._socket_user(socket))
    assert asyncio.run(sandbox._socket_user(socket, opening=False)) == ME
    sessions.clear()
    with pytest.raises(ApiError):
        asyncio.run(sandbox._socket_user(socket, opening=False))


ISSUE = {'id': 'cissue', 'identifier': 'DTD-7', 'title': "Fix the user's login", 'description': 'Steps:\n1. it\'s "broken" $(rm -rf /)'}
REPOSITORY = {'id': 'crepo', 'name': 'flowie.web', 'repositoryUrl': '', 'baseBranch': 'main', 'instructions': 'Run pnpm test.'}


def test_open_command_clones_once_gives_the_issue_a_worktree_and_starts_the_agent(tmp_path):
    origin = tmp_path / 'origin'
    git = lambda *args, cwd=origin: subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True)  # noqa: E731
    origin.mkdir()
    git('init', '-q', '-b', 'main')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'first')
    bin_dir = tmp_path / 'bin'
    bin_dir.mkdir()
    agent = bin_dir / 'claude'
    agent.write_text('#!/bin/sh\npwd > "$HOME/agent-dir"\nprintf %s "$1" > "$HOME/agent-prompt"\n')
    agent.chmod(0o755)
    home = tmp_path / 'home'
    home.mkdir()
    command = sandbox.open_command(ISSUE, {**REPOSITORY, 'repositoryUrl': str(origin)}, 'claude', 'DTD-7-flowie-web')
    env = {**os.environ, 'HOME': str(home), 'PATH': f'{bin_dir}:{os.environ["PATH"]}'}
    for _ in range(2):  # the second run reuses the clone and the worktree
        subprocess.run(['bash', '-c', command], env=env, check=True, capture_output=True)
    work = home / 'work' / 'DTD-7-flowie-web'
    assert (home / 'agent-dir').read_text().strip() == str(work.resolve())
    branch = subprocess.run(['git', 'branch', '--show-current'], cwd=work, capture_output=True, text=True).stdout
    assert branch.strip() == 'flowie/DTD-7-flowie-web'
    prompt = (home / 'agent-prompt').read_text()
    assert prompt.startswith("Flowie task DTD-7: Fix the user's login\n\nSteps:\n1. it's \"broken\" $(rm -rf /)")
    assert prompt.endswith('Run pnpm test.')


def open_client(user, monkeypatch, termi):
    async def readable(db, caller, issue_id):
        assert issue_id == ISSUE['id']
        return None, ISSUE

    async def repositories(db, policy, issue):
        return [REPOSITORY]

    monkeypatch.setattr(sandbox, '_readable_issue', readable)
    monkeypatch.setattr(sandbox, '_repositories', repositories)

    def handler(request):
        if request.url.port == 4100:
            return httpx.Response(200, json={'state': 'running'})
        return termi(request)

    client = make_client(user, monkeypatch, handler)
    client.app.dependency_overrides[sandbox.get_session] = lambda: None
    return client


def test_open_creates_the_issue_session_and_types_the_command(monkeypatch):
    seen = []

    def termi(request):
        seen.append(request)
        assert request.url.host == f"flowie-sandbox-{ME['id']}"
        assert request.headers['x-termi'] == '1'
        assert request.headers['x-termi-token'] == termi_token(TOKEN, ME['id'])
        return httpx.Response(200, json={'ok': True})

    client = open_client(ME, monkeypatch, termi)
    body = {'issueId': ISSUE['id'], 'repositoryId': REPOSITORY['id'], 'agent': 'codex'}
    assert client.post('/api/v1/sandbox/open', json=body).json() == {'data': {'session': 'DTD-7-flowie-web'}}
    assert [r.url.path for r in seen] == ['/api/sessions', '/api/send']
    sent = json.loads(seen[1].content)
    assert sent['session'] == 'DTD-7-flowie-web' and sent['enter'] is True
    assert 'codex ' in sent['text']


def test_open_reuses_an_existing_session_and_refuses_strangers_and_other_repositories(monkeypatch):
    seen = []
    client = open_client(ME, monkeypatch, lambda request: seen.append(request) or httpx.Response(409, json={}))
    body = {'issueId': ISSUE['id'], 'repositoryId': REPOSITORY['id'], 'agent': 'claude'}
    assert client.post('/api/v1/sandbox/open', json=body).status_code == 200
    assert [r.url.path for r in seen] == ['/api/sessions']
    assert client.post('/api/v1/sandbox/open', json={**body, 'repositoryId': 'cother'}).status_code == 404
    assert client.post('/api/v1/sandbox/open', json={**body, 'agent': 'bash'}).status_code == 422
    stranger = open_client(STRANGER, monkeypatch, lambda request: httpx.Response(500))
    assert stranger.post('/api/v1/sandbox/open', json=body).status_code == 403
