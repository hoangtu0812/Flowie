import asyncio
import os
from datetime import timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import _utcnow
from app.core.config import _async_database_url
from app.core.identifiers import _cuid
from app.domains.auth import create_workspace_bootstrap
from app.jobs.team_policies import policy_cutoff, run_team_policies


def test_policy_cutoff_uses_exact_whole_day_intervals():
    from datetime import datetime

    now = datetime(2026, 8, 24, 12, 30)
    assert policy_cutoff(now, 30) == datetime(2026, 7, 25, 12, 30)


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_auto_close_eligibility_notification_and_idempotence():
    asyncio.run(verify_auto_close())


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_auto_archive_eligibility_and_reporting_run_writes_nothing():
    asyncio.run(verify_auto_archive())


def _engine():
    return create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))


async def _seed_workspace(db, user, now, *, auto_close=None, auto_archive=None):
    await db.execute(
        text(
            "INSERT INTO users(id,name,email,status,email_verified_at,created_at,updated_at)"
            " VALUES (:id,'Policy fixture',:email,'ACTIVE',:now,:now,:now)"
        ),
        {"id": user, "email": user + "@example.test", "now": now},
    )
    seed = await create_workspace_bootstrap(
        db, user_id=user, organization_name="Policies", workspace_name=_cuid(), now=now
    )
    await db.execute(
        text(
            "UPDATE teams SET auto_close_days=:close, auto_archive_days=:archive WHERE id=:id"
        ),
        {"close": auto_close, "archive": auto_archive, "id": seed["team_id"]},
    )
    return seed


async def _status(db, workspace, category):
    return (
        await db.execute(
            text(
                "SELECT id FROM issue_statuses WHERE workspace_id=:workspace AND category=:category"
                " ORDER BY position LIMIT 1"
            ),
            {"workspace": workspace, "category": category},
        )
    ).scalar_one()


async def _issue(db, seed, user, *, number, identifier, status, updated, **columns):
    issue = _cuid()
    await db.execute(
        text(
            "INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,creator_id,"
            "parent_issue_id,due_date,completed_at,canceled_at,created_at,updated_at)"
            " VALUES (:id,:workspace,:team,:status,:identifier,:number,:title,:user,"
            ":parent,:due,:completed,:canceled,:updated,:updated)"
        ),
        {
            "id": issue,
            "workspace": seed["workspace_id"],
            "team": seed["team_id"],
            "status": status,
            "identifier": identifier,
            "number": number,
            "title": "Policy " + identifier,
            "user": user,
            "parent": columns.get("parent"),
            "due": columns.get("due"),
            "completed": columns.get("completed"),
            "canceled": columns.get("canceled"),
            "updated": updated,
        },
    )
    return issue


async def _cycle(db, seed, status, now):
    cycle = _cuid()
    await db.execute(
        text(
            "INSERT INTO cycles(id,workspace_id,team_id,name,status,start_date,end_date,created_at,updated_at)"
            " VALUES (:id,:workspace,:team,:name,:status,:start,:end,:now,:now)"
        ),
        {
            "id": cycle,
            "workspace": seed["workspace_id"],
            "team": seed["team_id"],
            "name": "Cycle " + cycle[:6],
            "status": status,
            "start": now - timedelta(days=3),
            "end": now + timedelta(days=3),
            "now": now,
        },
    )
    return cycle


async def verify_auto_close():
    """Only the genuinely abandoned issue is cancelled.

    Every other issue in the fixture is stale by date alone and differs in
    exactly one way — a fresh comment, a fresh activity, an open sub-issue, a
    running cycle, a due date still ahead, a covering SLA. Each of those is a
    separate branch of the eligibility query, so a branch dropped in the port
    shows up here as an issue closed that should have been left alone.

    VI: Chỉ issue thực sự bị bỏ rơi mới bị huỷ. Mọi issue khác trong bộ dữ liệu
    đều đã cũ xét theo ngày và chỉ khác đúng một điểm — một comment mới, một
    activity mới, một sub-issue còn mở, một cycle đang chạy, một ngày đến hạn
    còn ở phía trước, một SLA đang bao phủ. Mỗi điểm là một nhánh riêng của
    truy vấn eligibility, nên một nhánh bị bỏ sót khi port sẽ lộ ra ở đây dưới
    dạng một issue bị đóng trong khi lẽ ra phải để yên.
    """
    engine = _engine()
    factory = async_sessionmaker(engine)
    user = _cuid()
    seed = None
    try:
        async with factory() as db:
            now = _utcnow()
            old = now - timedelta(days=120)
            seed = await _seed_workspace(db, user, now, auto_close=30)
            open_status = await _status(db, seed["workspace_id"], "UNSTARTED")
            done_status = await _status(db, seed["workspace_id"], "COMPLETED")

            stale = await _issue(db, seed, user, number=1, identifier="POL-1",
                                 status=open_status, updated=old)
            commented = await _issue(db, seed, user, number=2, identifier="POL-2",
                                     status=open_status, updated=old)
            with_activity = await _issue(db, seed, user, number=3, identifier="POL-3",
                                         status=open_status, updated=old)
            parent = await _issue(db, seed, user, number=4, identifier="POL-4",
                                  status=open_status, updated=old)
            in_cycle = await _issue(db, seed, user, number=5, identifier="POL-5",
                                    status=open_status, updated=old)
            await _issue(db, seed, user, number=6, identifier="POL-6",
                         status=open_status, updated=old,
                         due=now + timedelta(days=5))
            # POL-7 keeps POL-4 out of reach by being an open child. Its own due
            # date is ahead so the scan does not simply close it too, which
            # would make the parent eligible on the very next run.
            # VI: POL-7 giữ POL-4 ngoài tầm với nhờ là đứa con còn mở. Ngày đến
            # VI: hạn của chính nó ở phía trước để lượt quét không đóng luôn nó,
            # VI: vì như thế thì issue cha sẽ đủ điều kiện ngay lượt sau.
            await _issue(db, seed, user, number=7, identifier="POL-7",
                         status=open_status, updated=old, parent=parent,
                         due=now + timedelta(days=5))
            # A closed sub-issue must not protect its parent, so POL-4 stays
            # eligible only because of the open child above.
            # VI: Sub-issue đã đóng không được bảo vệ issue cha, nên POL-4 chỉ
            # VI: còn ở ngoài diện xử lý nhờ đứa con còn mở ở trên.
            await _issue(db, seed, user, number=8, identifier="POL-8",
                         status=done_status, updated=old, parent=stale)

            await db.execute(
                text("INSERT INTO comments(id,issue_id,author_id,content,created_at,updated_at)"
                     " VALUES (:id,:issue,:user,'still relevant',:now,:now)"),
                {"id": _cuid(), "issue": commented, "user": user, "now": now},
            )
            await db.execute(
                text("INSERT INTO activities(id,workspace_id,issue_id,actor_id,type,created_at)"
                     " VALUES (:id,:workspace,:issue,:user,'issue.updated',:now)"),
                {"id": _cuid(), "workspace": seed["workspace_id"], "issue": with_activity,
                 "user": user, "now": now},
            )
            cycle = await _cycle(db, seed, "ACTIVE", now)
            await db.execute(
                text("INSERT INTO issue_cycles(issue_id,cycle_id,created_at)"
                     " VALUES (:issue,:cycle,:now)"),
                {"issue": in_cycle, "cycle": cycle, "now": now},
            )
            await db.execute(
                text("INSERT INTO issue_subscriptions(issue_id,user_id,created_at)"
                     " VALUES (:issue,:user,:now)"),
                {"issue": stale, "user": user, "now": now},
            )
            await db.execute(
                text("INSERT INTO notification_preferences(workspace_id,user_id,issue_completed,"
                     "created_at,updated_at) VALUES (:workspace,:user,true,:now,:now)"),
                {"workspace": seed["workspace_id"], "user": user, "now": now},
            )
            await db.commit()

        result = await run_team_policies(factory, writes_enabled=True)
        assert result["closed"] == 1 and result["archived"] == 0

        async with factory() as db:
            canceled = (await db.execute(
                text("SELECT identifier FROM issues issue JOIN issue_statuses status"
                     " ON status.id=issue.status_id WHERE issue.workspace_id=:workspace"
                     " AND status.category='CANCELED' ORDER BY identifier"),
                {"workspace": seed["workspace_id"]},
            )).scalars().all()
            assert canceled == ["POL-1"]
            assert (await db.execute(
                text("SELECT canceled_at IS NOT NULL FROM issues WHERE id=:id"), {"id": stale}
            )).scalar_one()
            assert (await db.execute(
                text("SELECT count(*) FROM activities WHERE issue_id=:id AND type='issue.auto_closed'"),
                {"id": stale},
            )).scalar_one() == 1
            assert (await db.execute(
                text("SELECT count(*) FROM notifications WHERE entity_id=:id"
                     " AND type='issue.auto_closed'"),
                {"id": stale},
            )).scalar_one() == 1

        # Running again must find nothing: the issue is cancelled, and the others
        # are still protected.
        # VI: Chạy lại phải không thấy gì: issue đã bị huỷ, còn những issue kia
        # VI: vẫn đang được bảo vệ.
        assert (await run_team_policies(factory, writes_enabled=True))["closed"] == 0

        # An enabled SLA covering the team keeps even a genuinely stale issue
        # open, because the policy is a promise to someone.
        # VI: Một SLA đang bật bao phủ team sẽ giữ mở cả một issue thực sự đã cũ,
        # VI: vì policy đó là lời hứa với một người.
        async with factory() as db:
            await db.execute(
                text("UPDATE issues SET status_id=:status, canceled_at=NULL, updated_at=:old"
                     " WHERE id=:id"),
                {"status": open_status, "old": old, "id": stale},
            )
            await db.execute(
                text("DELETE FROM activities WHERE issue_id=:id"), {"id": stale})
            await db.execute(
                text("INSERT INTO sla_policies(id,workspace_id,name,team_id,deadline_minutes,"
                     "enabled,created_by,created_at,updated_at)"
                     " VALUES (:id,:workspace,'Support',:team,240,true,:user,:now,:now)"),
                {"id": _cuid(), "workspace": seed["workspace_id"], "team": seed["team_id"],
                 "user": user, "now": _utcnow()},
            )
            await db.commit()
        assert (await run_team_policies(factory, writes_enabled=True))["closed"] == 0
    finally:
        await _cleanup(factory, engine, seed, user)


async def verify_auto_archive():
    """A settled issue is archived; anything still moving above or below is not.

    The reporting run is checked first against the same fixture: it must name
    the issue it would archive and leave the row untouched, because that is the
    evidence the maintainer compares against the worker before writes are
    switched on.

    VI: Một issue đã chốt thì được lưu trữ; thứ gì còn chuyển động phía trên hay
    phía dưới thì không. Lượt chạy chỉ báo cáo được kiểm trước trên cùng bộ dữ
    liệu: nó phải nêu tên issue nó định lưu trữ và không đụng vào dòng đó, vì
    đấy chính là bằng chứng người bảo trì dùng để đối chiếu với worker trước khi
    bật ghi.
    """
    engine = _engine()
    factory = async_sessionmaker(engine)
    user = _cuid()
    seed = None
    try:
        async with factory() as db:
            now = _utcnow()
            old = now - timedelta(days=200)
            seed = await _seed_workspace(db, user, now, auto_archive=90)
            open_status = await _status(db, seed["workspace_id"], "UNSTARTED")
            done_status = await _status(db, seed["workspace_id"], "COMPLETED")

            settled = await _issue(db, seed, user, number=1, identifier="ARC-1",
                                   status=done_status, updated=old, completed=old)
            open_parent = await _issue(db, seed, user, number=2, identifier="ARC-2",
                                       status=open_status, updated=old)
            await _issue(db, seed, user, number=3, identifier="ARC-3",
                         status=done_status, updated=old, completed=old, parent=open_parent)
            with_open_child = await _issue(db, seed, user, number=4, identifier="ARC-4",
                                           status=done_status, updated=old, completed=old)
            await _issue(db, seed, user, number=5, identifier="ARC-5",
                         status=open_status, updated=old, parent=with_open_child)
            upcoming = await _issue(db, seed, user, number=6, identifier="ARC-6",
                                    status=done_status, updated=old, completed=old)
            cycle = await _cycle(db, seed, "UPCOMING", now)
            await db.execute(
                text("INSERT INTO issue_cycles(issue_id,cycle_id,created_at)"
                     " VALUES (:issue,:cycle,:now)"),
                {"issue": upcoming, "cycle": cycle, "now": now},
            )
            await db.commit()

        reported = await run_team_policies(factory, writes_enabled=False)
        assert reported["planned"]["archived"] == ["ARC-1"]
        assert reported["archived"] == 1
        async with factory() as db:
            assert (await db.execute(
                text("SELECT count(*) FROM issues WHERE workspace_id=:workspace"
                     " AND archived_at IS NOT NULL"),
                {"workspace": seed["workspace_id"]},
            )).scalar_one() == 0
            assert (await db.execute(
                text("SELECT count(*) FROM activities WHERE workspace_id=:workspace"
                     " AND type='issue.auto_archived'"),
                {"workspace": seed["workspace_id"]},
            )).scalar_one() == 0

        result = await run_team_policies(factory, writes_enabled=True)
        assert result["archived"] == 1 and result["closed"] == 0
        async with factory() as db:
            archived = (await db.execute(
                text("SELECT identifier FROM issues WHERE workspace_id=:workspace"
                     " AND archived_at IS NOT NULL ORDER BY identifier"),
                {"workspace": seed["workspace_id"]},
            )).scalars().all()
            assert archived == ["ARC-1"]
            # Archiving notifies the creator and does not consult the completion
            # preference, which this fixture never created.
            # VI: Việc lưu trữ báo cho người tạo và không xét tuỳ chọn thông báo
            # VI: hoàn thành, thứ mà bộ dữ liệu này chưa từng tạo.
            assert (await db.execute(
                text("SELECT user_id FROM notifications WHERE entity_id=:id"
                     " AND type='issue.auto_archived'"),
                {"id": settled},
            )).scalar_one() == user

        assert (await run_team_policies(factory, writes_enabled=True))["archived"] == 0
    finally:
        await _cleanup(factory, engine, seed, user)


async def _cleanup(factory, engine, seed, user):
    async with factory() as db:
        if seed:
            await db.execute(
                text("DELETE FROM organizations WHERE id=:id"), {"id": seed["organization_id"]}
            )
        await db.execute(text("DELETE FROM users WHERE id=:id"), {"id": user})
        await db.commit()
    await engine.dispose()
