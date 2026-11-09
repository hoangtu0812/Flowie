import asyncio
import json
from datetime import datetime, timedelta
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import _utcnow
from app.core.config import _async_database_url
from app.core.identifiers import _cuid
from app.domains.auth import create_workspace_bootstrap
from app.jobs.cycle_cadence import (
    _create_generated_cycle,
    run_cycle_cadence,
    start_of_utc_day,
)


def test_start_of_utc_day_truncates_without_shifting_zone():
    # A late-evening UTC instant must stay on its own UTC day. Reading it in
    # Ho Chi Minh time would move it to the next day and shift every cycle
    # boundary by one.
    # VI: Một thời điểm UTC lúc tối muộn phải ở nguyên ngày UTC của nó. Đọc theo
    # VI: giờ Hồ Chí Minh sẽ đẩy nó sang ngày hôm sau và dịch mọi ranh giới cycle
    # VI: đi một ngày.
    assert start_of_utc_day(datetime(2026, 11, 8, 23, 30)) == datetime(2026, 11, 8)
    assert start_of_utc_day(datetime(2026, 11, 8, 0, 0)) == datetime(2026, 11, 8)


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_cadence_generates_activates_completes_and_stays_idempotent():
    asyncio.run(verify_cadence())


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_two_concurrent_scans_do_not_duplicate_a_cycle_span():
    asyncio.run(verify_concurrent_cadence())


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_a_span_that_already_exists_is_never_created_twice():
    asyncio.run(verify_span_identity())


async def verify_span_identity():
    """The span, not the name, is a cycle's identity.

    Two calls for the same start and end must produce one row: that is what
    stops a restart mid-scan, or a second API instance, from giving a team two
    cycles covering the same fortnight. Called directly because no end-to-end
    path reaches this branch twice — the horizon check short-circuits first.

    VI: Khoảng ngày, chứ không phải cái tên, mới là danh tính của một cycle. Hai
    lần gọi cho cùng ngày bắt đầu và kết thúc phải chỉ sinh ra một dòng: đó là
    thứ ngăn một lần khởi động lại giữa chừng, hay một instance API thứ hai, cấp
    cho team hai cycle phủ cùng một nửa tháng. Gọi trực tiếp vì không đường đi
    đầu-cuối nào chạm tới nhánh này hai lần — phần kiểm tầm nhìn đã chặn trước.
    """
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine)
    user = _cuid()
    seed = None
    try:
        async with factory() as db:
            now = _utcnow()
            await db.execute(
                text("INSERT INTO users(id,name,email,status,email_verified_at,created_at,updated_at)"
                     " VALUES (:id,'Span fixture',:email,'ACTIVE',:now,:now,:now)"),
                {"id": user, "email": user + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=user, organization_name="Spans", workspace_name=_cuid(), now=now
            )
            await db.commit()

        today = start_of_utc_day(_utcnow())
        team = {"id": seed["team_id"], "workspace_id": seed["workspace_id"],
                "cycle_cadence_weeks": 2}
        names: set[str] = set()
        async with factory() as db:
            first = await _create_generated_cycle(
                db, team, names, today, today + timedelta(days=13), "ACTIVE", True)
            await db.commit()
            second = await _create_generated_cycle(
                db, team, names, today, today + timedelta(days=13), "ACTIVE", True)
            await db.commit()
        assert first is True and second is False

        async with factory() as db:
            assert (await db.execute(
                text("SELECT count(*) FROM cycles WHERE team_id=:team"), {"team": seed["team_id"]}
            )).scalar_one() == 1
            assert (await db.execute(
                text("SELECT count(*) FROM audit_logs WHERE workspace_id=:workspace"
                     " AND action='cycle.auto_generated'"),
                {"workspace": seed["workspace_id"]},
            )).scalar_one() == 1
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


async def verify_concurrent_cadence():
    """Two scans overlapping in one event loop still leave one set of cycles.

    This holds the end-to-end property only. It does not pin the span check in
    ``_create_generated_cycle``: the two sessions serialise at their await
    points, so the second scan reads a calendar the first already filled and
    never reaches the creation path. Removing the check leaves this test green.
    The check itself is pinned by ``verify_span_identity`` below.

    VI: Hai lượt quét chồng nhau trong cùng một event loop vẫn chỉ để lại một bộ
    cycle. Test này chỉ giữ tính chất đầu-cuối. Nó **không** giữ được phần kiểm
    khoảng ngày trong ``_create_generated_cycle``: hai session nối tiếp nhau tại
    các điểm await, nên lượt sau đọc được lịch mà lượt trước đã lấp và không bao
    giờ chạm tới nhánh tạo mới. Bỏ phần kiểm đó đi thì test này vẫn xanh. Chính
    phần kiểm ấy được ``verify_span_identity`` bên dưới giữ.
    """
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine)
    user = _cuid()
    seed = None
    try:
        async with factory() as db:
            now = _utcnow()
            await db.execute(
                text("INSERT INTO users(id,name,email,status,email_verified_at,created_at,updated_at)"
                     " VALUES (:id,'Cadence race fixture',:email,'ACTIVE',:now,:now,:now)"),
                {"id": user, "email": user + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=user, organization_name="Cadence race", workspace_name=_cuid(), now=now
            )
            await db.execute(
                text("UPDATE teams SET cycle_cadence_weeks=1 WHERE id=:id"),
                {"id": seed["team_id"]},
            )
            await db.commit()

        await asyncio.gather(
            run_cycle_cadence(factory, writes_enabled=True),
            run_cycle_cadence(factory, writes_enabled=True),
        )

        async with factory() as db:
            spans = (await db.execute(
                text("SELECT start_date, end_date FROM cycles WHERE team_id=:team"),
                {"team": seed["team_id"]},
            )).all()
        assert spans, "the scan created no cycle at all"
        assert len(spans) == len(set(spans)), f"duplicate cycle spans created: {spans}"
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


async def verify_cadence():
    """One scan fills the calendar, and a second changes nothing.

    Idempotence is the property that matters operationally: the job runs every
    hour, so a cycle span it already created must never be created again, and
    the identity used for that is the span itself rather than the name.

    VI: Một lượt quét lấp đầy lịch, lượt thứ hai không đổi gì. Tính bất biến khi
    lặp mới là thứ quan trọng khi vận hành: job chạy mỗi giờ, nên một khoảng
    ngày đã tạo thì không bao giờ được tạo lại, và danh tính dùng cho việc đó
    là chính khoảng ngày chứ không phải cái tên.
    """
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine)
    user = _cuid()
    seed = None
    try:
        async with factory() as db:
            now = _utcnow()
            await db.execute(
                text("INSERT INTO users(id,name,email,status,email_verified_at,created_at,updated_at)"
                     " VALUES (:id,'Cadence fixture',:email,'ACTIVE',:now,:now,:now)"),
                {"id": user, "email": user + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=user, organization_name="Cadence", workspace_name=_cuid(), now=now
            )
            await db.execute(
                text("UPDATE teams SET cycle_cadence_weeks=2 WHERE id=:id"),
                {"id": seed["team_id"]},
            )
            today = start_of_utc_day(now)
            # A cycle that ended before today and is still marked ACTIVE: the
            # scan has to close it rather than leave two cycles running.
            # VI: Một cycle đã kết thúc trước hôm nay mà vẫn đang ACTIVE: lượt
            # VI: quét phải đóng nó lại thay vì để hai cycle cùng chạy.
            await db.execute(
                text("INSERT INTO cycles(id,workspace_id,team_id,name,status,start_date,end_date,"
                     "created_at,updated_at)"
                     " VALUES (:id,:workspace,:team,'Cycle 1','ACTIVE',:start,:end,:now,:now)"),
                {"id": _cuid(), "workspace": seed["workspace_id"], "team": seed["team_id"],
                 "start": today - timedelta(days=30), "end": today - timedelta(days=17),
                 "now": now},
            )
            # A cycle covering today but still marked UPCOMING: the scan has to
            # activate exactly this one.
            # VI: Một cycle đang phủ hôm nay nhưng vẫn là UPCOMING: lượt quét
            # VI: phải kích hoạt đúng cycle này.
            covering = _cuid()
            await db.execute(
                text("INSERT INTO cycles(id,workspace_id,team_id,name,status,start_date,end_date,"
                     "created_at,updated_at)"
                     " VALUES (:id,:workspace,:team,'Cycle 2','UPCOMING',:start,:end,:now,:now)"),
                {"id": covering, "workspace": seed["workspace_id"], "team": seed["team_id"],
                 "start": today - timedelta(days=3), "end": today + timedelta(days=10),
                 "now": now},
            )
            await db.commit()

        reported = await run_cycle_cadence(factory, writes_enabled=False)
        assert reported["completed"] == 1 and reported["activated"] == 1
        async with factory() as db:
            # Reporting changed nothing: the stale cycle is still ACTIVE and the
            # covering one is still UPCOMING.
            # VI: Lượt báo cáo không đổi gì: cycle cũ vẫn ACTIVE và cycle đang
            # VI: phủ hôm nay vẫn UPCOMING.
            statuses = dict((await db.execute(
                text("SELECT name,status FROM cycles WHERE team_id=:team"),
                {"team": seed["team_id"]},
            )).all())
            assert statuses == {"Cycle 1": "ACTIVE", "Cycle 2": "UPCOMING"}

        result = await run_cycle_cadence(factory, writes_enabled=True)
        assert result["teams"] == 1 and result["completed"] == 1 and result["activated"] == 1
        assert result["created"] >= 1

        async with factory() as db:
            rows = (await db.execute(
                text("SELECT name,status,start_date,end_date FROM cycles WHERE team_id=:team"
                     " ORDER BY start_date"),
                {"team": seed["team_id"]},
            )).mappings().all()
            by_name = {row["name"]: row for row in rows}
            assert by_name["Cycle 1"]["status"] == "COMPLETED"
            assert by_name["Cycle 2"]["status"] == "ACTIVE"
            # The calendar reaches at least one cadence past today, and the
            # generated cycles butt up against each other without overlapping.
            # VI: Lịch kéo tới ít nhất một chu kỳ sau hôm nay, và các cycle được
            # VI: sinh ra nối sát nhau mà không chồng lên nhau.
            assert rows[-1]["end_date"] >= today + timedelta(days=14)
            for earlier, later in zip(rows, rows[1:]):
                assert later["start_date"] > earlier["end_date"]
            audits = (await db.execute(
                text("SELECT metadata FROM audit_logs WHERE workspace_id=:workspace"
                     " AND action='cycle.auto_generated'"),
                {"workspace": seed["workspace_id"]},
            )).scalars().all()
            assert len(audits) == result["created"]
            # The span goes into a jsonb column nothing re-serialises, so the
            # instants have to carry their offset. Counting the rows missed
            # this; a differential run against the worker being replaced caught
            # it, because that one wrote a UTC designator and this did not.
            # VI: Khoảng ngày đi vào cột jsonb không ai tuần tự hoá lại, nên các
            # VI: mốc thời gian phải mang theo offset của mình. Chỉ đếm số dòng
            # VI: thì bỏ sót điều này; một lượt chạy đối chiếu với worker đang
            # VI: được thay thế mới bắt được, vì bên đó có ghi chỉ báo UTC còn
            # VI: bên này thì không.
            for entry in audits:
                payload = json.loads(entry) if isinstance(entry, str) else entry
                for key in ("startDate", "endDate"):
                    assert datetime.fromisoformat(payload[key]).tzinfo is not None, (
                        key,
                        payload[key],
                    )
            total = len(rows)

        repeat = await run_cycle_cadence(factory, writes_enabled=True)
        assert repeat["created"] == 0 and repeat["activated"] == 0 and repeat["completed"] == 0
        async with factory() as db:
            assert (await db.execute(
                text("SELECT count(*) FROM cycles WHERE team_id=:team"), {"team": seed["team_id"]}
            )).scalar_one() == total
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
