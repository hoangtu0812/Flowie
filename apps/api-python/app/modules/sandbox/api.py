"""The signed-in user's personal coding sandbox (docs/sandbox.md).

`/api/v1/sandbox` starts, stops and reports the caller's own container and its
tmux sessions through sandbox-manager, and `/api/v1/sandbox/ui/...` is a
reverse proxy (HTTP and the terminal WebSocket) to the ttyd inside it. The
container is always the caller's: its name comes from the authenticated user
id, never from the request, so no URL, header or body can reach another
person's sandbox. Only emails listed in SANDBOX_USERS get anything but 403.

The proxy forwards a fixed set of headers and nothing that identifies the
person to Flowie: the session cookie and Authorization header stay here. ttyd
answers only under the sandbox's secret base path, which the proxy adds and
the browser never sees.
VI: Sandbox lập trình cá nhân của người đang đăng nhập (docs/sandbox.md).
VI: `/api/v1/sandbox` khởi động, dừng và báo trạng thái container của chính người gọi
VI: cùng các phiên tmux của nó qua sandbox-manager, còn `/api/v1/sandbox/ui/...` là
VI: reverse proxy (HTTP và WebSocket của terminal) tới ttyd bên trong. Container luôn là
VI: của người gọi: tên lấy từ id người dùng đã xác thực, không bao giờ từ request, nên
VI: không URL, header hay body nào tới được sandbox của người khác. Chỉ email trong
VI: SANDBOX_USERS nhận được thứ gì khác ngoài 403.
VI: Proxy chỉ chuyển một tập header cố định và không chuyển gì định danh người đó với
VI: Flowie: cookie phiên và header Authorization ở lại đây. ttyd chỉ trả lời dưới đường
VI: dẫn gốc bí mật của sandbox, do proxy thêm vào và trình duyệt không bao giờ thấy.
"""

from __future__ import annotations

import asyncio
import contextlib
import re
import shlex
from typing import Any, Literal
from urllib.parse import quote, unquote, urlsplit

import httpx
import websockets
from fastapi import APIRouter, Depends, Query, Request, WebSocket
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import Field
from starlette.background import BackgroundTask
from websockets.asyncio.client import connect

from ...core.config import Settings
from ...core.errors import ApiError
from ...db.session import get_session
from ...sandbox_manager import (
    AGENT_PORT,
    SESSION_NAME,
    TERMINAL_PORT,
    USER_ID,
    container_name,
    terminal_token,
)
from ..access.membership import workspace_role
from ..agent_runs.queries import list_repositories_select_project_repositories_sql
from ..identity.auth import current_user
from ..identity.security.sessions import active_identity, decode_access, expired
from ..mcp.contracts import StrictInput
from ..mcp.domain import Principal
from ..mcp.policy import AccessPolicy
from .queries import ISSUE_WORKSPACE_SELECT_ISSUES

router = APIRouter(prefix='/api/v1/sandbox', tags=['sandbox'])

REQUEST_HEADERS = ('accept', 'range', 'if-none-match', 'if-modified-since')
RESPONSE_HEADERS = ('content-type', 'cache-control', 'content-range', 'accept-ranges', 'etag', 'last-modified')
SOCKET_RECHECK_SECONDS = 60


def _settings(request: Request | WebSocket) -> Settings:
    return request.app.state.settings


def _sandbox_user(settings: Settings, user: dict[str, Any]) -> str:
    """Returns the caller's id when sandboxes are enabled for their email.
    VI: Trả id của người gọi khi email của họ được bật sandbox."""
    if str(user.get('email', '')).lower() not in settings.sandbox_users:
        raise ApiError(403, 'Sandbox is not enabled for this account.', 'Forbidden')
    user_id = str(user['id'])
    if not USER_ID.match(user_id):
        raise ApiError(403, 'Sandbox is not available for this account.', 'Forbidden')
    return user_id


async def _manager(
    settings: Settings, method: str, path: str, body: Any = None, accept: tuple[int, ...] = ()
) -> tuple[int, Any]:
    """One sandbox-manager call. A refusal becomes 502 unless its status is in `accept`.
    VI: Một lời gọi sandbox-manager. Lời từ chối thành 502 trừ khi mã nằm trong `accept`."""
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.request(
                method,
                f'{settings.sandbox_manager_url}{path}',
                headers={'Authorization': f'Bearer {settings.sandbox_manager_token}'},
                json=body,
            )
    except httpx.HTTPError as error:
        raise ApiError(502, 'The sandbox service is unavailable.', 'Bad Gateway') from error
    answer = response.json() if response.content else None
    refused = response.status_code >= 500 or response.status_code in (400, 401, 409)
    if refused and response.status_code not in accept:
        raise ApiError(502, 'The sandbox service refused the request.', 'Bad Gateway')
    return response.status_code, answer


def _state(status: int, body: Any) -> dict[str, Any]:
    return {'data': {'state': body['state'] if status == 200 else 'none'}}


@router.get('')
async def sandbox_status(request: Request, user: Any = Depends(current_user)):
    user_id = _sandbox_user(_settings(request), user)
    return _state(*await _manager(_settings(request), 'GET', f'/sandboxes/{user_id}'))


@router.put('')
async def start_sandbox(request: Request, user: Any = Depends(current_user)):
    user_id = _sandbox_user(_settings(request), user)
    return _state(*await _manager(_settings(request), 'PUT', f'/sandboxes/{user_id}'))


@router.post('/stop')
async def stop_sandbox(request: Request, user: Any = Depends(current_user)):
    user_id = _sandbox_user(_settings(request), user)
    return _state(*await _manager(_settings(request), 'POST', f'/sandboxes/{user_id}/stop'))


AGENT_READY_ATTEMPTS = 20


async def _agent(
    settings: Settings, user_id: str, method: str, path: str, body: Any = None,
    params: dict[str, str] | None = None, accept: tuple[int, ...] = (), wait: bool = False,
    content: bytes | None = None, headers: dict[str, str] | None = None,
) -> tuple[int, Any]:
    """One call to the Flowie agent inside the caller's sandbox, under its secret base path.
    A stopped sandbox is 409; `wait` retries while one that has just started brings it up.
    VI: Một lời gọi tới agent Flowie trong sandbox của người gọi, dưới đường dẫn gốc bí mật.
    VI: Sandbox đang dừng là 409; `wait` thử lại trong lúc sandbox vừa khởi động bật agent lên."""
    token = terminal_token(settings.sandbox_manager_token, user_id)
    url = f'http://{container_name(user_id)}:{AGENT_PORT}/{token}/{path}'
    failure: Exception | None = None
    async with httpx.AsyncClient(timeout=30) as client:
        for _ in range(AGENT_READY_ATTEMPTS if wait else 1):
            try:
                response = await client.request(
                    method, url, json=body, params=params, content=content, headers=headers
                )
                break
            except httpx.TransportError as error:
                failure = error
                if wait:
                    await asyncio.sleep(1)
        else:
            raise ApiError(409, 'The sandbox is not running.', 'Conflict') from failure
    answer = response.json() if response.content else None
    if response.status_code >= 400 and response.status_code not in accept:
        message = answer.get('error') if isinstance(answer, dict) else None
        if response.status_code in (400, 404, 409) and message:
            raise ApiError(response.status_code, message, 'Bad Request')
        raise ApiError(502, 'The sandbox refused the request.', 'Bad Gateway')
    return response.status_code, answer


SESSION_FIELDS = ('name', 'dir', 'agent', 'state', 'preview')


@router.get('/sessions')
async def sandbox_sessions(request: Request, user: Any = Depends(current_user)):
    """The caller's tmux sessions, most recently used first, with the agent running in each and
    its state (`working`, `waiting`, `idle`, or `shell` without an agent); none while stopped.
    VI: Các phiên tmux của người gọi, dùng gần nhất trước, kèm agent đang chạy trong từng phiên và
    VI: trạng thái (`working`, `waiting`, `idle`, hoặc `shell` khi không có agent); rỗng khi đang dừng."""
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    try:
        _, sessions = await _agent(settings, user_id, 'GET', 'sessions')
    except ApiError as error:
        if error.status_code != 409:
            raise
        sessions = []
    return {'data': [{key: session.get(key) for key in SESSION_FIELDS} for session in sessions or []]}


class SessionInput(StrictInput):
    name: str = Field(pattern=SESSION_NAME.pattern)
    dir: str = Field(default='', max_length=4096)
    agent: Literal['claude', 'codex'] | None = None
    resume: str | None = Field(default=None, pattern=r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')


class RenameInput(StrictInput):
    to: str = Field(pattern=SESSION_NAME.pattern)


@router.post('/sessions', status_code=201)
async def create_sandbox_session(payload: SessionInput, request: Request, user: Any = Depends(current_user)):
    """A new tmux session in a folder of the home, running Claude Code or Codex (optionally
    resuming one of their conversations) or a plain shell.
    VI: Phiên tmux mới trong một thư mục thuộc home, chạy Claude Code hay Codex (có thể mở lại
    VI: một hội thoại cũ của chúng) hoặc shell thường."""
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    _, created = await _agent(settings, user_id, 'POST', 'sessions', payload.model_dump(exclude_none=True))
    return {'data': created}


@router.post('/sessions/{name}/rename')
async def rename_sandbox_session(name: str, payload: RenameInput, request: Request, user: Any = Depends(current_user)):
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    if not SESSION_NAME.match(name):
        raise ApiError(400, 'Invalid session name.', 'Bad Request')
    _, renamed = await _agent(settings, user_id, 'POST', f'sessions/{name}/rename', {'to': payload.to})
    return {'data': renamed}


@router.delete('/sessions/{name}', status_code=204)
async def close_sandbox_session(name: str, request: Request, user: Any = Depends(current_user)):
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    if not SESSION_NAME.match(name):
        raise ApiError(400, 'Invalid session name.', 'Bad Request')
    await _agent(settings, user_id, 'DELETE', f'sessions/{name}')


class SendInput(StrictInput):
    text: str = Field(default='', max_length=20_000)
    key: Literal[
        'Escape', 'C-c', 'C-d', 'Tab', 'BTab', 'Up', 'Down', 'Left', 'Right', 'Enter', 'PageUp', 'PageDown',
        '1', '2', '3', '4', '5', '6', '7', '8', '9',
    ] | None = None
    enter: bool = False


@router.post('/sessions/{name}/send')
async def send_to_sandbox_session(name: str, payload: SendInput, request: Request, user: Any = Depends(current_user)):
    """Types into a session: a key, then text as one bracketed paste, then Enter if asked.
    VI: Gõ vào một phiên: một phím, rồi chữ dạng một lần bracketed paste, rồi Enter nếu cần."""
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    if not SESSION_NAME.match(name):
        raise ApiError(400, 'Invalid session name.', 'Bad Request')
    await _agent(settings, user_id, 'POST', f'sessions/{name}/send', payload.model_dump(exclude_none=True))
    return {'data': {'ok': True}}


@router.get('/sessions/{name}/text')
async def sandbox_session_text(name: str, request: Request, user: Any = Depends(current_user)):
    """The session's screen with its last 2 000 lines of history, as plain text.
    VI: Màn hình của phiên kèm 2 000 dòng lịch sử cuối, dạng chữ thường."""
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    if not SESSION_NAME.match(name):
        raise ApiError(400, 'Invalid session name.', 'Bad Request')
    _, text = await _agent(settings, user_id, 'GET', f'sessions/{name}/text')
    return {'data': text}


MAX_UPLOAD_BYTES = 25 * 1024 * 1024


@router.post('/uploads', status_code=201)
async def upload_to_sandbox(request: Request, user: Any = Depends(current_user)):
    """Stores one attached file (raw body, name in `X-Filename`) in the sandbox's
    ~/.flowie/uploads and returns its path for the message.
    VI: Lưu một file đính kèm (thân thô, tên trong `X-Filename`) vào ~/.flowie/uploads của
    VI: sandbox và trả đường dẫn để ghi vào tin nhắn."""
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    if int(request.headers.get('content-length') or 0) > MAX_UPLOAD_BYTES:
        raise ApiError(413, 'The file is larger than 25 MB.', 'Payload Too Large')
    data = await request.body()
    if len(data) > MAX_UPLOAD_BYTES:
        raise ApiError(413, 'The file is larger than 25 MB.', 'Payload Too Large')
    # Browsers send the name URL-encoded; re-encoding keeps any other header value ASCII.
    # VI: Trình duyệt gửi tên đã URL-encode; mã hoá lại để header luôn là ASCII.
    filename = quote(unquote(request.headers.get('x-filename', 'file'))[:200], safe='')
    _, saved = await _agent(settings, user_id, 'POST', 'uploads', content=data, headers={'x-filename': filename})
    return {'data': saved}


@router.get('/dirs')
async def sandbox_dirs(request: Request, user: Any = Depends(current_user)):
    """Folders to start a session in: the home, open sessions' folders, issue worktrees and clones.
    VI: Thư mục để mở phiên: home, thư mục của phiên đang mở, worktree của task và bản clone."""
    settings = _settings(request)
    _, dirs = await _agent(settings, _sandbox_user(settings, user), 'GET', 'dirs')
    return {'data': dirs}


@router.get('/conversations')
async def sandbox_conversations(
    request: Request, dir: str = Query(default='', max_length=4096), user: Any = Depends(current_user)
):
    """Past Claude Code and Codex conversations in the sandbox, newest first, optionally of one folder.
    VI: Các hội thoại Claude Code và Codex cũ trong sandbox, mới nhất trước, có thể lọc theo thư mục."""
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    _, found = await _agent(settings, user_id, 'GET', 'conversations', params={'dir': dir} if dir else None)
    return {'data': found}


PROMPT_DESCRIPTION_CHARS = 4000


class OpenInput(StrictInput):
    issueId: str = Field(min_length=1, max_length=100)
    repositoryId: str = Field(min_length=1, max_length=100)
    agent: Literal['claude', 'codex']


async def _readable_issue(db: Any, user: dict[str, Any], issue_id: str) -> tuple[AccessPolicy, dict[str, Any]]:
    """The issue, if the caller may read it, with the policy that decided so.
    VI: Task, nếu người gọi đọc được, cùng policy đã quyết định điều đó."""
    workspace = await db.scalar(ISSUE_WORKSPACE_SELECT_ISSUES, {'id': issue_id})
    if workspace is None:
        raise ApiError(404, 'Issue not found.', 'Not Found')
    await workspace_role(db, workspace, user['id'])
    policy = AccessPolicy(db, Principal('', workspace, user, frozenset(), (), ()))
    return policy, await policy.issue(issue_id)


async def _repositories(db: Any, policy: AccessPolicy, issue: dict[str, Any]) -> list[dict[str, Any]]:
    if not issue.get('project_id'):
        return []
    rows = await db.execute(
        list_repositories_select_project_repositories_sql(policy), {**policy.params, 'project': issue['project_id']}
    )
    return [dict(row) for row in rows.mappings()]


@router.get('/repositories')
async def sandbox_repositories(
    request: Request, issueId: str = Query(min_length=1), user: Any = Depends(current_user), db: Any = Depends(get_session)
):
    """The repositories of the issue's project that "Open with Claude/Codex" can use.
    VI: Các repository của dự án chứa task mà "Mở bằng Claude/Codex" dùng được."""
    _sandbox_user(_settings(request), user)
    policy, issue = await _readable_issue(db, user, issueId)
    return {'data': [{'id': r['id'], 'name': r['name']} for r in await _repositories(db, policy, issue)]}


def _slug(name: str) -> str:
    return re.sub(r'[^A-Za-z0-9_-]+', '-', name).strip('-') or 'repo'


def open_command(issue: dict[str, Any], repository: dict[str, Any], agent: str, session: str) -> str:
    """One shell line for the sandbox terminal: clone the repository once into ~/repos, give the
    issue its own worktree and branch `flowie/<session>` in ~/work (reused when it already exists),
    then start the agent there with the issue as its first prompt. Every value is shell-quoted.
    VI: Một dòng shell cho terminal sandbox: clone repository một lần vào ~/repos, tạo cho task
    VI: worktree và nhánh `flowie/<session>` riêng trong ~/work (dùng lại nếu đã có), rồi chạy agent
    VI: ở đó với task làm prompt đầu tiên. Mọi giá trị đều được quote cho shell."""
    repo = f"$HOME/repos/{_slug(repository['name'])}"
    work = f'$HOME/work/{session}'
    branch = shlex.quote(f'flowie/{session}')
    base = shlex.quote(f"origin/{repository['baseBranch']}")
    description = (issue.get('description') or '').strip()[:PROMPT_DESCRIPTION_CHARS]
    prompt = '\n\n'.join(
        part
        for part in (
            f"Flowie task {issue['identifier']}: {issue['title']}",
            description,
            f"Repository {repository['name']}; you are on branch flowie/{session}, "
            f"created from {repository['baseBranch']}.",
            repository.get('instructions') or '',
        )
        if part
    )
    return (
        f'mkdir -p "$HOME/repos" "$HOME/work" '
        f'&& {{ [ -d "{repo}/.git" ] || git clone {shlex.quote(repository["repositoryUrl"])} "{repo}"; }} '
        f'&& git -C "{repo}" fetch origin '
        f'&& {{ [ -d "{work}" ] || git -C "{repo}" worktree add "{work}" {branch} 2>/dev/null '
        f'|| git -C "{repo}" worktree add -b {branch} "{work}" {base}; }} '
        f'&& cd "{work}" && {agent} {shlex.quote(prompt)}'
    )


@router.post('/open')
async def open_in_sandbox(
    payload: OpenInput, request: Request, user: Any = Depends(current_user), db: Any = Depends(get_session)
):
    """Starts the caller's sandbox and opens a terminal session for the issue with Claude Code or
    Codex working in the chosen repository of its project. A session that already exists for the
    issue is returned as it is, so opening twice resumes instead of starting over.
    VI: Khởi động sandbox của người gọi và mở một phiên terminal cho task, với Claude Code hoặc
    VI: Codex làm việc trong repository đã chọn của dự án. Phiên đã có cho task được trả lại như
    VI: cũ, nên mở lần hai là quay lại chứ không bắt đầu lại."""
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    policy, issue = await _readable_issue(db, user, payload.issueId)
    repository = next((r for r in await _repositories(db, policy, issue) if r['id'] == payload.repositoryId), None)
    if repository is None:
        raise ApiError(404, 'Repository not found for this issue.', 'Not Found')
    session = f"{issue['identifier']}-{_slug(repository['name'])}"[:40].rstrip('-')
    await _manager(settings, 'PUT', f'/sandboxes/{user_id}')
    command = open_command(issue, repository, payload.agent, session)
    # 409: the issue's session exists already, so opening again goes back to it untouched.
    # VI: 409: phiên của task đã có, nên mở lại là quay về nó, không gõ gì thêm.
    await _agent(
        settings, user_id, 'POST', 'sessions', {'name': session, 'command': command}, accept=(409,), wait=True
    )
    return {'data': {'session': session}}


@router.get('/ui', include_in_schema=False)
async def sandbox_ui_root():
    # ttyd's page builds its token and WebSocket URLs from its own path, which must end with a slash.
    # VI: Trang ttyd dựng URL token và WebSocket từ đường dẫn của chính nó, phải kết thúc bằng gạch chéo.
    return RedirectResponse('ui/', status_code=307)


def _terminal_url(scheme: str, settings: Settings, user_id: str, path: str) -> str:
    """The caller's ttyd under its secret base path.
    VI: ttyd của người gọi dưới đường dẫn gốc bí mật của nó."""
    token = terminal_token(settings.sandbox_manager_token, user_id)
    return f'{scheme}://{container_name(user_id)}:{TERMINAL_PORT}/{token}/{path}'


@router.api_route('/ui/{path:path}', methods=['GET', 'HEAD'], include_in_schema=False)
async def sandbox_ui(path: str, request: Request, user: Any = Depends(current_user)):
    """Streams ttyd's page and its assets from the caller's sandbox.
    VI: Truyền trang ttyd và tài nguyên của nó từ sandbox của người gọi."""
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    # `..` would climb out of the secret base path once the URL is normalised.
    # VI: `..` sẽ leo ra khỏi đường dẫn gốc bí mật khi URL được chuẩn hoá.
    if any(part in ('.', '..') for part in path.split('/')):
        raise ApiError(404, 'Not found.', 'Not Found')
    client = httpx.AsyncClient(timeout=httpx.Timeout(30, read=None))
    upstream = client.build_request(
        request.method,
        _terminal_url('http', settings, user_id, path),
        params=request.query_params,
        headers={name: request.headers[name] for name in REQUEST_HEADERS if name in request.headers},
    )
    try:
        response = await client.send(upstream, stream=True)
    except httpx.HTTPError as error:
        await client.aclose()
        raise ApiError(502, 'The sandbox is not running.', 'Bad Gateway') from error

    async def close() -> None:
        await response.aclose()
        await client.aclose()

    # Decoded bytes, because content-encoding is not among the forwarded headers.
    # VI: Byte đã giải nén, vì content-encoding không nằm trong các header được chuyển.
    return StreamingResponse(
        response.aiter_bytes(),
        status_code=response.status_code,
        headers={name: response.headers[name] for name in RESPONSE_HEADERS if name in response.headers},
        background=BackgroundTask(close),
    )


def _own_origin(settings: Settings, origin: str | None) -> bool:
    """A browser WebSocket always sends Origin; only Flowie's own pages may open
    a terminal, which blocks another site from driving it with the cookie.
    VI: WebSocket của trình duyệt luôn gửi Origin; chỉ trang của chính Flowie được mở
    VI: terminal, để trang khác không điều khiển được nó bằng cookie."""
    if not origin:
        return False
    app = urlsplit(settings.app_url)
    return origin in settings.cors_origins or origin == f'{app.scheme}://{app.netloc}'


async def _socket_user(socket: WebSocket, *, opening: bool = True) -> dict[str, Any]:
    """The socket keeps its handshake cookie, so later checks skip the token's
    15-minute expiry and ask only whether the session and account are still active.
    VI: Socket giữ cookie lúc handshake, nên các lần kiểm sau bỏ qua hạn 15 phút của token
    VI: và chỉ hỏi phiên và tài khoản còn hoạt động không."""
    token = socket.cookies.get('flowie_access')
    if not token:
        raise expired()
    claims = decode_access(token, _settings(socket), verify_exp=opening)
    async with socket.app.state.session_factory() as db:
        user = await active_identity(db, claims)
    if user is None:
        raise expired()
    return user


async def _pump(socket: WebSocket, upstream: Any) -> None:
    async def to_upstream() -> None:
        while True:
            message = await socket.receive()
            if message['type'] == 'websocket.disconnect':
                return
            await upstream.send(message['bytes'] if message.get('bytes') is not None else message.get('text', ''))

    async def to_browser() -> None:
        async for message in upstream:
            if isinstance(message, bytes):
                await socket.send_bytes(message)
            else:
                await socket.send_text(message)

    async def recheck() -> None:
        # A signed-out or disabled user loses an open terminal within a minute.
        # VI: Người đã đăng xuất hoặc bị khoá mất terminal đang mở trong vòng một phút.
        while True:
            await asyncio.sleep(SOCKET_RECHECK_SECONDS)
            _sandbox_user(_settings(socket), await _socket_user(socket, opening=False))

    tasks = [asyncio.create_task(job()) for job in (to_upstream, to_browser, recheck)]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


@router.websocket('/ui/{path:path}')
async def sandbox_socket(socket: WebSocket, path: str) -> None:
    """Proxies the terminal WebSocket (`ws`, with ttyd's `?arg=<session>`) to the caller's ttyd.
    VI: Proxy WebSocket của terminal (`ws`, kèm `?arg=<phiên>` của ttyd) tới ttyd của người gọi."""
    settings = _settings(socket)
    try:
        if path != 'ws' or not _own_origin(settings, socket.headers.get('origin')):
            raise ApiError(403, 'Forbidden', 'Forbidden')
        user_id = _sandbox_user(settings, await _socket_user(socket))
    except ApiError as error:
        await socket.close(code=4401 if error.status_code == 401 else 4403)
        return
    query = f'?{socket.url.query}' if socket.url.query else ''
    try:
        upstream = await connect(
            _terminal_url('ws', settings, user_id, path) + query,
            subprotocols=[websockets.Subprotocol(name) for name in socket.scope.get('subprotocols', [])],
            open_timeout=10,
            max_size=None,
        )
    except (OSError, TimeoutError, websockets.InvalidHandshake):
        await socket.close(code=1011)
        return
    async with upstream:
        await socket.accept(subprotocol=upstream.subprotocol)
        await _pump(socket, upstream)
    with contextlib.suppress(RuntimeError):
        await socket.close()
