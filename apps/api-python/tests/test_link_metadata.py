import asyncio

import pytest

from app.core.errors import ApiError
from app.domains.link_metadata import page_title, public_url


def test_page_title_prefers_open_graph_and_unescapes():
    html = '<title>Fallback</title><meta property="og:title" content="ln-dev7/circle &amp; UI">'
    assert page_title(html) == 'ln-dev7/circle & UI'
    assert page_title('<title>\n  Flowie   Inbox </title>') == 'Flowie Inbox'
    assert page_title('<p>no title</p>') is None


@pytest.mark.parametrize(
    'url',
    [
        'http://127.0.0.1/admin',
        'http://10.0.0.5/',
        'http://169.254.169.254/latest/meta-data',
        'http://[::1]/',
        'file:///etc/passwd',
        'https://user:pass@example.com/',
    ],
)
def test_public_url_rejects_internal_and_non_http_targets(url):
    with pytest.raises(ApiError):
        asyncio.run(public_url(url))
