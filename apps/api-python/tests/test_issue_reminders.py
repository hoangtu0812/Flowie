import asyncio
import json
import os
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import _utcnow
from app.core.config import _async_database_url
from app.core.identifiers import _cuid
from app.jobs.reminders import deliver_due_reminders
from app.modules.identity.auth import create_workspace_bootstrap


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_reminder_delivery_selection_idempotence_payload_and_concurrency():
    asyncio.run(verify_reminders())


async def verify_reminders():
    """Covers the delivery rules the retired BullMQ worker enforced in code.

    The Node worker decided per job whether to deliver: it skipped a reminder
    whose issue was archived, one already carrying ``deliveredAt``, and one
    whose ``remindAt`` was still ahead of the clock, and it relied on a unique
    BullMQ job id so a reminder could not be delivered twice. The Python job
    expresses the same four rules as one claiming query, so a single scan over
    a seeded set is what proves the replacement complete.

    VI: Phủ các quy tắc giao hàng mà worker BullMQ đã nghỉ từng thực thi bằng
    mã. Worker Node quyết định theo từng job: bỏ qua reminder có issue đã lưu
    trữ, reminder đã mang ``deliveredAt``, và reminder có ``remindAt`` còn ở
    phía trước đồng hồ; nó dựa vào job id duy nhất của BullMQ để một reminder
    không bị giao hai lần. Job Python diễn đạt cả bốn quy tắc trong một câu
    truy vấn giành quyền, nên một lượt quét trên tập dữ liệu đã gieo là đủ
    chứng minh bản thay thế không thiếu gì.
    """
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    factory = async_sessionmaker(engine)
    user = _cuid()
    due, future, archived, delivered = _cuid(), _cuid(), _cuid(), _cuid()
    seed = None
    try:
        async with factory() as db:
            now = _utcnow()
            await db.execute(
                text(
                    "INSERT INTO users(id,name,email,status,email_verified_at,created_at,updated_at) VALUES (:id,'Reminder fixture',:email,'ACTIVE',:now,:now,:now)"
                ),
                {"id": user, "email": user + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db,
                user_id=user,
                organization_name="Reminders",
                workspace_name=_cuid(),
                now=now,
            )
            status = (
                await db.execute(
                    text(
                        "SELECT id FROM issue_statuses WHERE workspace_id=:workspace ORDER BY position LIMIT 1"
                    ),
                    {"workspace": seed["workspace_id"]},
                )
            ).scalar_one()
            # The archived issue carries a non-null archived_at; the other three
            # differ only in the reminder attached to them, so any difference in
            # the outcome is attributable to the reminder row alone.
            # VI: Issue đã lưu trữ mang archived_at khác null; ba issue còn lại
            # chỉ khác nhau ở reminder gắn kèm, nên mọi khác biệt về kết quả đều
            # quy được về riêng dòng reminder.
            issues = [
                (due, 1, "REM-1", None),
                (future, 2, "REM-2", None),
                (archived, 3, "REM-3", now),
                (delivered, 4, "REM-4", None),
            ]
            for issue_id, number, identifier, archived_at in issues:
                await db.execute(
                    text(
                        "INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,archived_at,created_at,updated_at)"
                        " VALUES (:id,:workspace,:team,:status,:identifier,:number,:title,:user,:archived_at,:now,:now)"
                    ),
                    {
                        "id": issue_id,
                        "workspace": seed["workspace_id"],
                        "team": seed["team_id"],
                        "status": status,
                        "identifier": identifier,
                        "number": number,
                        "title": "Reminder " + identifier,
                        "user": user,
                        "archived_at": archived_at,
                        "now": now,
                    },
                )
            remind_at = now - timedelta(minutes=1)
            reminders = [
                (due, remind_at, None),
                (future, now + timedelta(hours=1), None),
                (archived, remind_at, None),
                (delivered, remind_at, now - timedelta(minutes=5)),
            ]
            for issue_id, at, delivered_at in reminders:
                await db.execute(
                    text(
                        "INSERT INTO issue_reminders(id,issue_id,user_id,remind_at,delivered_at,created_at,updated_at)"
                        " VALUES (:id,:issue,:user,:remind_at,:delivered_at,:now,:now)"
                    ),
                    {
                        "id": _cuid(),
                        "issue": issue_id,
                        "user": user,
                        "remind_at": at,
                        "delivered_at": delivered_at,
                        "now": now,
                    },
                )
            await db.commit()

        # Two scans race the way two API replicas would. FOR UPDATE SKIP LOCKED
        # replaces the unique BullMQ job id, so exactly one of them may claim the
        # single due reminder and the other must come back empty-handed.
        # VI: Hai lượt quét chạy đua như hai bản sao API. FOR UPDATE SKIP LOCKED
        # thay cho job id duy nhất của BullMQ, nên đúng một lượt được giành
        # reminder đến hạn duy nhất, lượt kia phải về tay không.
        results = await asyncio.gather(
            deliver_due_reminders(factory), deliver_due_reminders(factory)
        )
        assert sorted(results) == [0, 1]

        async with factory() as db:
            rows = (
                await db.execute(
                    text(
                        "SELECT entity_id, data FROM notifications WHERE user_id=:user AND type='issue.reminder'"
                    ),
                    {"user": user},
                )
            ).mappings().all()
            assert [row["entity_id"] for row in rows] == [due]

            # The payload is written straight into jsonb, so nothing downstream
            # re-serialises it. An instant stored UTC-naive therefore has to gain
            # its offset here or it reads back as a local time one zone away.
            # VI: Payload được ghi thẳng vào jsonb nên không khâu nào phía sau
            # tuần tự hoá lại. Một mốc thời gian lưu naive-UTC vì thế phải được
            # gắn offset ngay tại đây, nếu không nó đọc lại thành giờ địa phương
            # lệch một múi giờ.
            payload = rows[0]["data"]
            payload = json.loads(payload) if isinstance(payload, str) else payload
            assert payload["identifier"] == "REM-1"
            # Compared against the stored instant rather than the one seeded:
            # the column is timestamp(3), so Postgres has already rounded the
            # seeded microseconds away and only the persisted value is the
            # contract the payload has to reproduce.
            # VI: So với mốc thời gian đã lưu chứ không phải mốc đã gieo: cột là
            # timestamp(3) nên Postgres đã làm tròn bỏ phần micro giây của giá
            # trị gieo, và chỉ giá trị đã lưu mới là hợp đồng mà payload phải
            # tái hiện đúng.
            stored = (
                await db.execute(
                    text(
                        "SELECT remind_at FROM issue_reminders WHERE issue_id=:issue"
                    ),
                    {"issue": due},
                )
            ).scalar_one()
            assert datetime.fromisoformat(payload["remindAt"]) == stored.replace(
                tzinfo=UTC
            )

            claimed = (
                await db.execute(
                    text(
                        "SELECT issue_id FROM issue_reminders WHERE user_id=:user AND delivered_at IS NOT NULL ORDER BY issue_id"
                    ),
                    {"user": user},
                )
            ).scalars().all()
            assert sorted(claimed) == sorted([due, delivered])

        # A rescan must find nothing: the claimed reminder now carries
        # delivered_at, and the future and archived ones stay out of range.
        # VI: Lượt quét lại phải không thấy gì: reminder đã giành nay mang
        # delivered_at, còn reminder tương lai và reminder của issue đã lưu trữ
        # vẫn nằm ngoài phạm vi.
        assert await deliver_due_reminders(factory) == 0

        async with factory() as db:
            assert (
                await db.execute(
                    text(
                        "SELECT count(*) FROM notifications WHERE user_id=:user AND type='issue.reminder'"
                    ),
                    {"user": user},
                )
            ).scalar_one() == 1
    finally:
        async with factory() as db:
            if seed:
                await db.execute(
                    text("DELETE FROM organizations WHERE id=:id"),
                    {"id": seed["organization_id"]},
                )
            await db.execute(text("DELETE FROM users WHERE id=:id"), {"id": user})
            await db.commit()
        await engine.dispose()
