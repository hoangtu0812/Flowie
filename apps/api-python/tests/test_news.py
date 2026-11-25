import asyncio
import json
import os
from datetime import datetime
from urllib.parse import urlsplit

import httpx
import pytest

from app.core.errors import ApiError
from app.modules.news.feeds import (
    NEWS_FEED_HOSTS,
    NEWS_PRESETS,
    feed_url,
    fetch_article,
    fetch_feed,
    news_card,
    news_cutoff_utc,
    parse_feed,
    plain_text,
)

NOW = datetime(2026, 10, 30, 0, 0)

RSS = b'''<?xml version="1.0"?>
<rss version="2.0"><channel><title>Feed</title>
<item><title>Old &amp; patched</title><link>https://example.com/old</link>
  <description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;/p&gt;</description>
  <pubDate>Tue, 27 Oct 2026 08:00:00 +0000</pubDate></item>
<item><title>New CVE</title><link>https://example.com/new</link><pubDate>Thu, 29 Oct 2026 08:00:00 +0700</pubDate></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
<item><title>Duplicate</title><link>https://example.com/new</link></item>
</channel></rss>'''

ATOM = b'''<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
<entry><title>Atom item</title><link rel="self" href="https://example.com/self"/>
<link href="https://example.com/atom"/><summary>Short</summary><updated>2026-10-28T01:02:03Z</updated></entry>
</feed>'''


def test_parse_rss_cleans_html_skips_bad_links_and_sorts_newest_first():
    items = parse_feed(RSS, NOW)
    assert [item['url'] for item in items] == ['https://example.com/new', 'https://example.com/old']
    assert items[0]['publishedAt'] == datetime(2026, 10, 29, 1, 0)
    assert items[1]['title'] == 'Old & patched'
    assert items[1]['summary'] == 'Hello world'
    assert items[0]['summary'] is None


def test_parse_atom_uses_alternate_link():
    [item] = parse_feed(ATOM, NOW)
    assert item['url'] == 'https://example.com/atom'
    assert item['summary'] == 'Short'
    assert item['publishedAt'] == datetime(2026, 10, 28, 1, 2, 3)


def test_parse_rejects_dtd_and_non_feeds():
    with pytest.raises(ValueError):
        parse_feed(b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "x">]><rss>&a;</rss>', NOW)
    with pytest.raises(ValueError):
        parse_feed(b'<html><body>not a feed</body></html>', NOW)


def test_parse_kev_json_links_each_cve_to_nvd():
    body = json.dumps(
        {
            'vulnerabilities': [
                {'cveID': 'CVE-2024-3400', 'vulnerabilityName': 'PAN-OS <b>Injection</b>',
                 'shortDescription': 'Exploited.', 'dateAdded': '2024-04-12'},
                {'cveID': 'CVE-2026-12345', 'vulnerabilityName': 'Newer', 'dateAdded': '2026-10-28'},
                {'cveID': 'javascript:alert(1)', 'vulnerabilityName': 'Bad id'},
                'not an entry',
            ]
        }
    ).encode()
    items = parse_feed(b'  ' + body, NOW)
    assert [item['url'] for item in items] == [
        'https://nvd.nist.gov/vuln/detail/CVE-2026-12345',
        'https://nvd.nist.gov/vuln/detail/CVE-2024-3400',
    ]
    assert items[1]['title'] == 'CVE-2024-3400: PAN-OS Injection'
    assert items[1]['summary'] == 'Exploited.'
    assert items[1]['publishedAt'] == datetime(2024, 4, 12)
    assert items[0]['summary'] is None
    with pytest.raises(ValueError):
        parse_feed(b'{"data": []}', NOW)


def test_every_preset_feed_is_allowlisted_and_every_host_is_used():
    urls = [url for feeds in NEWS_PRESETS.values() for _name, url in feeds]
    assert [feed_url(url) for url in urls] == urls
    assert len(set(urls)) == len(urls)
    # www.cisa.gov and the older security hosts stay allowed for sources added by hand.
    # VI: www.cisa.gov và các host bảo mật cũ vẫn được phép cho nguồn admin tự thêm.
    manual = {'www.cisa.gov', 'krebsonsecurity.com', 'www.darkreading.com'}
    assert NEWS_FEED_HOSTS - manual == {urlsplit(url).hostname for url in urls}


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_presets_reuse_groups_and_skip_known_feeds(monkeypatch):
    from sqlalchemy import text

    from app.core.identifiers import cuid
    from app.modules.news import api
    from tests.seeded_workspace import seeded_workspace

    async def allow(*_args):
        return None

    monkeypatch.setattr(api, 'require_manager', allow)
    total = sum(len(feeds) for feeds in NEWS_PRESETS.values())

    async def run():
        async with seeded_workspace() as (factory, workspace, _member):
            async with factory() as db:
                seed, owner = await workspace(db)
                ws = seed['workspace_id']
                security = cuid()
                await db.execute(
                    text('''INSERT INTO news_categories (id, workspace_id, name, created_at, updated_at)
                            VALUES (:id, :ws, 'Security', now(), now())'''),
                    {'id': security, 'ws': ws},
                )
                await db.execute(
                    text('''INSERT INTO news_sources (id, workspace_id, category_id, name, feed_url, created_at)
                            VALUES (:id, :ws, :cat, 'BC', 'https://www.bleepingcomputer.com/feed/', now())'''),
                    {'id': cuid(), 'ws': ws, 'cat': security},
                )
                await db.commit()
                first = await api.install_presets(workspaceId=ws, user=owner, db=db)
                second = await api.install_presets(workspaceId=ws, user=owner, db=db)
                groups = (
                    await db.execute(
                        text('''SELECT c.name, count(s.id) FROM news_categories c
                                LEFT JOIN news_sources s ON s.category_id = c.id
                                WHERE c.workspace_id = :ws GROUP BY c.id, c.name'''),
                        {'ws': ws},
                    )
                ).all()
        return first, second, dict(groups)

    first, second, groups = asyncio.run(run())
    assert first == {'data': {'added': total - 1}}
    assert second == {'data': {'added': 0}}
    assert groups == {name: len(feeds) for name, feeds in NEWS_PRESETS.items()}


def test_plain_text_truncates():
    assert plain_text('<i>a</i>   b' * 3, 6) == 'a b a…'


@pytest.mark.parametrize(
    'url',
    [
        'http://www.cisa.gov/feed.xml',
        'https://example.com/feed',
        'https://www.cisa.gov:8443/feed',
        'https://user@www.cisa.gov/feed',
        'https://www.cisa.gov.evil.com/feed',
    ],
)
def test_feed_url_requires_https_on_allowlisted_host(url):
    with pytest.raises(ApiError):
        feed_url(url)


def test_feed_url_accepts_allowlisted_host():
    assert feed_url(' https://www.bleepingcomputer.com/feed/ ') == 'https://www.bleepingcomputer.com/feed/'


def test_fetch_feed_rechecks_redirect_target():
    async def run():
        transport = httpx.MockTransport(
            lambda request: httpx.Response(302, headers={'location': 'http://169.254.169.254/latest'})
        )
        async with httpx.AsyncClient(transport=transport) as client:
            await fetch_feed('https://www.cisa.gov/feed', client)

    async def public(url):
        return url

    import app.modules.news.feeds as feeds

    original, feeds.public_url = feeds.public_url, public
    try:
        with pytest.raises(ApiError):
            asyncio.run(run())
    finally:
        feeds.public_url = original


def test_fetch_article_rechecks_redirects_and_reads_only_html(monkeypatch):
    import app.modules.news.feeds as feeds

    async def public(url):
        if '169.254' in url:
            raise ApiError(400, 'Only public http(s) links can be previewed.', 'Bad Request')
        return url

    def page(request):
        if request.url.path == '/moved':
            return httpx.Response(302, headers={'location': 'http://169.254.169.254/latest'})
        if request.url.path == '/pdf':
            return httpx.Response(200, headers={'content-type': 'application/pdf'}, content=b'%PDF')
        return httpx.Response(
            200, headers={'content-type': 'text/html; charset=utf-8'},
            content=b'<html><script>x()</script><h1>Title</h1><p>Body &amp; more</p></html>',
        )

    async def run(path):
        async with httpx.AsyncClient(transport=httpx.MockTransport(page)) as client:
            return await fetch_article(f'https://news.example{path}', client)

    monkeypatch.setattr(feeds, 'public_url', public)
    assert asyncio.run(run('/story')) == 'Title Body & more'
    with pytest.raises(ApiError):
        asyncio.run(run('/moved'))
    with pytest.raises(ValueError):
        asyncio.run(run('/pdf'))


def test_cutoff_is_latest_0630_vietnam_time():
    # 23:29 UTC = 06:29 +07 next day: still yesterday's window. 23:30 UTC = 06:30 +07.
    assert news_cutoff_utc(datetime(2026, 10, 29, 23, 29)) == datetime(2026, 10, 28, 23, 30)
    assert news_cutoff_utc(datetime(2026, 10, 29, 23, 30)) == datetime(2026, 10, 29, 23, 30)


def test_news_card_caps_items_and_escapes_markdown():
    items = [{'title': f'[{n}] x', 'url': f'https://e.com/a(b){n}'} for n in range(12)]
    card = news_card('Security', items, 'https://flowie/w/news')['attachments'][0]['content']
    text = card['body'][1]['text']
    assert text.count('\n- ') == 9 and text.endswith('+2 more')
    assert '- [(0) x](https://e.com/a%28b%290)' in text
    assert card['actions'][0]['url'] == 'https://flowie/w/news'


class _Rows:
    def __init__(self, row):
        self.row = row

    def first(self):
        return self.row


class _Db:
    def __init__(self, row):
        self.row, self.params = row, None

    async def execute(self, _statement, params):
        self.params = params
        return _Rows(self.row)


@pytest.mark.parametrize(('row', 'status'), [(None, 404), (('',), 400), ((None,), 400)])
def test_webhook_test_requires_a_stored_webhook(monkeypatch, row, status):
    from app.modules.news import api

    async def allow(*_args):
        return None

    monkeypatch.setattr(api, 'require_manager', allow)
    with pytest.raises(ApiError) as error:
        asyncio.run(api.test_category_webhook('cat', workspaceId='ws', user={'id': 'u'}, db=_Db(row)))
    assert error.value.status_code == status


def test_webhook_test_posts_only_to_the_stored_url(monkeypatch):
    from app.modules.news import api

    sent = []

    async def allow(*_args):
        return None

    async def send(url):
        sent.append(url)
        return {'delivered': True}

    monkeypatch.setattr(api, 'require_manager', allow)
    monkeypatch.setattr(api, 'send_teams_test', send)
    db = _Db(('https://x.logic.azure.com/workflows/a',))
    result = asyncio.run(api.test_category_webhook('cat', workspaceId='ws', user={'id': 'u'}, db=db))
    assert result == {'data': {'delivered': True}}
    assert sent == ['https://x.logic.azure.com/workflows/a']
    assert db.params == {'id': 'cat', 'workspace_id': 'ws'}
