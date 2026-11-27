"""The signed-in user's personal coding sandbox (docs/sandbox.md).

`/api/v1/sandbox` starts, stops and reports the caller's own container through
sandbox-manager, and `/api/v1/sandbox/ui/...` is a reverse proxy (HTTP and the
terminal WebSocket) to the termi instance inside it. The container is always
the caller's: its name comes from the authenticated user id, never from the
request, so no URL, header or body can reach another person's sandbox. Only
emails listed in SANDBOX_USERS get anything but 403.

The proxy forwards a fixed set of headers and nothing that identifies the
person to Flowie: the session cookie and Authorization header stay here. It
adds the sandbox's termi token, which the browser never sees, and presents
itself to termi as `localhost`, the only host termi accepts.
VI: Sandbox lập trình cá nhân của người đang đăng nhập (docs/sandbox.md).
VI: `/api/v1/sandbox` khởi động, dừng và báo trạng thái container của chính người gọi
VI: qua sandbox-manager, còn `/api/v1/sandbox/ui/...` là reverse proxy (HTTP và
VI: WebSocket của terminal) tới termi bên trong. Container luôn là của người gọi: tên
VI: lấy từ id người dùng đã xác thực, không bao giờ từ request, nên không URL, header
VI: hay body nào tới được sandbox của người khác. Chỉ email trong SANDBOX_USERS nhận được
VI: thứ gì khác ngoài 403.
VI: Proxy chỉ chuyển một tập header cố định và không chuyển gì định danh người đó với
VI: Flowie: cookie phiên và header Authorization ở lại đây. Nó thêm token termi của
VI: sandbox, thứ trình duyệt không bao giờ thấy, và xưng là `localhost` với termi, host
VI: duy nhất termi chấp nhận.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any
from urllib.parse import urlsplit

import httpx
import websockets
from fastapi import APIRouter, Depends, Request, WebSocket
from fastapi.responses import RedirectResponse, StreamingResponse
from starlette.background import BackgroundTask
from websockets.asyncio.client import connect

from ...core.config import Settings
from ...core.errors import ApiError
from ...sandbox_manager import TERMI_PORT, USER_ID, container_name, termi_token
from ..identity.auth import current_user
from ..identity.security.sessions import active_identity, decode_access, expired

router = APIRouter(prefix='/api/v1/sandbox', tags=['sandbox'])

TERMI_HOST = f'localhost:{TERMI_PORT}'
REQUEST_HEADERS = ('accept', 'content-type', 'x-termi', 'range', 'if-none-match', 'last-event-id')
RESPONSE_HEADERS = (
    'content-type', 'cache-control', 'content-disposition', 'content-range', 'accept-ranges', 'etag',
    'x-termi-build', 'x-frame-options', 'content-security-policy', 'referrer-policy',
)
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


async def _manager(settings: Settings, method: str, path: str) -> tuple[int, Any]:
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.request(
                method,
                f'{settings.sandbox_manager_url}{path}',
                headers={'Authorization': f'Bearer {settings.sandbox_manager_token}'},
            )
    except httpx.HTTPError as error:
        raise ApiError(502, 'The sandbox service is unavailable.', 'Bad Gateway') from error
    body = response.json() if response.content else None
    if response.status_code >= 500 or response.status_code in (400, 401, 409):
        raise ApiError(502, 'The sandbox service refused the request.', 'Bad Gateway')
    return response.status_code, body


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


@router.get('/ui', include_in_schema=False)
async def sandbox_ui_root():
    # termi's client uses relative URLs, so the page must end with a slash.
    # VI: Client termi dùng URL tương đối nên trang phải kết thúc bằng dấu gạch chéo.
    return RedirectResponse('ui/', status_code=307)


def _upstream_headers(source: Any, settings: Settings, user_id: str) -> dict[str, str]:
    headers = {name: source[name] for name in REQUEST_HEADERS if name in source}
    headers['host'] = TERMI_HOST
    headers['x-termi-token'] = termi_token(settings.sandbox_manager_token, user_id)
    return headers


@router.api_route('/ui/{path:path}', methods=['GET', 'HEAD', 'POST', 'PUT', 'DELETE'], include_in_schema=False)
async def sandbox_ui(path: str, request: Request, user: Any = Depends(current_user)):
    """Streams one request to the caller's termi and its answer back, so
    long-lived event streams pass through without being buffered.
    VI: Chuyển một request tới termi của người gọi và truyền ngược câu trả lời theo luồng,
    VI: để các luồng sự kiện dài chạy qua mà không bị gom lại."""
    settings = _settings(request)
    user_id = _sandbox_user(settings, user)
    client = httpx.AsyncClient(timeout=httpx.Timeout(30, read=None))
    upstream = client.build_request(
        request.method,
        f'http://{container_name(user_id)}:{TERMI_PORT}/{path}',
        params=request.query_params,
        headers=_upstream_headers(request.headers, settings, user_id),
        content=await request.body(),
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
    """Proxies the terminal WebSocket (`term/ws`) to the caller's ttyd through
    termi. termi and ttyd check Host and Origin, so the upstream handshake says
    `localhost` for both while the TCP connection goes to the container.
    VI: Proxy WebSocket của terminal (`term/ws`) tới ttyd của người gọi qua termi. termi
    VI: và ttyd kiểm Host và Origin, nên handshake phía sau ghi `localhost` cho cả hai
    VI: trong khi kết nối TCP đi tới container."""
    settings = _settings(socket)
    try:
        if not path.startswith('term/') or not _own_origin(settings, socket.headers.get('origin')):
            raise ApiError(403, 'Forbidden', 'Forbidden')
        user_id = _sandbox_user(settings, await _socket_user(socket))
    except ApiError as error:
        await socket.close(code=4401 if error.status_code == 401 else 4403)
        return
    query = f'?{socket.url.query}' if socket.url.query else ''
    try:
        upstream = await connect(
            f'ws://{TERMI_HOST}/{path}{query}',
            host=container_name(user_id),
            port=TERMI_PORT,
            additional_headers={
                'X-Termi-Token': termi_token(settings.sandbox_manager_token, user_id),
                'Origin': f'http://{TERMI_HOST}',
            },
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
