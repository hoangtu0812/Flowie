from ..operations.heartbeats import progress
import asyncio
from datetime import timedelta
from email.message import EmailMessage
from sqlalchemy import text
from ...core.clock import _utcnow
from ...core.identifiers import _cuid
from ...services.notification_events import notification_hub
from ...services.private_email import send_private_email
from ..identity.reset_delivery import delivery_enabled


async def wake_snoozed(factory):
    async with factory() as db:
        rows = (
            (
                await db.execute(
                    text("""UPDATE notifications SET snoozed_until=NULL WHERE id IN (
            SELECT id FROM notifications WHERE snoozed_until<=:now ORDER BY snoozed_until,id FOR UPDATE SKIP LOCKED LIMIT 100)
            RETURNING id,workspace_id,user_id,read_at"""),
                    {"now": _utcnow()},
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
    token, now = _cuid(), _utcnow()
    async with factory() as db:
        row = (
            (
                await db.execute(
                    text("""UPDATE notification_email_deliveries SET attempts=attempts+1,lease_token=:token,lease_until=:lease
            WHERE notification_id=(SELECT notification_id FROM notification_email_deliveries e WHERE delivered_at IS NULL AND failed_at IS NULL
            AND available_at<=:now AND (lease_until IS NULL OR lease_until<:now)
            AND (CAST(:target AS text) IS NULL OR notification_id=CAST(:target AS text))
            AND EXISTS(SELECT 1 FROM notifications n WHERE n.id=e.notification_id AND (n.snoozed_until IS NULL OR n.snoozed_until<=:now))
            ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1)
            RETURNING notification_id,attempts"""),
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
                    text("""SELECT u.email,u.status,u.email_verified_at,w.id AS workspace_id,p.email_enabled,wm.status AS membership_status
            FROM notifications n JOIN users u ON u.id=n.user_id JOIN workspaces w ON w.id=n.workspace_id
            LEFT JOIN workspace_members wm ON wm.user_id=n.user_id AND wm.workspace_id=n.workspace_id
            LEFT JOIN notification_preferences p ON p.user_id=n.user_id AND p.workspace_id=n.workspace_id WHERE n.id=:id"""),
                    {"id": row["notification_id"]},
                )
            )
            .mappings()
            .first()
        )
        await db.commit()
    allowed = bool(
        target
        and target["status"] == "ACTIVE"
        and target["membership_status"] == "ACTIVE"
        and target["email_verified_at"]
        and target["email_enabled"]
    )
    error = None
    if not allowed:
        error = "RECIPIENT_DISABLED"
    else:
        message = EmailMessage()
        message["Subject"] = "New Flowie notification"
        message["From"] = settings.smtp_from
        message["To"] = target["email"]
        message["Message-ID"] = f"<{row['notification_id']}@flowie>"
        message.set_content(
            f"You have a new Flowie notification.\n\n{settings.app_url}/{target['workspace_id']}/inbox\n\nManage email notifications in workspace Settings > Notifications."
        )
        try:
            await send(settings, message)
        except Exception:
            error = "SMTP_ERROR"
    async with factory() as db:
        now = _utcnow()
        await db.execute(
            text("""UPDATE notification_email_deliveries SET delivered_at=:delivered,failed_at=:failed,last_error_code=:error,
            available_at=:retry,lease_until=NULL,lease_token=NULL WHERE notification_id=:id AND lease_token=:token"""),
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
