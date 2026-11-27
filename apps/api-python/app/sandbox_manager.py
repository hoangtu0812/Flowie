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

import hashlib
import hmac
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
from urllib.parse import quote

# Flowie user ids are cuids: lowercase letters and digits only. Checking the
# shape keeps the id safe inside a container name and a Docker API path.
# VI: Id người dùng Flowie là cuid: chỉ chữ thường và số. Kiểm hình dạng để id
# VI: an toàn khi nằm trong tên container và đường dẫn API Docker.
USER_ID = re.compile(r'^[a-z0-9]{20,40}$')
USER_LABEL = 'vn.bsr.flowie.sandbox.user'
TERMINAL_PORT = 7680
# tmux session names: what ttyd's sandbox-session accepts, safe as a tmux target.
# VI: Tên phiên tmux: đúng những gì sandbox-session của ttyd nhận, an toàn làm target tmux.
SESSION_NAME = re.compile(r'^[A-Za-z0-9_-]{1,40}$')
MAX_COMMAND = 20_000
HOME = '/home/node'
MIN_TOKEN_LENGTH = 32


@dataclass(frozen=True)
class Config:
    token: str
    image: str = 'flowie-sandbox:latest'
    # Created by Compose with the `api` service (docker-compose.yml), which is
    # also how the API reaches the sandboxes by container name.
    # VI: Do Compose tạo cùng service `api` (docker-compose.yml), cũng là cách API
    # VI: gọi tới sandbox theo tên container.
    network: str = 'flowie-sandbox'
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
        return response.status, json.loads(raw) if raw and is_json else (raw or None)


class SandboxError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def container_name(user_id: str) -> str:
    return f'flowie-sandbox-{user_id}'


def terminal_token(secret: str, user_id: str) -> str:
    """The secret base path under which a user's ttyd answers (`/<token>/`). It is
    derived from the manager token rather than stored, so the API (which holds the
    same secret) can compute it for the signed-in user and nothing has to be kept in
    the database. It reaches only the container's environment and the API, never a
    browser. Rotating SANDBOX_MANAGER_TOKEN changes every token: remove the
    containers so the next `ensure` creates them with the new one.
    VI: Đường dẫn gốc bí mật mà ttyd của một người dùng trả lời (`/<token>/`). Nó được suy
    VI: ra từ token của manager thay vì lưu lại, nên API (giữ cùng secret) tính được cho
    VI: người đang đăng nhập và không phải lưu gì trong database. Nó chỉ tới môi trường
    VI: của container và API, không bao giờ tới trình duyệt. Đổi SANDBOX_MANAGER_TOKEN
    VI: làm đổi mọi token: xoá các container để lần `ensure` sau tạo lại với token mới."""
    return hmac.new(secret.encode(), f'terminal:{user_id}'.encode(), hashlib.sha256).hexdigest()


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
        'Env': [f'TERMINAL_TOKEN={terminal_token(config.token, user_id)}'],
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


def stdout_of(stream: bytes) -> str:
    """stdout from Docker's multiplexed exec stream: frames of an 8-byte header
    (stream type, 3 zero bytes, big-endian length) followed by the payload.
    VI: stdout từ luồng exec ghép kênh của Docker: các khung gồm header 8 byte (loại
    VI: luồng, 3 byte 0, độ dài big-endian) rồi tới dữ liệu."""
    out, position = bytearray(), 0
    while position + 8 <= len(stream):
        kind, size = stream[position], int.from_bytes(stream[position + 4:position + 8], 'big')
        if kind == 1:
            out += stream[position + 8:position + 8 + size]
        position += 8 + size
    return out.decode('utf-8', 'replace')


class Manager:
    def __init__(self, config: Config, docker: DockerApi):
        self.config = config
        self.docker = docker

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
            'startedAt': body['State'].get('StartedAt'),
        }

    def running(self) -> list[dict[str, Any]]:
        """Every running sandbox this manager labelled, for the API's idle check.
        VI: Mọi sandbox đang chạy do manager gắn nhãn, cho việc kiểm tra rảnh của API."""
        filters = json.dumps({'label': [USER_LABEL], 'status': ['running']})
        status, body = self.docker.request('GET', f'/containers/json?filters={quote(filters)}')
        if status != 200:
            raise SandboxError(502, f'Docker returned {status}')
        users = [(item.get('Labels') or {}).get(USER_LABEL, '') for item in body]
        found = [self.describe(user_id) for user_id in users if USER_ID.match(user_id)]
        return [item for item in found if item and item['state'] == 'running']

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


    def _exec(self, user_id: str, *command: str) -> tuple[int, str]:
        """Runs a command as the sandbox user inside a running sandbox; returns its
        exit code and stdout. Only the fixed tmux commands below ever reach it.
        VI: Chạy một lệnh với user của sandbox bên trong sandbox đang chạy; trả mã thoát và
        VI: stdout. Chỉ các lệnh tmux cố định bên dưới mới tới được đây."""
        found = self.describe(user_id)
        if found is None:
            raise SandboxError(404, 'No sandbox for this user.')
        if found['state'] != 'running':
            raise SandboxError(409, 'The sandbox is not running.')
        name = container_name(user_id)
        spec = {'Cmd': list(command), 'User': 'node', 'WorkingDir': HOME, 'AttachStdout': True, 'AttachStderr': True}
        status, created = self.docker.request('POST', f'/containers/{name}/exec', spec)
        if status != 201:
            raise SandboxError(502, f'Could not run a command in the sandbox: {created}')
        status, raw = self.docker.request('POST', f"/exec/{created['Id']}/start", {'Detach': False, 'Tty': False})
        if status != 200:
            raise SandboxError(502, f'Could not run a command in the sandbox: {raw}')
        status, result = self.docker.request('GET', f"/exec/{created['Id']}/json")
        if status != 200:
            raise SandboxError(502, 'Could not read the command result.')
        return int(result.get('ExitCode') or 0), stdout_of(raw if isinstance(raw, bytes) else b'')

    def sessions(self, user_id: str) -> list[dict[str, Any]]:
        """The sandbox's tmux sessions with their last input (`activity`) and output
        (`output`) as epoch seconds; none when tmux has no server yet.
        VI: Các phiên tmux của sandbox cùng lần nhập (`activity`) và output (`output`) cuối,
        VI: tính bằng giây epoch; rỗng khi tmux chưa có server."""
        code, out = self._exec(
            user_id, 'tmux', 'list-sessions', '-F', '#{session_name}\t#{session_activity}\t#{window_activity}'
        )
        if code != 0:
            return []
        rows = [line.split('\t') for line in out.splitlines() if line.count('\t') == 2]
        return [{'name': name, 'activity': int(activity or 0), 'output': int(output or 0)} for name, activity, output in rows]

    def create_session(self, user_id: str, name: str, command: str = '') -> None:
        """Creates a detached tmux session in the home directory and types `command`
        into it followed by Enter. The command is sent as literal keys, never run by
        the manager. 409 when the session exists.
        VI: Tạo một phiên tmux chạy nền ở thư mục home và gõ `command` vào đó rồi Enter.
        VI: Lệnh được gửi như phím gõ, manager không bao giờ tự chạy nó. 409 khi phiên đã có."""
        if not SESSION_NAME.match(name) or len(command) > MAX_COMMAND:
            raise SandboxError(400, 'Invalid session.')
        if any(session['name'] == name for session in self.sessions(user_id)):
            raise SandboxError(409, 'The session exists.')
        if self._exec(user_id, 'tmux', 'new-session', '-d', '-s', name, '-c', HOME)[0] != 0:
            raise SandboxError(502, 'Could not create the session.')
        if command:
            self._exec(user_id, 'tmux', 'send-keys', '-t', f'={name}:', '-l', '--', command)
            self._exec(user_id, 'tmux', 'send-keys', '-t', f'={name}:', 'Enter')

    def close_session(self, user_id: str, name: str) -> None:
        if not SESSION_NAME.match(name):
            raise SandboxError(400, 'Invalid session.')
        if self._exec(user_id, 'tmux', 'kill-session', '-t', f'={name}')[0] != 0:
            raise SandboxError(404, 'No such session.')


def handle(manager: Manager, method: str, path: str, authorization: str, body: bytes = b'') -> tuple[int, Any]:
    """Routes one request. Authentication is checked first with a constant-time
    comparison. Routes: `GET /sandboxes`; `GET|PUT|DELETE /sandboxes/<userId>`;
    `POST /sandboxes/<userId>/stop`; `GET|POST /sandboxes/<userId>/sessions`;
    `DELETE /sandboxes/<userId>/sessions/<name>`.
    VI: Định tuyến một request. Xác thực được kiểm trước bằng phép so sánh thời gian
    VI: không đổi. Các route: `GET /sandboxes`; `GET|PUT|DELETE /sandboxes/<userId>`;
    VI: `POST /sandboxes/<userId>/stop`; `GET|POST /sandboxes/<userId>/sessions`;
    VI: `DELETE /sandboxes/<userId>/sessions/<tên>`."""
    if not secrets.compare_digest(authorization.encode(), f'Bearer {manager.config.token}'.encode()):
        return 401, {'error': 'Unauthorized'}
    parts = path.split('?', 1)[0].strip('/').split('/')
    if parts[0] != 'sandboxes' or len(parts) > 4:
        return 404, {'error': 'Not found'}
    if len(parts) > 1 and not USER_ID.match(parts[1]):
        return 400, {'error': 'Invalid user id'}
    route = (method, len(parts), parts[2] if len(parts) > 2 else None)
    try:
        if route == ('GET', 1, None):
            return 200, manager.running()
        user_id = parts[1] if len(parts) > 1 else ''
        if route == ('GET', 2, None):
            found = manager.describe(user_id)
            return (200, found) if found else (404, {'error': 'No sandbox for this user.'})
        if route == ('PUT', 2, None):
            return 200, manager.ensure(user_id)
        if route == ('DELETE', 2, None):
            manager.remove(user_id)
            return 204, None
        if route == ('POST', 3, 'stop'):
            return 200, manager.stop(user_id)
        if route == ('GET', 3, 'sessions'):
            return 200, manager.sessions(user_id)
        if route == ('POST', 3, 'sessions'):
            try:
                request = json.loads(body or b'{}')
            except ValueError:
                return 400, {'error': 'Invalid JSON'}
            if not isinstance(request, dict) or not isinstance(request.get('name'), str):
                return 400, {'error': 'Invalid session.'}
            command = request.get('command') or ''
            if not isinstance(command, str):
                return 400, {'error': 'Invalid session.'}
            manager.create_session(user_id, request['name'], command)
            return 201, {'name': request['name']}
        if route == ('DELETE', 4, 'sessions'):
            manager.close_session(user_id, parts[3])
            return 204, None
    except SandboxError as error:
        return error.status, {'error': error.message}
    return 405, {'error': 'Method not allowed'}


def serve(manager: Manager) -> None:
    class Handler(BaseHTTPRequestHandler):
        server_version = 'flowie-sandbox-manager'

        def _respond(self) -> None:
            length = min(int(self.headers.get('Content-Length') or 0), MAX_COMMAND * 2)
            request = self.rfile.read(length) if length > 0 else b''
            status, body = handle(manager, self.command, self.path, self.headers.get('Authorization', ''), request)
            payload = b'' if body is None else json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        do_GET = do_PUT = do_POST = do_DELETE = _respond

    server = ThreadingHTTPServer(('0.0.0.0', manager.config.port), Handler)
    print(f'sandbox-manager listening on :{manager.config.port}', file=sys.stderr, flush=True)
    server.serve_forever()


if __name__ == '__main__':
    settings = Config.from_env(dict(os.environ))
    serve(Manager(settings, Docker(settings.socket_path)))
