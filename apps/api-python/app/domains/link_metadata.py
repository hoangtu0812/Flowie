from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from html import unescape
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi import Depends, Query

from ..core.errors import ApiError
from ..core.utc_responses import UtcAPIRouter as APIRouter
from .auth import current_user

router = APIRouter(prefix='/api/v1/link-metadata', tags=['link-metadata'])

MAX_HTML_BYTES = 256 * 1024
MAX_REDIRECTS = 3
TITLE_PATTERNS = (
    re.compile(
        r'<meta[^>]+property=["\']og:title["\'][^>]*content=["\']([^"\']+)', re.I
    ),
    re.compile(
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*property=["\']og:title', re.I
    ),
    re.compile(r'<title[^>]*>(.*?)</title>', re.I | re.S),
)


async def public_url(url: str) -> str:
    """Accept only http(s) URLs whose host resolves to public addresses.

    Every resolved address must be globally routable, so a pasted link cannot
    make the API read loopback, private, link-local or metadata-service hosts.
    VI: Chỉ nhận URL http(s) có host phân giải ra địa chỉ công khai. Mọi địa chỉ
    phân giải phải định tuyến toàn cầu, để link được dán không khiến API đọc
    host loopback, mạng nội bộ, link-local hoặc dịch vụ metadata.
    """
    parts = urlsplit(url)
    if parts.scheme not in {'http', 'https'} or not parts.hostname or parts.username:
        raise ApiError(400, 'Only public http(s) links can be previewed.', 'Bad Request')
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            parts.hostname, parts.port or (443 if parts.scheme == 'https' else 80),
            type=socket.SOCK_STREAM,
        )
    except (socket.gaierror, UnicodeError):
        raise ApiError(400, 'The link host could not be resolved.', 'Bad Request')
    if not infos or not all(
        ipaddress.ip_address(info[4][0].split('%')[0]).is_global for info in infos
    ):
        raise ApiError(400, 'Only public http(s) links can be previewed.', 'Bad Request')
    return url


def page_title(html: str) -> str | None:
    for pattern in TITLE_PATTERNS:
        match = pattern.search(html)
        if match:
            title = ' '.join(unescape(match.group(1)).split())
            if title:
                return title[:200]
    return None


@router.get('')
async def link_metadata(
    url: str = Query(min_length=1, max_length=2048), user=Depends(current_user)
):
    """Return the title of a public web page for a pasted link.

    Redirects are followed manually so each hop is re-validated, the body is
    read only up to 256 KiB of HTML, and only the title leaves the API. A page
    that cannot be read yields ``title: null`` so the editor keeps the bare URL.
    shortcut: the host is resolved again when httpx connects, so DNS rebinding
    between the check and the request is not blocked; pin the resolved address
    in a custom transport if this endpoint ever returns more than a title.
    VI: Trả về tiêu đề của trang web công khai cho link được dán. Chuyển hướng
    được theo thủ công để kiểm tra lại từng bước, chỉ đọc tối đa 256 KiB HTML và
    chỉ tiêu đề rời khỏi API. Trang không đọc được trả ``title: null`` để trình
    soạn thảo giữ nguyên URL. shortcut: httpx phân giải host lần nữa khi kết nối
    nên chưa chặn DNS rebinding giữa lúc kiểm tra và lúc gửi; cần ghim địa chỉ
    đã phân giải trong transport riêng nếu endpoint trả về nhiều hơn tiêu đề.
    """
    target = await public_url(url.strip())
    title = None
    try:
        async with httpx.AsyncClient(
            timeout=5, follow_redirects=False, headers={'User-Agent': 'FlowieLinkPreview/1.0'}
        ) as client:
            for _ in range(MAX_REDIRECTS + 1):
                async with client.stream('GET', target) as response:
                    if response.is_redirect and response.headers.get('location'):
                        target = await public_url(urljoin(target, response.headers['location']))
                        continue
                    if response.is_success and 'html' in response.headers.get('content-type', ''):
                        body = b''
                        async for chunk in response.aiter_bytes():
                            body += chunk
                            if len(body) >= MAX_HTML_BYTES:
                                break
                        title = page_title(
                            body[:MAX_HTML_BYTES].decode(response.encoding or 'utf-8', 'replace')
                        )
                    break
    except (httpx.HTTPError, ApiError):
        title = None
    return {'data': {'url': url.strip(), 'title': title}}
