"""Creates, starts, stops and removes the per-user coding sandboxes.

It is the only Flowie process given the Docker socket, which is root-equivalent
on the host, so it does as little as possible: it serves a small HTTP API on the
internal Compose network, behind a bearer token only the Flowie API holds, and
every container it makes comes from one image with one fixed, locked-down
configuration. No caller can choose the image, mounts, capabilities or network.
Run with `python -m app.sandbox_manager`; it uses only the standard library.
VI: Tạo, khởi động, dừng và xoá sandbox lập trình của từng người dùng.
VI: Đây là tiến trình Flowie duy nhất được cấp Docker socket, vốn tương đương quyền
VI: root trên host, nên nó làm ít nhất có thể: phục vụ một API HTTP nhỏ trong mạng
VI: Compose nội bộ, sau một bearer token mà chỉ API Flowie giữ, và mọi container nó
VI: tạo đều từ một image với một cấu hình cố định, đã khoá chặt. Không bên gọi nào
VI: chọn được image, mount, capability hay mạng. Chạy bằng
VI: `python -m app.sandbox_manager`; chỉ dùng thư viện chuẩn.
"""

from __future__ import annotations

import http.client
import json
import os
import re
import secrets
import socket
import sys
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Protocol

# Flowie user ids are cuids: lowercase letters and digits only. Checking the
# shape keeps the id safe inside a container name and a Docker API path.
# VI: Id người dùng Flowie là cuid: chỉ chữ thường và số. Kiểm hình dạng để id
# VI: an toàn khi nằm trong tên container và đường dẫn API Docker.
USER_ID = re.compile(r'^[a-z0-9]{20,40}$')
USER_LABEL = 'vn.bsr.flowie.sandbox.user'
HOME = '/home/node'
MIN_TOKEN_LENGTH = 32


@dataclass(frozen=True)
class Config:
    token: str
    image: str = 'flowie-sandbox:latest'
    network: str = 'flowie-sandbox'
    # The firewall script matches this interface name, so it is fixed here.
    # VI: Script firewall khớp theo tên interface này nên nó được cố định ở đây.
    bridge: str = 'flowie-sbx0'
    subnet: str = '172.31.250.0/24'
    mtu: str = '1400'
    cpus: float = 1.0
    memory_mb: int = 2048
    pids: int = 512
    socket_path: str = '/var/run/docker.sock'
    port: int = 4100

    @classmethod
    def from_env(cls, env: dict[str, str]) -> Config:
        """Reads the SANDBOX_* variables and refuses to start without a strong
        token, because an empty one would let any container on the network
        drive Docker.
        VI: Đọc các biến SANDBOX_* và từ chối khởi động khi thiếu token đủ mạnh, vì
        VI: token rỗng sẽ cho mọi container trong mạng điều khiển Docker."""
        token = env.get('SANDBOX_MANAGER_TOKEN', '')
        if len(token) < MIN_TOKEN_LENGTH:
            raise ValueError(f'SANDBOX_MANAGER_TOKEN must be at least {MIN_TOKEN_LENGTH} characters.')
        defaults = cls(token=token)
        return cls(
            token=token,
            image=env.get('SANDBOX_IMAGE', defaults.image),
            subnet=env.get('SANDBOX_SUBNET', defaults.subnet),
            mtu=env.get('DOCKER_NETWORK_MTU', defaults.mtu),
            cpus=float(env.get('SANDBOX_CPUS', defaults.cpus)),
            memory_mb=int(env.get('SANDBOX_MEMORY_MB', defaults.memory_mb)),
            pids=int(env.get('SANDBOX_PIDS', defaults.pids)),
            socket_path=env.get('DOCKER_SOCKET', defaults.socket_path),
            port=int(env.get('SANDBOX_MANAGER_PORT', defaults.port)),
        )


class DockerApi(Protocol):
    def request(self, method: str, path: str, body: Any = None) -> tuple[int, Any]: ...


class _UnixConnection(http.client.HTTPConnection):
    def __init__(self, socket_path: str):
        super().__init__('localhost', timeout=60)
        self.socket_path = socket_path

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.socket_path)


class Docker:
    """Docker Engine API over the unix socket, unversioned so the daemon's own
    API version is used whatever Docker release the host runs.
    VI: Docker Engine API qua unix socket, không gắn phiên bản để dùng đúng phiên bản
    VI: API của daemon dù host chạy bản Docker nào."""

    def __init__(self, socket_path: str):
        self.socket_path = socket_path

    def request(self, method: str, path: str, body: Any = None) -> tuple[int, Any]:
        connection = _UnixConnection(self.socket_path)
        try:
            payload = None if body is None else json.dumps(body)
            connection.request(method, path, body=payload, headers={'Content-Type': 'application/json'})
            response = connection.getresponse()
            raw = response.read()
        finally:
            connection.close()
        is_json = (response.getheader('Content-Type') or '').startswith('application/json')
        return response.status, json.loads(raw) if raw and is_json else None


class SandboxError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def container_name(user_id: str) -> str:
    return f'flowie-sandbox-{user_id}'


def container_spec(config: Config, user_id: str) -> dict[str, Any]:
    """The only container configuration the manager ever creates. It runs as the
    image's unprivileged user with every capability dropped and privilege
    escalation off, bounded in CPU, memory and process count, attached only to
    the sandbox network that the host firewall isolates, and mounts nothing but
    the user's own home volume (created by Docker on first use and seeded from
    the image).
    VI: Cấu hình container duy nhất mà manager từng tạo. Chạy bằng user thường của
    VI: image, bỏ mọi capability, tắt leo thang đặc quyền, giới hạn CPU, bộ nhớ và số
    VI: tiến trình, chỉ gắn vào mạng sandbox mà firewall của host cô lập, và chỉ mount
    VI: volume home của chính người dùng đó (Docker tạo khi dùng lần đầu, lấy nội dung
    VI: ban đầu từ image)."""
    memory = config.memory_mb * 1024 * 1024
    return {
        'Image': config.image,
        'Hostname': 'sandbox',
        'User': 'node',
        'WorkingDir': HOME,
        'Labels': {USER_LABEL: user_id},
        'HostConfig': {
            'Init': True,
            'CapDrop': ['ALL'],
            'SecurityOpt': ['no-new-privileges:true'],
            'Privileged': False,
            'NanoCpus': int(config.cpus * 1e9),
            'Memory': memory,
            'MemorySwap': memory,
            'PidsLimit': config.pids,
            'NetworkMode': config.network,
            'RestartPolicy': {'Name': 'no'},
            'Mounts': [{
                'Type': 'volume',
                'Source': f'flowie-sandbox-home-{user_id}',
                'Target': HOME,
                'VolumeOptions': {'Labels': {USER_LABEL: user_id}},
            }],
            # shortcut: no per-user disk quota (needs xfs with pquota on the
            # host); add StorageOpt or volume size limits if disks fill up.
            # VI: shortcut: chưa có quota ổ đĩa theo người (cần xfs có pquota trên
            # VI: host); thêm StorageOpt hoặc giới hạn volume nếu ổ đầy.
        },
    }


class Manager:
    def __init__(self, config: Config, docker: DockerApi):
        self.config = config
        self.docker = docker

    def ensure_network(self) -> None:
        """Creates the sandbox bridge with its fixed interface name and subnet
        when it is missing; the firewall rules are written against both.
        VI: Tạo bridge sandbox với tên interface và subnet cố định khi chưa có; luật
        VI: firewall được viết theo cả hai."""
        status, _ = self.docker.request('GET', f'/networks/{self.config.network}')
        if status == 200:
            return
        status, body = self.docker.request('POST', '/networks/create', {
            'Name': self.config.network,
            'Driver': 'bridge',
            'Options': {
                'com.docker.network.bridge.name': self.config.bridge,
                'com.docker.network.driver.mtu': self.config.mtu,
            },
            'IPAM': {'Config': [{'Subnet': self.config.subnet}]},
        })
        if status != 201:
            raise SandboxError(502, f'Could not create network: {body}')

    def describe(self, user_id: str) -> dict[str, Any] | None:
        status, body = self.docker.request('GET', f'/containers/{container_name(user_id)}/json')
        if status == 404:
            return None
        if status != 200:
            raise SandboxError(502, f'Docker returned {status}')
        # A container with the sandbox's name that this manager did not label is
        # never touched: it may be something else an operator created.
        # VI: Container trùng tên sandbox mà manager không gắn nhãn thì không bao giờ
        # VI: bị đụng tới: có thể là thứ khác do quản trị tạo.
        if (body.get('Config') or {}).get('Labels', {}).get(USER_LABEL) != user_id:
            raise SandboxError(409, 'A container with this name is not a Flowie sandbox.')
        networks = (body.get('NetworkSettings') or {}).get('Networks') or {}
        return {
            'userId': user_id,
            'state': body['State']['Status'],
            'address': (networks.get(self.config.network) or {}).get('IPAddress') or None,
        }

    def ensure(self, user_id: str) -> dict[str, Any]:
        found = self.describe(user_id)
        name = container_name(user_id)
        if found is None:
            status, body = self.docker.request(
                'POST', f'/containers/create?name={name}', container_spec(self.config, user_id)
            )
            if status != 201:
                raise SandboxError(502, f'Could not create sandbox: {body}')
        if found is None or found['state'] != 'running':
            status, body = self.docker.request('POST', f'/containers/{name}/start')
            if status not in (204, 304):
                raise SandboxError(502, f'Could not start sandbox: {body}')
        result = self.describe(user_id)
        assert result is not None
        return result

    def stop(self, user_id: str) -> dict[str, Any]:
        if self.describe(user_id) is None:
            raise SandboxError(404, 'No sandbox for this user.')
        status, body = self.docker.request('POST', f'/containers/{container_name(user_id)}/stop?t=10')
        if status not in (204, 304):
            raise SandboxError(502, f'Could not stop sandbox: {body}')
        result = self.describe(user_id)
        assert result is not None
        return result

    def remove(self, user_id: str) -> None:
        """Removes the container but keeps the home volume, so sign-ins and
        clones come back with the next `ensure`; deleting a person's data is a
        separate, deliberate operator step.
        VI: Xoá container nhưng giữ volume home, để thông tin đăng nhập và repo đã
        VI: clone quay lại ở lần `ensure` sau; xoá dữ liệu của một người là bước riêng,
        VI: có chủ đích của quản trị."""
        if self.describe(user_id) is None:
            raise SandboxError(404, 'No sandbox for this user.')
        status, body = self.docker.request('DELETE', f'/containers/{container_name(user_id)}?force=true')
        if status != 204:
            raise SandboxError(502, f'Could not remove sandbox: {body}')


def handle(manager: Manager, method: str, path: str, authorization: str) -> tuple[int, Any]:
    """Routes one request. Authentication is checked first with a constant-time
    comparison; only `/sandboxes/<userId>` and `/sandboxes/<userId>/stop` exist.
    VI: Định tuyến một request. Xác thực được kiểm trước bằng phép so sánh thời gian
    VI: không đổi; chỉ có `/sandboxes/<userId>` và `/sandboxes/<userId>/stop`."""
    if not secrets.compare_digest(authorization.encode(), f'Bearer {manager.config.token}'.encode()):
        return 401, {'error': 'Unauthorized'}
    parts = path.split('?', 1)[0].strip('/').split('/')
    if len(parts) not in (2, 3) or parts[0] != 'sandboxes':
        return 404, {'error': 'Not found'}
    user_id = parts[1]
    if not USER_ID.match(user_id):
        return 400, {'error': 'Invalid user id'}
    action = parts[2] if len(parts) == 3 else None
    try:
        if action is None and method == 'GET':
            found = manager.describe(user_id)
            return (200, found) if found else (404, {'error': 'No sandbox for this user.'})
        if action is None and method == 'PUT':
            return 200, manager.ensure(user_id)
        if action is None and method == 'DELETE':
            manager.remove(user_id)
            return 204, None
        if action == 'stop' and method == 'POST':
            return 200, manager.stop(user_id)
    except SandboxError as error:
        return error.status, {'error': error.message}
    return 405, {'error': 'Method not allowed'}


def serve(manager: Manager) -> None:
    class Handler(BaseHTTPRequestHandler):
        server_version = 'flowie-sandbox-manager'

        def _respond(self) -> None:
            status, body = handle(manager, self.command, self.path, self.headers.get('Authorization', ''))
            payload = b'' if body is None else json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        do_GET = do_PUT = do_POST = do_DELETE = _respond

    manager.ensure_network()
    server = ThreadingHTTPServer(('0.0.0.0', manager.config.port), Handler)
    print(f'sandbox-manager listening on :{manager.config.port}', file=sys.stderr, flush=True)
    server.serve_forever()


if __name__ == '__main__':
    settings = Config.from_env(dict(os.environ))
    serve(Manager(settings, Docker(settings.socket_path)))
