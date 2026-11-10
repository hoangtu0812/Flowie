"""Public-URL checks and page-title parsing shared by link previews and news feeds.

VI: Kiểm tra URL công khai và đọc tiêu đề trang, dùng chung cho xem trước link và news feed.
"""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from html import unescape
from urllib.parse import urlsplit

from ...core.errors import ApiError

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
    except (socket.gaierror, UnicodeError) as error:
        raise ApiError(400, 'The link host could not be resolved.', 'Bad Request') from error
    if not infos or not all(
        ipaddress.ip_address(str(info[4][0]).split('%')[0]).is_global for info in infos
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
