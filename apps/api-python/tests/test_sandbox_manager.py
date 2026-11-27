import json
from typing import Any

import pytest

from app.sandbox_manager import (
    USER_LABEL,
    Config,
    Manager,
    container_spec,
    handle,
    stdout_of,
    terminal_token,
)

TOKEN = 'x' * 40
USER = 'ctwwf9lkb5z0bsyzit9na6opp'
AUTH = f'Bearer {TOKEN}'


class FakeDocker:
    """Records Docker API calls; containers is name -> (state, owner label).
    VI: Ghi lại lời gọi API Docker; containers là tên -> (trạng thái, nhãn chủ)."""

    def __init__(self, containers: dict[str, tuple[str, str]] | None = None):
        self.containers = dict(containers or {})
        self.calls: list[tuple[str, str, Any]] = []
        self.tmux: dict[str, int] = {}  # session name -> last activity
        self.typed: list[tuple[str, ...]] = []
        self.execs: dict[str, dict[str, Any]] = {}

    def run_tmux(self, args: list[str]) -> tuple[int, bytes, bytes]:
        """A tiny tmux: just the commands the manager sends."""
        verb = args[1]
        if verb == 'list-sessions':
            if not self.tmux:
                return 1, b'', b'no server running\n'
            return 0, ''.join(f'{n}\t{a}\t{a + 5}\n' for n, a in self.tmux.items()).encode(), b''
        if verb == 'new-session':
            name = args[args.index('-s') + 1]
            if name in self.tmux:
                return 1, b'', b'duplicate session\n'
            self.tmux[name] = 1_800_000_000
            return 0, b'', b''
        if verb == 'send-keys':
            self.typed.append(tuple(args[2:]))
            return 0, b'', b''
        if verb == 'kill-session':
            name = args[3].removeprefix('=')
            return (0, b'', b'') if self.tmux.pop(name, None) else (1, b'', b"can't find session\n")
        return 1, b'', b''

    def request(self, method: str, path: str, body: Any = None) -> tuple[int, Any]:
        self.calls.append((method, path, body))
        name = path.split('/')[2].split('?')[0] if path.startswith('/containers/') else ''
        if method == 'POST' and path.endswith('/exec'):
            exec_id = f'e{len(self.execs)}'
            self.execs[exec_id] = {'spec': body}
            return 201, {'Id': exec_id}
        if path.startswith('/exec/') and path.endswith('/start'):
            run = self.execs[path.split('/')[2]]
            code, out, err = self.run_tmux(run['spec']['Cmd'])
            run['code'] = code
            frame = lambda kind, data: bytes([kind, 0, 0, 0]) + len(data).to_bytes(4, 'big') + data  # noqa: E731
            return 200, (frame(2, err) if err else b'') + (frame(1, out) if out else b'')
        if path.startswith('/exec/') and path.endswith('/json'):
            return 200, {'ExitCode': self.execs[path.split('/')[2]]['code']}
        if method == 'GET' and path.startswith('/containers/json?filters='):
            return 200, [{'Labels': {USER_LABEL: owner}} for state, owner in self.containers.values() if state == 'running']
        if method == 'GET' and path.endswith('/json'):
            if name not in self.containers:
                return 404, None
            state, owner = self.containers[name]
            return 200, {
                'State': {'Status': state, 'StartedAt': '2026-11-27T02:00:00.123456789Z'},
                'Config': {'Labels': {USER_LABEL: owner}},
                'NetworkSettings': {'Networks': {'flowie-sandbox': {'IPAddress': '172.31.250.2'}}},
            }
        if method == 'POST' and path.startswith('/containers/create?name='):
            self.containers[path.split('=', 1)[1]] = ('created', body['Labels'][USER_LABEL])
            return 201, {}
        if method == 'POST' and path.endswith('/start'):
            self.containers[name] = ('running', self.containers[name][1])
            return 204, None
        if method == 'POST' and '/stop' in path:
            self.containers[name] = ('exited', self.containers[name][1])
            return 204, None
        if method == 'DELETE':
            del self.containers[name]
            return 204, None
        return 500, None


def manager(docker: FakeDocker) -> Manager:
    return Manager(Config(token=TOKEN), docker)


def test_config_refuses_a_missing_or_short_token():
    with pytest.raises(ValueError):
        Config.from_env({})
    with pytest.raises(ValueError):
        Config.from_env({'SANDBOX_MANAGER_TOKEN': 'short'})
    assert Config.from_env({'SANDBOX_MANAGER_TOKEN': TOKEN, 'SANDBOX_MEMORY_MB': '4096'}).memory_mb == 4096


def test_every_request_needs_the_token():
    docker = FakeDocker()
    assert handle(manager(docker), 'PUT', f'/sandboxes/{USER}', '')[0] == 401
    assert handle(manager(docker), 'PUT', f'/sandboxes/{USER}', 'Bearer wrong')[0] == 401
    assert docker.calls == []


@pytest.mark.parametrize('user_id', ['ABC', '../x', 'a' * 19, 'a' * 41, 'abc-defghijklmnopqrstuvw'])
def test_user_id_shape_is_checked_before_docker_is_called(user_id):
    docker = FakeDocker()
    assert handle(manager(docker), 'PUT', f'/sandboxes/{user_id}', AUTH)[0] in (400, 404)
    assert docker.calls == []


def test_ensure_creates_a_locked_down_container_and_starts_it():
    docker = FakeDocker()
    status, body = handle(manager(docker), 'PUT', f'/sandboxes/{USER}', AUTH)
    assert status == 200
    assert body == {
        'userId': USER, 'state': 'running', 'address': '172.31.250.2', 'startedAt': '2026-11-27T02:00:00.123456789Z'
    }
    create = next(call for call in docker.calls if call[1].startswith('/containers/create'))
    host = create[2]['HostConfig']
    assert host['CapDrop'] == ['ALL']
    assert host['SecurityOpt'] == ['no-new-privileges:true']
    assert host['Privileged'] is False
    assert host['NetworkMode'] == 'flowie-sandbox'
    assert host['Memory'] == host['MemorySwap'] == 2048 * 1024 * 1024
    assert [mount['Source'] for mount in host['Mounts']] == [f'flowie-sandbox-home-{USER}']
    assert 'Binds' not in host and 'PortBindings' not in host
    assert create[2]['Env'] == [f'TERMINAL_TOKEN={terminal_token(TOKEN, USER)}']
    assert terminal_token(TOKEN, USER) != terminal_token(TOKEN, 'c' * 25)


def test_ensure_on_a_running_sandbox_changes_nothing():
    docker = FakeDocker({f'flowie-sandbox-{USER}': ('running', USER)})
    assert handle(manager(docker), 'PUT', f'/sandboxes/{USER}', AUTH)[0] == 200
    assert [call[0] for call in docker.calls] == ['GET', 'GET']


def test_a_container_with_the_name_but_another_owner_is_left_alone():
    docker = FakeDocker({f'flowie-sandbox-{USER}': ('running', 'someoneelse0000000000000')})
    assert handle(manager(docker), 'DELETE', f'/sandboxes/{USER}', AUTH)[0] == 409
    assert all(call[0] == 'GET' for call in docker.calls)


def test_stop_and_remove_keep_the_home_volume():
    docker = FakeDocker({f'flowie-sandbox-{USER}': ('running', USER)})
    assert handle(manager(docker), 'POST', f'/sandboxes/{USER}/stop', AUTH)[1]['state'] == 'exited'
    assert handle(manager(docker), 'DELETE', f'/sandboxes/{USER}', AUTH)[0] == 204
    assert not any('/volumes' in call[1] for call in docker.calls)
    assert handle(manager(docker), 'GET', f'/sandboxes/{USER}', AUTH)[0] == 404


def test_spec_never_takes_image_or_mounts_from_the_caller():
    spec = container_spec(Config(token=TOKEN, image='flowie-sandbox:1'), USER)
    assert spec['Image'] == 'flowie-sandbox:1'
    assert spec['User'] == 'node'


def test_list_returns_only_running_labelled_sandboxes():
    other = 'cotheruser000000000000000'
    docker = FakeDocker({
        f'flowie-sandbox-{USER}': ('running', USER),
        f'flowie-sandbox-{other}': ('exited', other),
    })
    status, body = handle(manager(docker), 'GET', '/sandboxes', AUTH)
    assert status == 200
    assert [item['userId'] for item in body] == [USER]
    assert body[0]['startedAt'] == '2026-11-27T02:00:00.123456789Z'
    assert '%22label%22' in docker.calls[0][1]
    assert handle(manager(docker), 'GET', '/sandboxes', 'Bearer wrong')[0] == 401


def test_stdout_of_keeps_only_stdout_frames():
    frame = lambda kind, data: bytes([kind, 0, 0, 0]) + len(data).to_bytes(4, 'big') + data  # noqa: E731
    assert stdout_of(frame(2, b'warn\n') + frame(1, b'a\t1\t2\n') + frame(1, 'é'.encode())) == 'a\t1\t2\né'
    assert stdout_of(b'') == ''


def test_sessions_are_listed_created_with_a_typed_command_and_closed():
    docker = FakeDocker({f'flowie-sandbox-{USER}': ('running', USER)})
    sessions = f'/sandboxes/{USER}/sessions'
    assert handle(manager(docker), 'GET', sessions, AUTH) == (200, [])
    body = json.dumps({'name': 'DTD-1-flowie', 'command': "echo 'hi'; rm -rf $HOME"}).encode()
    assert handle(manager(docker), 'POST', sessions, AUTH, body) == (201, {'name': 'DTD-1-flowie'})
    assert docker.typed == [('-t', '=DTD-1-flowie:', '-l', '--', "echo 'hi'; rm -rf $HOME"), ('-t', '=DTD-1-flowie:', 'Enter')]
    specs = [run['spec'] for run in docker.execs.values()]
    assert all(spec['User'] == 'node' and spec['Cmd'][0] == 'tmux' for spec in specs)
    assert handle(manager(docker), 'GET', sessions, AUTH) == (
        200, [{'name': 'DTD-1-flowie', 'activity': 1_800_000_000, 'output': 1_800_000_005}]
    )
    assert handle(manager(docker), 'POST', sessions, AUTH, body)[0] == 409
    assert handle(manager(docker), 'DELETE', f'{sessions}/DTD-1-flowie', AUTH)[0] == 204
    assert handle(manager(docker), 'DELETE', f'{sessions}/DTD-1-flowie', AUTH)[0] == 404


@pytest.mark.parametrize('body', [b'{"name": "a b"}', b'{"name": "x", "command": 5}', b'not json', b'[]'])
def test_session_requests_are_validated(body):
    docker = FakeDocker({f'flowie-sandbox-{USER}': ('running', USER)})
    assert handle(manager(docker), 'POST', f'/sandboxes/{USER}/sessions', AUTH, body)[0] == 400
    assert handle(manager(docker), 'DELETE', f'/sandboxes/{USER}/sessions/a.b', AUTH)[0] == 400
    assert docker.typed == []


def test_sessions_need_a_running_sandbox():
    docker = FakeDocker({f'flowie-sandbox-{USER}': ('exited', USER)})
    assert handle(manager(docker), 'GET', f'/sandboxes/{USER}/sessions', AUTH)[0] == 409
    assert handle(manager(FakeDocker()), 'GET', f'/sandboxes/{USER}/sessions', AUTH)[0] == 404
