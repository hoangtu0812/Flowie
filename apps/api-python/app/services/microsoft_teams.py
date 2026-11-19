from __future__ import annotations

"""Microsoft Teams channel delivery through Teams Workflows webhooks.

Office 365 connector webhooks are retired, so a channel is connected with the
"Post to a channel when a webhook request is received" workflow, which
accepts an Adaptive Card message. Teams delivery is offered only while
Microsoft Entra sign-in is configured, because the feature is scoped to
organizations that already run Flowie inside their Microsoft tenant.
"""

import re
from typing import Any
from urllib.parse import urlparse

from ..core.config import Settings
from .auth_policy import microsoft_sign_in_enabled

# Workflow trigger URLs are issued by Logic Apps (legacy) or Power Platform
# environments. Restricting hosts keeps a stored URL from becoming an SSRF
# vector against internal services.
TEAMS_WEBHOOK_HOST_SUFFIXES = ('.logic.azure.com', '.api.powerplatform.com')


def teams_available(settings: Settings | None = None) -> bool:
    return microsoft_sign_in_enabled(settings or Settings.from_environment())


def valid_teams_webhook(value: str) -> str | None:
    value = value.strip()
    parsed = urlparse(value)
    host = (parsed.hostname or '').lower()
    try:
        port = parsed.port
    except ValueError:
        return None
    if (
        parsed.scheme != 'https'
        or parsed.username
        or parsed.password
        or port not in (None, 443)
        or not host.endswith(TEAMS_WEBHOOK_HOST_SUFFIXES)
        or '/workflows/' not in parsed.path
    ):
        return None
    return value


def masked_webhook(value: str) -> str:
    return f'{value[:32]}••••{value[-6:]}'


PREVIEW_LIMIT = 200

# Markdown syntax a TextBlock would otherwise show raw or as large text. The
# description usually arrives with its newlines already collapsed into spaces,
# so block markers (heading, quote, list) are matched at the start of any word.
# VI: Cú pháp Markdown mà TextBlock sẽ hiện thô hoặc thành chữ to. Description
# VI: thường đến với xuống dòng đã gộp thành dấu cách, nên ký hiệu khối
# VI: (heading, quote, list) được bắt ở đầu bất kỳ từ nào.
_MARKDOWN = [
    (re.compile(r'```\w*'), ' '),
    (re.compile(r'!?\[([^\]]*)\]\([^)]*\)'), r'\1'),
    (re.compile(r'(^|\s)(?:#{1,6}|>|[-*+]|\d+[.)])(?=\s)'), r'\1'),
    (re.compile(r'\*\*|__|~~|`'), ''),
]


def plain_preview(text: str, limit: int = PREVIEW_LIMIT) -> str:
    """Return ``text`` as one plain line of at most ``limit`` characters.

    Removes code fences, heading/quote/list markers, bold/strike/code marks and
    turns ``[text](url)`` into ``text``, then collapses whitespace and cuts with
    an ellipsis. A single ``*``/``_`` is kept because it only italicises.
    VI: Trả ``text`` thành một dòng văn bản thường tối đa ``limit`` ký tự.
    VI: Bỏ code fence, ký hiệu heading/quote/list, in đậm/gạch/code và đổi
    VI: ``[text](url)`` thành ``text``, rồi gộp khoảng trắng và cắt kèm dấu
    VI: ba chấm. Giữ ``*``/``_`` đơn vì chúng chỉ làm chữ nghiêng.
    """

    for pattern, replacement in _MARKDOWN:
        text = pattern.sub(replacement, text)
    text = ' '.join(text.split())
    return text if len(text) <= limit else f'{text[: limit - 1].rstrip()}…'


def teams_message(embed: dict[str, Any], *, markdown: bool = False) -> dict[str, Any]:
    """Render the shared notification embed as a Teams Adaptive Card message.

    The description is reduced to a short plain-text preview so a long issue
    description or comment cannot turn the card into a wall of raw Markdown
    and heading-sized text. ``markdown=True`` keeps it as written, for cards
    that build their description as Markdown on purpose (news digests).
    VI: Description được rút thành preview văn bản thường ngắn để description
    VI: hay comment dài không biến card thành khối Markdown thô và chữ cỡ
    VI: heading. ``markdown=True`` giữ nguyên, cho card cố ý dựng description
    VI: bằng Markdown (bản tin News).
    """

    body: list[dict[str, Any]] = [
        {'type': 'TextBlock', 'text': embed.get('title') or 'Flowie', 'weight': 'Bolder', 'size': 'Medium', 'wrap': True},
    ]
    author = (embed.get('author') or {}).get('name')
    if author:
        body.append({'type': 'TextBlock', 'text': author, 'isSubtle': True, 'spacing': 'None', 'wrap': True})
    description = embed.get('description')
    if description and not markdown:
        description = plain_preview(description)
    if description:
        body.append({'type': 'TextBlock', 'text': description, 'wrap': True})
    facts = [{'title': field['name'], 'value': field['value']} for field in embed.get('fields', [])]
    if facts:
        body.append({'type': 'FactSet', 'facts': facts})
    footer = (embed.get('footer') or {}).get('text')
    if footer:
        body.append({'type': 'TextBlock', 'text': footer, 'isSubtle': True, 'size': 'Small', 'wrap': True})
    card: dict[str, Any] = {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        'type': 'AdaptiveCard',
        'version': '1.4',
        'body': body,
    }
    if embed.get('url'):
        card['actions'] = [{'type': 'Action.OpenUrl', 'title': 'Open in Flowie', 'url': embed['url']}]
    return {
        'type': 'message',
        'attachments': [
            {'contentType': 'application/vnd.microsoft.card.adaptive', 'contentUrl': None, 'content': card}
        ],
    }


def teams_mention_message(embed: dict[str, Any], people: list[dict[str, str]]) -> dict[str, Any]:
    """Render ``embed`` as a card that @mentions ``people`` so Teams alerts each of them.

    Each person is ``{'id': <Entra object id>, 'name': <Flowie display name>}``. Teams resolves a
    mention only when the ``<at>`` text in the body matches an entity exactly, so both are built
    from the same name. Names come from Flowie accounts, never from comment text.
    VI: Dựng ``embed`` thành card @mention ``people`` để Teams báo cho từng người.
    VI: Mỗi người là ``{'id': <Entra object id>, 'name': <tên trong Flowie>}``. Teams chỉ nhận
    VI: mention khi chuỗi ``<at>`` trong body khớp đúng một entity, nên cả hai dựng từ cùng một
    VI: tên. Tên lấy từ tài khoản Flowie, không bao giờ từ nội dung comment.
    """

    message = teams_message(embed)
    card = message['attachments'][0]['content']
    card['body'].insert(
        0,
        {'type': 'TextBlock', 'text': ', '.join(f'<at>{person["name"]}</at>' for person in people), 'wrap': True},
    )
    card['msteams'] = {
        'entities': [
            {
                'type': 'mention',
                'text': f'<at>{person["name"]}</at>',
                'mentioned': {'id': person['id'], 'name': person['name']},
            }
            for person in people
        ]
    }
    return message
