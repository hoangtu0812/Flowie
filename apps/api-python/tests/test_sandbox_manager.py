from typing import Any

import pytest

from app.sandbox_manager import USER_LABEL, Config, Manager, container_spec, handle

TOKEN = 'x' * 40
USER = 'ctwwf9lkb5z0bsyzit9na6opp'
AUTH = f'Bearer {TOKEN}'


class FakeDocker:
    """Records Docker API calls; containers is name -> (state, owner label).
    VI: Ghi lại lời gọi API Docker; containers là tên -> (trạng thái, nhãn chủ)."""

    def __init__(self, containers: dict[str, tuple[str, str]] | None = None):
        self.containers = dict(containers or {})
        self.calls: list[tuple[str, str, Any]] = []

    def request(self, method: str, path: str, body: Any = None) -> tuple[int, Any]:
        self.calls.append((method, path, body))
        name = path.split('/')[2].split('?')[0] if path.startswith('/containers/') else ''
        if method == 'GET' and path.endswith('/json'):
            if name not in self.containers:
                return 404, None
            state, owner = self.containers[name]
            return 200, {
                'State': {'Status': state},
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
    assert body == {'userId': USER, 'state': 'running', 'address': '172.31.250.2'}
    create = next(call for call in docker.calls if call[1].startswith('/containers/create'))
    host = create[2]['HostConfig']
    assert host['CapDrop'] == ['ALL']
    assert host['SecurityOpt'] == ['no-new-privileges:true']
    assert host['Privileged'] is False
    assert host['NetworkMode'] == 'flowie-sandbox'
    assert host['Memory'] == host['MemorySwap'] == 2048 * 1024 * 1024
    assert [mount['Source'] for mount in host['Mounts']] == [f'flowie-sandbox-home-{USER}']
    assert 'Binds' not in host and 'PortBindings' not in host


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
