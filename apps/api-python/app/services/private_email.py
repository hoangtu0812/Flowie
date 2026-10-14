import asyncio
import smtplib
import ssl


async def send_private_email(settings, message):
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

    await asyncio.to_thread(send)
