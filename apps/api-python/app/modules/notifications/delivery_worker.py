import asyncio
from datetime import timedelta
from email.message import EmailMessage

from ...core.clock import utcnow
from ...core.identifiers import cuid
from ...services.notification_events import notification_hub
from ...services.private_email import send_private_email
from ..identity.reset_delivery import delivery_enabled
from ..operations.heartbeats import progress
from .commands import (
    DELIVER_ONE_UPDATE_NOTIFICATION_EMAIL_DELIVERIES,
    DELIVER_ONE_UPDATE_NOTIFICATION_EMAIL_DELIVERIES_2,
    WAKE_SNOOZED_UPDATE_NOTIFICATIONS,
)
from .queries import (
    DELIVER_ONE_SELECT_NOTIFICATIONS,
)
from .ticket_email import ticket_email, ticket_email_allowed


async def wake_snoozed(factory):
    async with factory() as db:
        rows = (
            (
                await db.execute(
                    WAKE_SNOOZED_UPDATE_NOTIFICATIONS,
                    {"now": utcnow()},
                )
            )
            .mappings()
            .all()
        )
        await db.commit()
    for row in rows:
        await notification_hub.publish(
            {
                "id": row["id"],
                "workspaceId": row["workspace_id"],
                "userId": row["user_id"],
                "readAt": row["read_at"].isoformat() + "Z" if row["read_at"] else None,
                "wokeFromSnooze": True,
            }
        )
    return len(rows)


async def deliver_one(factory, settings, send=send_private_email, notification_id=None):
    if not delivery_enabled(settings):
        return False
    token, now = cuid(), utcnow()
    async with factory() as db:
        row = (
            (
                await db.execute(
                    DELIVER_ONE_UPDATE_NOTIFICATION_EMAIL_DELIVERIES_2,
                    {
                        "now": now,
                        "lease": now + timedelta(minutes=2),
                        "token": token,
                        "target": notification_id,
                    },
                )
            )
            .mappings()
            .first()
        )
        if not row:
            await db.rollback()
            return False
        target = (
            (
                await db.execute(
                    DELIVER_ONE_SELECT_NOTIFICATIONS,
                    {"id": row["notification_id"]},
                )
            )
            .mappings()
            .first()
        )
        await db.commit()
    ticket = bool(target and target["entity_type"] == "ticket")
    allowed = bool(
        target
        and target["status"] == "ACTIVE"
        and target["membership_status"] == "ACTIVE"
        and target["email_verified_at"]
        and (ticket_email_allowed(target, now) if ticket else target["email_enabled"])
    )
    error = None
    if not allowed:
        error = "RECIPIENT_DISABLED"
    else:
        message = EmailMessage()
        subject, content = (
            ticket_email(target, settings.app_url)
            if ticket
            else (
                "New Flowie notification",
                f"You have a new Flowie notification.\n\n{settings.app_url}/{target['workspace_id']}/inbox\n\nManage email notifications in workspace Settings > Notifications.",
            )
        )
        message["Subject"] = subject
        message["From"] = settings.smtp_from
        message["To"] = target["email"]
        message["Message-ID"] = f"<{row['notification_id']}@flowie>"
        message.set_content(content)
        try:
            await send(settings, message)
        except Exception:
            error = "SMTP_ERROR"
    async with factory() as db:
        now = utcnow()
        await db.execute(
            DELIVER_ONE_UPDATE_NOTIFICATION_EMAIL_DELIVERIES,
            {
                "id": row["notification_id"],
                "token": token,
                "delivered": now if error is None else None,
                "failed": now
                if error and (error == "RECIPIENT_DISABLED" or row["attempts"] >= 8)
                else None,
                "error": error,
                "retry": now + timedelta(seconds=min(3600, 5 * 2 ** row["attempts"])),
            },
        )
        await db.commit()
    return True


async def delivery_loop(factory, settings, stop):
    import logging

    logger = logging.getLogger(__name__)
    while not stop.is_set():
        try:
            await progress(factory,'notification-channels',wake_snoozed(factory))
            for _ in range(20):
                if stop.is_set() or not await deliver_one(factory, settings):
                    break
        except Exception:
            logger.warning("Notification delivery worker is unavailable")
        try:
            await asyncio.wait_for(stop.wait(), timeout=5)
        except TimeoutError:
            pass
