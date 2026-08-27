from __future__ import annotations

import logging
from datetime import datetime

import httpx

from ..core.config import Settings

logger = logging.getLogger(__name__)

DISCORD_API = 'https://discord.com/api/v10'
VIEW_CHANNEL = 1 << 10
SEND_MESSAGES = 1 << 11


class RegistrationDeliveryError(Exception):
    """Raised when a registration code cannot be delivered securely."""


def registration_code_message(email: str, code: str, expires_at: datetime) -> str:
    expiry = expires_at.strftime('%H:%M UTC')
    return (
        '🔐 **Flowie registration verification**\n'
        f'Email: `{email}`\n'
        f'One-time code: **{code}**\n'
        f'Expires at {expiry}. Do not share this code.'
    )


async def _discord_request(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    token: str,
    **kwargs: object,
) -> httpx.Response:
    response = await client.request(
        method,
        f'{DISCORD_API}{path}',
        headers={'Authorization': f'Bot {token}'},
        **kwargs,
    )
    if not response.is_success:
        raise RegistrationDeliveryError(
            f'Discord responded with {response.status_code}: {response.text[:200]}'
        )
    return response


async def _guild_from_existing_channel(
    client: httpx.AsyncClient, token: str, channel_id: str
) -> str | None:
    response = await _discord_request(client, 'GET', f'/channels/{channel_id}', token)
    guild_id = response.json().get('guild_id')
    return guild_id if isinstance(guild_id, str) else None


def _is_private_registration_channel(channel: dict[object, object], guild_id: str) -> bool:
    overwrites = channel.get('permission_overwrites', [])
    if not isinstance(overwrites, list):
        return False
    for overwrite in overwrites:
        if not isinstance(overwrite, dict):
            continue
        if str(overwrite.get('id')) != guild_id or overwrite.get('type') != 0:
            continue
        try:
            return bool(int(str(overwrite.get('deny', '0'))) & VIEW_CHANNEL)
        except ValueError:
            return False
    return False


async def _find_or_create_channel(settings: Settings, client: httpx.AsyncClient) -> str:
    token = settings.discord_bot_token
    if not token:
        raise RegistrationDeliveryError('DISCORD_BOT_TOKEN is not configured.')
    if settings.discord_registration_channel_id:
        configured_channel = await _discord_request(
            client, 'GET', f'/channels/{settings.discord_registration_channel_id}', token
        )
        channel_data = configured_channel.json()
        guild_id = channel_data.get('guild_id')
        if not isinstance(guild_id, str) or not _is_private_registration_channel(channel_data, guild_id):
            raise RegistrationDeliveryError('DISCORD_REGISTRATION_CHANNEL_ID must identify a private channel.')
        return settings.discord_registration_channel_id

    guild_id = settings.discord_bot_guild_id
    if not guild_id and settings.discord_bot_channel_id:
        guild_id = await _guild_from_existing_channel(client, token, settings.discord_bot_channel_id)
    if not guild_id:
        raise RegistrationDeliveryError(
            'Set DISCORD_BOT_GUILD_ID or DISCORD_BOT_CHANNEL_ID so Flowie can create flowie-register.'
        )

    channels = await _discord_request(client, 'GET', f'/guilds/{guild_id}/channels', token)
    for channel in channels.json():
        if channel.get('name') == 'flowie-register' and channel.get('type') == 0:
            if not _is_private_registration_channel(channel, guild_id):
                raise RegistrationDeliveryError('The existing flowie-register channel is not private.')
            return str(channel['id'])

    bot = await _discord_request(client, 'GET', '/users/@me', token)
    bot_id = str(bot.json()['id'])
    overwrites = [
        {'id': guild_id, 'type': 0, 'deny': str(VIEW_CHANNEL)},
        {'id': bot_id, 'type': 1, 'allow': str(VIEW_CHANNEL | SEND_MESSAGES)},
    ]
    if settings.discord_registration_channel_role_id:
        overwrites.append(
            {
                'id': settings.discord_registration_channel_role_id,
                'type': 0,
                'allow': str(VIEW_CHANNEL),
            }
        )
    channel = await _discord_request(
        client,
        'POST',
        f'/guilds/{guild_id}/channels',
        token,
        json={
            'name': 'flowie-register',
            'type': 0,
            'topic': 'Private one-time registration codes. Do not share codes.',
            'permission_overwrites': overwrites,
        },
    )
    return str(channel.json()['id'])


async def deliver_registration_code(
    settings: Settings, *, email: str, code: str, expires_at: datetime
) -> None:
    """Deliver an OTP only to the private Flowie registration Discord channel."""

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            channel_id = await _find_or_create_channel(settings, client)
            await _discord_request(
                client,
                'POST',
                f'/channels/{channel_id}/messages',
                settings.discord_bot_token,
                json={'content': registration_code_message(email, code, expires_at)},
            )
    except (httpx.HTTPError, KeyError, TypeError, RegistrationDeliveryError) as error:
        logger.warning('Could not deliver registration OTP to Discord: %s', error)
        raise RegistrationDeliveryError(
            'Registration verification is temporarily unavailable. Please try again later.'
        ) from error
