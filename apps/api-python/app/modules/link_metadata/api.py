from __future__ import annotations

from urllib.parse import urljoin

import httpx
from fastapi import Depends, Query

from ...core.errors import ApiError
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ..identity.auth import current_user
from .service import page_title, public_url

router = APIRouter(prefix='/api/v1/link-metadata', tags=['link-metadata'])

MAX_HTML_BYTES = 256 * 1024
MAX_REDIRECTS = 3


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
