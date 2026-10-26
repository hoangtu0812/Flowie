from __future__ import annotations

"""Microsoft Teams channel delivery through Teams Workflows webhooks.

Office 365 connector webhooks are retired, so a channel is connected with the
"Post to a channel when a webhook request is received" workflow, which
accepts an Adaptive Card message. Teams delivery is offered only while
Microsoft Entra sign-in is configured, because the feature is scoped to
organizations that already run Flowie inside their Microsoft tenant.
"""

from typing import Any
from urllib.parse import urlparse

from ..core.config import Settings
from .microsoft_identity import MicrosoftIdentityClient

# Workflow trigger URLs are issued by Logic Apps (legacy) or Power Platform
# environments. Restricting hosts keeps a stored URL from becoming an SSRF
# vector against internal services.
TEAMS_WEBHOOK_HOST_SUFFIXES = ('.logic.azure.com', '.api.powerplatform.com')


def teams_available(settings: Settings | None = None) -> bool:
    settings = settings or Settings.from_environment()
    return MicrosoftIdentityClient(
        tenant_id=settings.azure_ad_tenant_id,
        client_id=settings.azure_ad_client_id,
        client_secret=settings.azure_ad_client_secret,
        redirect_uri=settings.azure_ad_redirect_uri,
    ).enabled


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


def teams_message(embed: dict[str, Any]) -> dict[str, Any]:
    """Render the shared notification embed as a Teams Adaptive Card message."""

    body: list[dict[str, Any]] = [
        {'type': 'TextBlock', 'text': embed.get('title') or 'Flowie', 'weight': 'Bolder', 'size': 'Medium', 'wrap': True},
    ]
    author = (embed.get('author') or {}).get('name')
    if author:
        body.append({'type': 'TextBlock', 'text': author, 'isSubtle': True, 'spacing': 'None', 'wrap': True})
    if embed.get('description'):
        body.append({'type': 'TextBlock', 'text': embed['description'], 'wrap': True})
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
