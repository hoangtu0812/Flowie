from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import urlsplit
from ...core.config import Settings

logger = logging.getLogger(__name__)


def delivery_enabled(settings: Settings) -> bool:
    url = urlsplit(settings.app_url)
    return bool(
        settings.smtp_host
        and settings.smtp_from
        and url.scheme in {"https", "http"}
        and url.netloc
    )


async def deliver_reset(settings: Settings, email: str, token: str) -> None:
    message = EmailMessage()
    message["Subject"] = "Reset your Flowie password"
    message["From"] = settings.smtp_from
    message["To"] = email
    # Fragments are not included in server request logs or Referer headers.
    message.set_content(
        f"A password reset was requested for your Flowie account.\n\n"
        f"{settings.app_url}/auth/reset-password#token={token}\n\n"
        "This link expires in 15 minutes and can be used once. If you did not request it, ignore this email."
    )

    def send():
        context = ssl.create_default_context()
        client = (
            smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, timeout=15, context=context
            )
            if settings.smtp_use_ssl
            else smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
        )
        with client:
            if not settings.smtp_use_ssl:
                client.starttls(context=context)
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)

    try:
        await asyncio.to_thread(send)
    except Exception:
        # Provider exceptions can contain recipients or authentication material.
        logger.error("Password reset email delivery failed.")
