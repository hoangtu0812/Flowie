from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlsplit
from zoneinfo import ZoneInfo

import httpx

from ...core.errors import ApiError
from ...services.microsoft_teams import teams_message
from ..link_metadata.service import public_url

# Feed hosts Flowie may read. The list is fixed in code so that adding a host goes through review:
# an admin-supplied URL can never make the server request an arbitrary or internal address.
# VI: Các host feed Flowie được đọc. Danh sách cố định trong code để thêm host phải qua review:
# VI: URL do admin nhập không thể khiến server gọi tới địa chỉ tùy ý hoặc nội bộ.
NEWS_FEED_HOSTS = frozenset(
    {
        'www.cisa.gov',
        'raw.githubusercontent.com',
        'feeds.feedburner.com',
        'www.bleepingcomputer.com',
        'krebsonsecurity.com',
        'www.securityweek.com',
        'www.darkreading.com',
        'vnexpress.net',
        'cafef.vn',
        'oilprice.com',
        'www.cnbc.com',
        'news.google.com',
        'openai.com',
        'blog.google',
        'huggingface.co',
        'techcrunch.com',
        'www.theverge.com',
        'rss.arxiv.org',
    }
)

# Suggested groups and feeds, all checked from the production server (192.168.90.53). cisa.gov and
# BleepingComputer answer 403 there, so CISA's data comes from its GitHub mirror and BleepingComputer
# is left out.
# VI: Nhóm và feed gợi ý, đều đã kiểm tra gọi được từ server production (192.168.90.53). cisa.gov và
# VI: BleepingComputer trả 403 ở đó, nên dữ liệu CISA lấy từ bản mirror GitHub và bỏ BleepingComputer.
NEWS_PRESETS: dict[str, list[tuple[str, str]]] = {
    'Security': [
        ('CISA KEV', 'https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json'),
        ('The Hacker News', 'https://feeds.feedburner.com/TheHackersNews'),
        ('SecurityWeek', 'https://www.securityweek.com/feed/'),
    ],
    'Thị trường': [
        ('VnExpress Kinh doanh', 'https://vnexpress.net/rss/kinh-doanh.rss'),
        ('CafeF Chứng khoán', 'https://cafef.vn/thi-truong-chung-khoan.rss'),
        ('OilPrice', 'https://oilprice.com/rss/main'),
        ('CNBC Markets', 'https://www.cnbc.com/id/20910258/device/rss/rss.html'),
        ('Google News: giá dầu', 'https://news.google.com/rss/search?q=gi%C3%A1+d%E1%BA%A7u&hl=vi&gl=VN&ceid=VN:vi'),
    ],
    'AI': [
        ('OpenAI', 'https://openai.com/news/rss.xml'),
        ('Google AI', 'https://blog.google/innovation-and-ai/technology/ai/rss/'),
        ('Hugging Face', 'https://huggingface.co/blog/feed.xml'),
        ('TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/'),
        ('The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'),
        ('arXiv cs.AI', 'https://rss.arxiv.org/rss/cs.AI'),
    ],
    'Công nghệ': [
        ('VnExpress Khoa học công nghệ', 'https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss'),
        ('TechCrunch', 'https://techcrunch.com/feed/'),
        ('The Verge', 'https://www.theverge.com/rss/index.xml'),
    ],
}
_CVE = re.compile(r'CVE-\d{4}-\d{4,}')
MAX_FEED_BYTES = 4 * 1024 * 1024
MAX_REDIRECTS = 3
MAX_ARTICLE_BYTES = 1024 * 1024
ARTICLE_CHARS = 12_000
ITEMS_PER_FEED = 30
CARD_ITEMS = 10
HCM = ZoneInfo('Asia/Ho_Chi_Minh')
RUN_HOUR, RUN_MINUTE = 6, 30
_ROOT_START = re.compile(rb'<[A-Za-z]')
_DTD = re.compile(rb'<!(DOCTYPE|ENTITY)', re.I)


def feed_url(value: str) -> str:
    """Return the trimmed feed URL when it is HTTPS on an allowlisted host, else raise 400.

    Credentials and non-default ports are refused so the allowlist cannot be sidestepped with
    ``https://www.cisa.gov:8443`` or ``https://user@host``.
    VI: Trả URL feed đã cắt khoảng trắng nếu là HTTPS trên host được cho phép, ngược lại báo 400.
    VI: Từ chối thông tin đăng nhập và cổng khác mặc định để không vượt allowlist bằng
    VI: ``https://www.cisa.gov:8443`` hay ``https://user@host``.
    """
    value = value.strip()
    parts = urlsplit(value)
    try:
        port = parts.port
    except ValueError:
        port = -1
    if (
        parts.scheme != 'https'
        or (parts.hostname or '').lower() not in NEWS_FEED_HOSTS
        or parts.username
        or parts.password
        or port not in (None, 443)
    ):
        raise ApiError(
            400,
            'Feeds must be HTTPS URLs on an allowed news host: ' + ', '.join(sorted(NEWS_FEED_HOSTS)) + '.',
            'Bad Request',
        )
    return value


class _TextOnly(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in ('script', 'style'):
            self.hidden += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ('script', 'style') and self.hidden:
            self.hidden -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden:
            self.parts.append(data)


def plain_text(value: str | None, limit: int) -> str:
    """Strip every HTML tag (dropping script/style bodies), decode entities, collapse whitespace
    and cut to ``limit`` characters, so feed markup is stored and shown only as plain text.
    VI: Bỏ mọi thẻ HTML (bỏ cả nội dung script/style), giải mã entity, gộp khoảng trắng và cắt còn
    VI: ``limit`` ký tự, để markup trong feed chỉ được lưu và hiển thị dưới dạng văn bản thuần.
    """
    parser = _TextOnly()
    parser.feed(value or '')
    parser.close()
    text = ' '.join(' '.join(parser.parts).split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + '…'


def news_cutoff_utc(now: datetime) -> datetime:
    """Most recent 06:30 Asia/Ho_Chi_Minh at or before ``now`` (naive UTC in and out, matching the
    ``timestamp without time zone`` columns). A source fetched at or after it is done for the day.
    VI: Mốc 06:30 giờ Việt Nam gần nhất tại hoặc trước ``now`` (vào/ra đều là UTC naive, khớp cột
    VI: ``timestamp without time zone``). Nguồn đã lấy từ mốc này trở đi coi như xong trong ngày.
    """
    local = now.replace(tzinfo=UTC).astimezone(HCM)
    cutoff = local.replace(hour=RUN_HOUR, minute=RUN_MINUTE, second=0, microsecond=0)
    if cutoff > local:
        cutoff -= timedelta(days=1)
    return cutoff.astimezone(UTC).replace(tzinfo=None)


def _name(tag: str) -> str:
    return tag.rsplit('}', 1)[-1]


def _text(entry: ET.Element, *names: str) -> str | None:
    for name in names:
        for child in entry:
            if _name(child.tag) == name:
                return ''.join(child.itertext())
    return None


def _link(entry: ET.Element) -> str:
    # RSS puts the URL in <link> text; Atom in <link rel="alternate" href>. Only http(s) is kept so
    # a javascript: or data: link can never reach the page.
    # VI: RSS để URL trong text của <link>; Atom trong <link rel="alternate" href>. Chỉ giữ
    # VI: http(s) để link javascript: hay data: không bao giờ tới trang.
    for child in entry:
        if _name(child.tag) == 'link' and child.get('rel', 'alternate') == 'alternate':
            href = (child.get('href') or child.text or '').strip()
            if urlsplit(href).scheme in ('http', 'https') and len(href) <= 2000:
                return href
    return ''


def _published(value: str | None, now: datetime) -> datetime:
    if value:
        value = value.strip()
        try:
            parsed = parsedate_to_datetime(value)
        except (TypeError, ValueError, IndexError):
            try:
                parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
            except ValueError:
                parsed = None
        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return min(parsed.astimezone(UTC).replace(tzinfo=None), now)
    return now


def parse_feed(body: bytes, now: datetime) -> list[dict[str, Any]]:
    """Parse RSS 2.0, RSS 1.0 or Atom into at most ``ITEMS_PER_FEED`` newest entries
    ``{title, url, summary, publishedAt}``. A DTD before the root element is refused, which blocks
    entity expansion and external entities; entries without a title or http(s) link are skipped.
    VI: Parse RSS 2.0, RSS 1.0 hoặc Atom thành tối đa ``ITEMS_PER_FEED`` tin mới nhất
    VI: ``{title, url, summary, publishedAt}``. Từ chối DTD trước phần tử gốc để chặn entity
    VI: expansion và external entity; bỏ tin không có tiêu đề hoặc link http(s).

    A JSON body is read as the CISA Known Exploited Vulnerabilities catalogue instead.
    VI: Body JSON được đọc như danh mục lỗ hổng bị khai thác (KEV) của CISA.
    """
    if body.lstrip()[:1] == b'{':
        return _parse_kev(body, now)
    root_start = _ROOT_START.search(body)
    if not root_start or _DTD.search(body[: root_start.start()]):
        raise ValueError('The feed has a DTD or no root element.')
    root = ET.fromstring(body)
    if _name(root.tag) not in ('rss', 'RDF', 'feed'):
        raise ValueError('The URL is not an RSS or Atom feed.')
    entries: dict[str, dict[str, Any]] = {}
    for entry in root.iter():
        if _name(entry.tag) not in ('item', 'entry'):
            continue
        title, url = plain_text(_text(entry, 'title'), 300), _link(entry)
        if not title or not url or url in entries:
            continue
        summary = plain_text(_text(entry, 'description', 'summary', 'content', 'encoded'), 500)
        entries[url] = {
            'title': title,
            'url': url,
            'summary': summary or None,
            'publishedAt': _published(_text(entry, 'pubDate', 'published', 'updated', 'date'), now),
        }
    return sorted(entries.values(), key=lambda item: item['publishedAt'], reverse=True)[:ITEMS_PER_FEED]


def _parse_kev(body: bytes, now: datetime) -> list[dict[str, Any]]:
    # Each entry becomes an item linking to its NVD page; entries without a valid CVE id are
    # skipped so the URL is always built from a checked value.
    # VI: Mỗi mục thành một tin trỏ tới trang NVD của nó; bỏ mục không có mã CVE hợp lệ để URL
    # VI: luôn dựng từ giá trị đã kiểm tra.
    entries = json.loads(body).get('vulnerabilities')
    if not isinstance(entries, list):
        raise ValueError('The URL is not an RSS or Atom feed.')
    items: list[dict[str, Any]] = []
    for entry in entries:
        cve = str(entry.get('cveID', '')) if isinstance(entry, dict) else ''
        if not _CVE.fullmatch(cve):
            continue
        items.append(
            {
                'title': plain_text(f"{cve}: {entry.get('vulnerabilityName') or ''}", 300),
                'url': f'https://nvd.nist.gov/vuln/detail/{cve}',
                'summary': plain_text(entry.get('shortDescription'), 500) or None,
                'publishedAt': _published(entry.get('dateAdded'), now),
            }
        )
    return sorted(items, key=lambda item: item['publishedAt'], reverse=True)[:ITEMS_PER_FEED]


async def fetch_feed(url: str, client: httpx.AsyncClient) -> bytes:
    """Download a feed, re-checking the allowlist and public-address rule on every redirect hop
    and stopping above ``MAX_FEED_BYTES``. The client must not follow redirects itself.
    shortcut: httpx resolves the host again when connecting, so DNS rebinding between the check
    and the request is not blocked; acceptable while every host is a fixed public news site.
    VI: Tải feed, kiểm tra lại allowlist và quy tắc địa chỉ công khai ở mỗi bước chuyển hướng,
    VI: dừng khi vượt ``MAX_FEED_BYTES``. Client không được tự theo chuyển hướng.
    VI: shortcut: httpx phân giải host lần nữa khi kết nối nên chưa chặn DNS rebinding giữa lúc
    VI: kiểm tra và lúc gửi; chấp nhận được khi mọi host là trang tin công khai cố định.
    """
    target = url
    for _ in range(MAX_REDIRECTS + 1):
        await public_url(feed_url(target))
        async with client.stream('GET', target) as response:
            if response.is_redirect and response.headers.get('location'):
                target = urljoin(target, response.headers['location'])
                continue
            response.raise_for_status()
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body += chunk
                if len(body) > MAX_FEED_BYTES:
                    raise ValueError('The feed is larger than 4 MiB.')
            return bytes(body)
    raise ValueError('The feed redirects too many times.')


async def fetch_article(url: str, client: httpx.AsyncClient) -> str:
    """Download an item's article page and return it as plain text cut to ``ARTICLE_CHARS``.

    Article links come from feed content, so any public http(s) host is allowed, but every
    redirect hop must resolve to public addresses (``public_url``), only HTML is read and at most
    ``MAX_ARTICLE_BYTES``. The text reaches only the AI prompt as untrusted data, never the page.
    shortcut: the host is resolved again when httpx connects (DNS rebinding is not blocked), as in
    ``fetch_feed`` and link previews; pin the resolved address if the raw text is ever returned.
    VI: Tải trang bài của tin và trả văn bản thuần cắt còn ``ARTICLE_CHARS``. Link bài lấy từ nội
    VI: dung feed nên chấp nhận mọi host http(s) công khai, nhưng mỗi bước chuyển hướng phải phân
    VI: giải ra IP công khai (``public_url``), chỉ đọc HTML và tối đa ``MAX_ARTICLE_BYTES``. Văn bản
    VI: chỉ đi vào prompt AI như dữ liệu không tin cậy, không bao giờ ra trang.
    VI: shortcut: httpx phân giải host lần nữa khi kết nối (chưa chặn DNS rebinding), giống
    VI: ``fetch_feed`` và xem trước link; cần ghim địa chỉ nếu có lúc trả văn bản gốc ra ngoài.
    """
    target = url
    for _ in range(MAX_REDIRECTS + 1):
        await public_url(target)
        async with client.stream('GET', target) as response:
            if response.is_redirect and response.headers.get('location'):
                target = urljoin(target, response.headers['location'])
                continue
            response.raise_for_status()
            if 'html' not in response.headers.get('content-type', ''):
                raise ValueError('The article is not an HTML page.')
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body += chunk
                if len(body) >= MAX_ARTICLE_BYTES:
                    break
            html = bytes(body[:MAX_ARTICLE_BYTES]).decode(response.encoding or 'utf-8', 'replace')
            return plain_text(html, ARTICLE_CHARS)
    raise ValueError('The article redirects too many times.')


def news_card(
    category: str, items: list[dict[str, Any]], app_url: str | None, digest: str | None = None
) -> dict[str, Any]:
    """Teams Adaptive Card listing up to ``CARD_ITEMS`` new items as Markdown links plus a
    "+N more" line. Brackets and parentheses are neutralised so a title or URL cannot break the
    link syntax. Items arrive ranked by AI risk; a labelled item shows its level and AI summary,
    and the category's AI digest (already plain text without brackets) opens the card.
    VI: Adaptive Card Teams liệt kê tối đa ``CARD_ITEMS`` tin mới dạng link Markdown và dòng
    VI: "+N more". Ngoặc vuông và ngoặc tròn được vô hiệu để tiêu đề hay URL không phá cú pháp link.
    VI: Tin đến theo thứ tự rủi ro AI; tin có nhãn hiện mức rủi ro và tóm tắt AI, bản tin AI của
    VI: nhóm (đã là văn bản thuần, không có ngoặc vuông) mở đầu card.
    """
    lines = [
        '- {}[{}]({}){}'.format(
            f"**{item['risk_level']}** " if item.get('risk_level') else '',
            item['title'].replace('[', '(').replace(']', ')'),
            item['url'].replace('(', '%28').replace(')', '%29').replace(' ', '%20'),
            f" — {item['ai_summary']}" if item.get('ai_summary') else '',
        )
        for item in items[:CARD_ITEMS]
    ]
    if digest:
        lines = [digest, '', *lines]
    if len(items) > CARD_ITEMS:
        lines.append(f'+{len(items) - CARD_ITEMS} more')
    return teams_message(
        {'title': f'📰 {category}: {len(items)} new', 'description': '\n'.join(lines), 'url': app_url},
        markdown=True,
    )
