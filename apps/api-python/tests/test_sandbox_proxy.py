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
from app.sandbox_manager import terminal_token

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


def test_ui_proxy_reaches_only_the_callers_ttyd_under_its_secret_path(monkeypatch):
    seen = []

    def ttyd(request):
        seen.append(request)
        return httpx.Response(200, text='<html>', headers={'set-cookie': 'x=1', 'content-type': 'text/html'})

    client = make_client(ME, monkeypatch, ttyd)
    response = client.get(
        '/api/v1/sandbox/ui/?arg=main',
        headers={'authorization': 'Bearer flowie', 'accept': 'text/html'},
        cookies={'flowie_access': 'secret'},
    )
    assert response.status_code == 200
    assert 'set-cookie' not in response.headers
    assert response.headers['content-type'].startswith('text/html')
    assert client.get('/api/v1/sandbox/ui/%2e%2e/token').status_code == 404
    assert client.get('/api/v1/sandbox/ui/a/../../token').status_code in (404, 307)
    assert client.post('/api/v1/sandbox/ui/token').status_code == 405
    token = terminal_token(TOKEN, ME['id'])
    for request in seen:
        assert request.url.host == f"flowie-sandbox-{ME['id']}"
        assert request.url.port == 7680
        assert request.url.path.startswith(f'/{token}/')
        assert 'cookie' not in request.headers
        assert 'authorization' not in request.headers
    assert seen[0].url.path == f'/{token}/'
    assert seen[0].url.query == b'arg=main'
    assert seen[0].headers['accept'] == 'text/html'


def test_ui_without_trailing_slash_redirects(monkeypatch):
    client = make_client(ME, monkeypatch)
    response = client.get('/api/v1/sandbox/ui', follow_redirects=False)
    assert response.status_code == 307
    assert response.headers['location'] == 'ui/'


@pytest.mark.parametrize(('path', 'origin'), [('ws', 'https://evil.example'), ('ws', None), ('term/ws', ORIGIN)])
def test_socket_refuses_other_origins_and_non_terminal_paths(monkeypatch, path, origin):
    client = make_client(ME, monkeypatch)
    headers = {'origin': origin} if origin else {}
    with pytest.raises(WebSocketDisconnect) as closed, client.websocket_connect(f'/api/v1/sandbox/ui/{path}', headers=headers):
        pass
    assert closed.value.code == 4403


def test_socket_is_piped_to_the_callers_ttyd_under_its_secret_path(monkeypatch):
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
    monkeypatch.setattr(sandbox, 'TERMINAL_PORT', port_box['port'])

    async def signed_in(socket):
        return ME

    monkeypatch.setattr(sandbox, '_socket_user', signed_in)
    client = make_client(ME, monkeypatch)
    with client.websocket_connect('/api/v1/sandbox/ui/ws?arg=main', headers={'origin': ORIGIN}, subprotocols=['tty']) as socket:
        socket.send_bytes(b'\x001')
        assert socket.receive_bytes() == b'\x001'
    assert seen['path'] == f"/{terminal_token(TOKEN, ME['id'])}/ws?arg=main"
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


def open_client(user, monkeypatch, sessions):
    async def readable(db, caller, issue_id):
        assert issue_id == ISSUE['id']
        return None, ISSUE

    async def repositories(db, policy, issue):
        return [REPOSITORY]

    monkeypatch.setattr(sandbox, '_readable_issue', readable)
    monkeypatch.setattr(sandbox, '_repositories', repositories)

    def handler(request):
        if request.url.port == 7681:
            return sessions(request)
        assert request.url.port == 4100
        return httpx.Response(200, json={'state': 'running'})

    client = make_client(user, monkeypatch, handler)
    client.app.dependency_overrides[sandbox.get_session] = lambda: None
    return client


def test_open_creates_the_issue_session_with_the_command(monkeypatch):
    seen = []

    def sessions(request):
        seen.append(request)
        assert request.url.host == f"flowie-sandbox-{ME['id']}"
        assert request.url.path == f"/{terminal_token(TOKEN, ME['id'])}/sessions"
        return httpx.Response(201, json={'name': 'DTD-7-flowie-web'})

    client = open_client(ME, monkeypatch, sessions)
    body = {'issueId': ISSUE['id'], 'repositoryId': REPOSITORY['id'], 'agent': 'codex'}
    assert client.post('/api/v1/sandbox/open', json=body).json() == {'data': {'session': 'DTD-7-flowie-web'}}
    sent = json.loads(seen[0].content)
    assert sent['name'] == 'DTD-7-flowie-web'
    assert sent['command'].endswith(" && codex 'Flowie task DTD-7: Fix the user'\"'\"'s login\n\nSteps:\n1. it'\"'\"'s \"broken\" $(rm -rf /)\n\nRepository flowie.web; you are on branch flowie/DTD-7-flowie-web, created from main.\n\nRun pnpm test.'")


def test_open_reuses_an_existing_session_and_refuses_strangers_and_other_repositories(monkeypatch):
    client = open_client(ME, monkeypatch, lambda request: httpx.Response(409, json={'error': 'The session exists.'}))
    body = {'issueId': ISSUE['id'], 'repositoryId': REPOSITORY['id'], 'agent': 'claude'}
    assert client.post('/api/v1/sandbox/open', json=body).json() == {'data': {'session': 'DTD-7-flowie-web'}}
    assert client.post('/api/v1/sandbox/open', json={**body, 'repositoryId': 'cother'}).status_code == 404
    assert client.post('/api/v1/sandbox/open', json={**body, 'agent': 'bash'}).status_code == 422
    stranger = open_client(STRANGER, monkeypatch, lambda request: httpx.Response(500))
    assert stranger.post('/api/v1/sandbox/open', json=body).status_code == 403


def agent_client(user, monkeypatch, agent):
    """A client whose sandbox agent answers with `agent`, or is down when it raises."""
    def handler(request):
        assert request.url.port == 7681
        assert request.url.host == f"flowie-sandbox-{user['id']}"
        token = terminal_token(TOKEN, user['id'])
        assert request.url.path.startswith(f'/{token}/')
        return agent(request, request.url.path.removeprefix(f'/{token}/'))

    return make_client(user, monkeypatch, handler)


def test_sessions_pass_agent_state_through_and_are_empty_while_stopped(monkeypatch):
    listed = [{'name': 'DTD-7', 'dir': '/home/node/work/x', 'agent': 'claude', 'state': 'waiting', 'preview': 'Edit?',
               'activity': 1, 'output': 2}]
    running = [True]

    def agent(request, path):
        if not running[0]:
            raise httpx.ConnectError('stopped')
        return httpx.Response(200, json=listed)

    client = agent_client(ME, monkeypatch, agent)
    assert client.get('/api/v1/sandbox/sessions').json() == {'data': [
        {'name': 'DTD-7', 'dir': '/home/node/work/x', 'agent': 'claude', 'state': 'waiting', 'preview': 'Edit?',
         'branch': None, 'changes': None}
    ]}
    running[0] = False
    assert client.get('/api/v1/sandbox/sessions').json() == {'data': []}


def test_session_writes_are_validated_here_and_forwarded(monkeypatch):
    seen = []

    def agent(request, path):
        seen.append((request.method, path, json.loads(request.content) if request.content else None))
        if path == 'sessions' and request.method == 'POST':
            return httpx.Response(409, json={'error': 'The session exists.'}) if len(seen) > 1 else httpx.Response(201, json={'name': 'x'})
        return httpx.Response(204) if request.method == 'DELETE' else httpx.Response(200, json={'name': 'y'})

    client = agent_client(ME, monkeypatch, agent)
    body = {'name': 'x', 'dir': '/home/node/work/a', 'agent': 'codex', 'resume': '0f8fad5b-d9cb-469f-a165-70867728950e'}
    assert client.post('/api/v1/sandbox/sessions', json=body).status_code == 201
    response = client.post('/api/v1/sandbox/sessions', json=body)
    assert response.status_code == 409 and response.json()['message'] == 'The session exists.'
    assert client.post('/api/v1/sandbox/sessions', json={**body, 'command': 'rm -rf ~'}).status_code == 422
    assert client.post('/api/v1/sandbox/sessions', json={**body, 'agent': 'bash'}).status_code == 422
    assert client.post('/api/v1/sandbox/sessions', json={**body, 'resume': 'x'}).status_code == 422
    assert client.post('/api/v1/sandbox/sessions/x/rename', json={'to': 'y'}).json() == {'data': {'name': 'y'}}
    assert client.post('/api/v1/sandbox/sessions/x/rename', json={'to': 'a b'}).status_code == 422
    assert client.delete('/api/v1/sandbox/sessions/x').status_code == 204
    assert client.delete('/api/v1/sandbox/sessions/a.b').status_code == 400
    assert seen[0] == ('POST', 'sessions', body)
    assert ('POST', 'sessions/x/rename', {'to': 'y'}) in seen and ('DELETE', 'sessions/x', None) in seen
    assert len(seen) == 4


def test_dirs_and_conversations_come_from_the_agent(monkeypatch):
    def agent(request, path):
        if path == 'dirs':
            return httpx.Response(200, json={'home': '/home/node', 'recent': ['/home/node']})
        assert path == 'conversations'
        return httpx.Response(200, json=[{'agent': 'claude', 'dir': request.url.params.get('dir')}])

    client = agent_client(ME, monkeypatch, agent)
    assert client.get('/api/v1/sandbox/dirs').json() == {'data': {'home': '/home/node', 'recent': ['/home/node']}}
    assert client.get('/api/v1/sandbox/conversations?dir=/home/node/w').json() == {
        'data': [{'agent': 'claude', 'dir': '/home/node/w'}]
    }


def test_strangers_reach_no_agent(monkeypatch):
    client = agent_client(STRANGER, monkeypatch, lambda request, path: httpx.Response(500))
    assert client.get('/api/v1/sandbox/dirs').status_code == 403
    assert client.get('/api/v1/sandbox/conversations').status_code == 403
    assert client.post('/api/v1/sandbox/sessions', json={'name': 'x'}).status_code == 403


def test_send_text_and_uploads_reach_the_agent(monkeypatch):
    seen = []

    def agent(request, path):
        seen.append((request.method, path, request.headers.get('x-filename'), request.content))
        if path == 'uploads':
            return httpx.Response(201, json={'path': '/home/node/.flowie/uploads/1-a.png'})
        if path.endswith('/text'):
            return httpx.Response(200, json={'text': 'hello'})
        return httpx.Response(200, json={'ok': True})

    client = agent_client(ME, monkeypatch, agent)
    body = {'text': 'Sửa lỗi\nrồi chạy test', 'enter': True}
    assert client.post('/api/v1/sandbox/sessions/cl/send', json=body).json() == {'data': {'ok': True}}
    assert json.loads(seen[-1][3]) == body
    assert client.post('/api/v1/sandbox/sessions/cl/send', json={'key': 'C-z'}).status_code == 422
    assert client.post('/api/v1/sandbox/sessions/cl/send', json={'text': 'x' * 20_001}).status_code == 422
    assert client.post('/api/v1/sandbox/sessions/a.b/send', json={'key': 'Enter'}).status_code == 400
    assert client.get('/api/v1/sandbox/sessions/cl/text').json() == {'data': {'text': 'hello'}}

    response = client.post(
        '/api/v1/sandbox/uploads', content=b'\x89PNG', headers={'x-filename': '%E1%BA%A3nh%20m%C3%A0n.png'}
    )
    assert response.json() == {'data': {'path': '/home/node/.flowie/uploads/1-a.png'}}
    assert seen[-1][0] == 'POST' and seen[-1][1] == 'uploads' and seen[-1][3] == b'\x89PNG'
    assert seen[-1][2] == '%E1%BA%A3nh%20m%C3%A0n.png'
    count = len(seen)
    too_big = client.post('/api/v1/sandbox/uploads', content=b'x', headers={'content-length': str(26 * 1024 * 1024)})
    assert too_big.status_code in (413, 400) and len(seen) == count


def test_files_and_git_reach_the_agent_with_their_parameters(monkeypatch):
    seen = []

    def agent(request, path):
        seen.append((request.method, path, dict(request.url.params), request.content))
        if path == 'raw':
            if request.url.params['path'].endswith('.svg'):
                return httpx.Response(200, content=b'<svg/>', headers={'content-type': 'image/svg+xml'})
            return httpx.Response(415, json={'error': 'Only images can be shown directly.'})
        return httpx.Response(200, json={'ok': path})

    client = agent_client(ME, monkeypatch, agent)
    assert client.get('/api/v1/sandbox/files?dir=/home/node/w').json() == {'data': {'ok': 'ls'}}
    assert client.get('/api/v1/sandbox/file?path=/home/node/a.md').json() == {'data': {'ok': 'file'}}
    assert client.get('/api/v1/sandbox/git?dir=/home/node/w').json() == {'data': {'ok': 'git'}}
    assert client.get('/api/v1/sandbox/git/diff?dir=/home/node/w&file=a.md&staged=true').status_code == 200
    assert seen[-1][2] == {'dir': '/home/node/w', 'rev': '', 'file': 'a.md', 'staged': '1'}
    assert client.get('/api/v1/sandbox/git/diff?dir=/w&rev=HEAD~1').status_code == 422
    body = {'dir': '/home/node/w', 'op': 'commit', 'message': 'Sửa README'}
    assert client.post('/api/v1/sandbox/git', json=body).json() == {'data': {'ok': 'git/op'}}
    assert json.loads(seen[-1][3]) == body
    for bad in ({**body, 'op': 'reset'}, {**body, 'op': 'switch', 'branch': 'a b'}, {**body, 'extra': 1}):
        assert client.post('/api/v1/sandbox/git', json=bad).status_code == 422

    image = client.get('/api/v1/sandbox/file/raw?path=/home/node/logo.svg')
    assert image.content == b'<svg/>' and image.headers['content-type'] == 'image/svg+xml'
    assert image.headers['content-security-policy'] == 'sandbox' and image.headers['x-content-type-options'] == 'nosniff'
    assert client.get('/api/v1/sandbox/file/raw?path=/home/node/a.md').status_code == 404


def test_usage_passes_through_and_is_null_while_stopped(monkeypatch):
    up = [True]

    def agent(request, path):
        assert path == 'usage'
        if not up[0]:
            raise httpx.ConnectError('stopped')
        return httpx.Response(200, json={'cpu': 5})

    client = agent_client(ME, monkeypatch, agent)
    assert client.get('/api/v1/sandbox/usage').json() == {'data': {'cpu': 5}}
    up[0] = False
    assert client.get('/api/v1/sandbox/usage').json() == {'data': None}


def test_the_terminal_token_never_reaches_the_logs(monkeypatch, caplog):
    client = agent_client(ME, monkeypatch, lambda request, path: httpx.Response(200, json=[]))
    with caplog.at_level('INFO', logger='httpx'):
        assert client.get('/api/v1/sandbox/sessions').status_code == 200
    token = terminal_token(TOKEN, ME['id'])
    lines = [record.getMessage() for record in caplog.records if record.name == 'httpx']
    assert lines and all(token not in line for line in lines)
    assert any('/<token>/sessions' in line for line in lines)


def test_chat_and_conversations_reach_the_agent(monkeypatch):
    seen = []

    def agent(request, path):
        seen.append((path, dict(request.url.params)))
        return httpx.Response(200, json={'agent': 'claude', 'items': []})

    client = agent_client(ME, monkeypatch, agent)
    assert client.get('/api/v1/sandbox/sessions/DTD-7/chat').json()['data']['agent'] == 'claude'
    assert seen[-1] == ('sessions/DTD-7/chat', {'limit': '80'})
    conversation = '0f8fad5b-d9cb-469f-a165-70867728950e'
    assert client.get(f'/api/v1/sandbox/conversations/codex/{conversation}?limit=20').status_code == 200
    assert seen[-1] == (f'conversations/codex/{conversation}', {'limit': '20'})
    assert client.get(f'/api/v1/sandbox/conversations/bash/{conversation}').status_code == 422
    assert client.get('/api/v1/sandbox/conversations/claude/x').status_code == 400
    assert client.get('/api/v1/sandbox/sessions/DTD-7/chat?limit=999').status_code == 422
    assert len(seen) == 2


def test_pipelines_reach_the_agent(monkeypatch):
    seen = []

    def agent(request, path):
        seen.append((request.method, path, dict(request.url.params), request.content))
        return httpx.Response(200, json={'ok': path})

    client = agent_client(ME, monkeypatch, agent)
    assert client.get('/api/v1/sandbox/ci?dir=/home/node/w&fresh=true').json() == {'data': {'ok': 'ci'}}
    assert seen[-1][2] == {'dir': '/home/node/w', 'fresh': '1'}
    assert client.get('/api/v1/sandbox/ci/log?dir=/home/node/w&id=42').status_code == 200
    assert client.get('/api/v1/sandbox/ci/log?dir=/home/node/w&id=4;2').status_code == 422
    body = {'dir': '/home/node/w', 'id': '42', 'action': 'rerun'}
    assert client.post('/api/v1/sandbox/ci', json=body).status_code == 200
    assert json.loads(seen[-1][3]) == body
    assert client.post('/api/v1/sandbox/ci', json={**body, 'action': 'delete'}).status_code == 422
    assert len(seen) == 3
