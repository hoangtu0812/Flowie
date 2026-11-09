"""Seeds one team whose retention policies have real work to do.

Every issue here is already stale by date; each differs in exactly one way
that should protect it. That is deliberate — if the two implementations are
only ever asked easy questions they will always agree, and the comparison
proves nothing. The production database has no team with a policy configured
at all, which is why this fixture exists rather than an observation window.

Identifiers are fixed and readable so the two runs can be diffed by name.

VI: Gieo một team mà chính sách lưu giữ của nó có việc thật để làm. Mọi issue ở
đây đều đã cũ xét theo ngày; mỗi cái khác nhau đúng một điểm lẽ ra phải bảo vệ
nó. Đó là cố ý — nếu hai bản cài đặt chỉ bị hỏi những câu dễ thì chúng luôn
đồng ý với nhau và phép đối chiếu không chứng minh được gì. Database production
không có team nào bật chính sách, nên mới cần bộ dữ liệu này thay cho một vòng
quan sát.

Identifier được đặt cố định và dễ đọc để hai lượt chạy so được theo tên.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import _utcnow
from app.core.identifiers import _cuid
from app.domains.auth import create_workspace_bootstrap

AUTO_CLOSE_DAYS = 30
AUTO_ARCHIVE_DAYS = 90
CADENCE_WEEKS = 2

# What each side must decide. Everything not named here must be left alone.
# VI: Những gì mỗi bên phải quyết định. Mọi thứ không nêu ở đây đều phải để yên.
EXPECTED_CLOSED = ('D-CLOSE-OK',)
EXPECTED_ARCHIVED = ('D-ARCH-OK',)


async def seed(db: AsyncSession) -> dict[str, str]:
    now = _utcnow()
    stale_open = now - timedelta(days=4 * AUTO_CLOSE_DAYS)
    stale_done = now - timedelta(days=2 * AUTO_ARCHIVE_DAYS + 20)
    soon = now + timedelta(days=5)
    user = _cuid()
    await db.execute(
        text(
            "INSERT INTO users(id,name,email,status,email_verified_at,created_at,updated_at)"
            " VALUES (:id,'Differential owner',:email,'ACTIVE',:now,:now,:now)"
        ),
        {'id': user, 'email': user + '@example.test', 'now': now},
    )
    seeded = await create_workspace_bootstrap(
        db, user_id=user, organization_name='Differential',
        workspace_name='retention-diff-' + _cuid(), now=now,
    )
    workspace, team = seeded['workspace_id'], seeded['team_id']
    await db.execute(
        text(
            "UPDATE teams SET auto_close_days=:close, auto_archive_days=:archive,"
            " cycle_cadence_weeks=:weeks WHERE id=:id"
        ),
        {'close': AUTO_CLOSE_DAYS, 'archive': AUTO_ARCHIVE_DAYS,
         'weeks': CADENCE_WEEKS, 'id': team},
    )

    async def status_of(category: str) -> str:
        return (await db.execute(
            text("SELECT id FROM issue_statuses WHERE workspace_id=:workspace"
                 " AND category=:category ORDER BY position LIMIT 1"),
            {'workspace': workspace, 'category': category},
        )).scalar_one()

    open_status, done_status = await status_of('UNSTARTED'), await status_of('COMPLETED')
    counter = {'n': 0}

    async def issue(identifier: str, status: str, updated, **columns) -> str:
        counter['n'] += 1
        issue_id = _cuid()
        await db.execute(
            text(
                "INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,"
                "creator_id,parent_issue_id,due_date,completed_at,priority,created_at,updated_at)"
                " VALUES (:id,:workspace,:team,:status,:identifier,:number,:title,:user,"
                ":parent,:due,:completed,:priority,:updated,:updated)"
            ),
            {'id': issue_id, 'workspace': workspace, 'team': team, 'status': status,
             'identifier': identifier, 'number': counter['n'],
             'title': 'Differential ' + identifier, 'user': user,
             'parent': columns.get('parent'), 'due': columns.get('due'),
             'completed': columns.get('completed'),
             'priority': columns.get('priority', 'MEDIUM'), 'updated': updated},
        )
        return issue_id

    async def cycle(name: str, status: str, start, end) -> str:
        cycle_id = _cuid()
        await db.execute(
            text("INSERT INTO cycles(id,workspace_id,team_id,name,status,start_date,end_date,"
                 "created_at,updated_at)"
                 " VALUES (:id,:workspace,:team,:name,:status,:start,:end,:now,:now)"),
            {'id': cycle_id, 'workspace': workspace, 'team': team, 'name': name,
             'status': status, 'start': start, 'end': end, 'now': now},
        )
        return cycle_id

    # Auto-close: one issue nothing protects, and one per protection.
    # VI: Tự đóng: một issue không gì bảo vệ, và mỗi loại bảo vệ một issue.
    closable = await issue('D-CLOSE-OK', open_status, stale_open)
    commented = await issue('D-CLOSE-COMMENT', open_status, stale_open)
    acted_on = await issue('D-CLOSE-ACTIVITY', open_status, stale_open)
    has_child = await issue('D-CLOSE-HASCHILD', open_status, stale_open)
    in_active_cycle = await issue('D-CLOSE-CYCLE', open_status, stale_open)
    await issue('D-CLOSE-DUE', open_status, stale_open, due=soon)
    await issue('D-CLOSE-SLA', open_status, stale_open, priority='URGENT')
    # The child protects its parent and must stay out of reach itself, or it is
    # closed on this pass and the parent becomes eligible on the next one.
    # VI: Đứa con bảo vệ issue cha và bản thân nó phải nằm ngoài tầm với, nếu
    # VI: không nó bị đóng ngay lượt này và issue cha đủ điều kiện ở lượt sau.
    await issue('D-CLOSE-CHILD', open_status, stale_open, parent=has_child, due=soon)

    await db.execute(
        text("INSERT INTO comments(id,issue_id,author_id,content,created_at,updated_at)"
             " VALUES (:id,:issue,:user,'still relevant',:now,:now)"),
        {'id': _cuid(), 'issue': commented, 'user': user, 'now': now},
    )
    await db.execute(
        text("INSERT INTO activities(id,workspace_id,issue_id,actor_id,type,created_at)"
             " VALUES (:id,:workspace,:issue,:user,'issue.updated',:now)"),
        {'id': _cuid(), 'workspace': workspace, 'issue': acted_on, 'user': user, 'now': now},
    )
    # Scoped to URGENT so it covers one issue rather than the whole team.
    # VI: Giới hạn theo URGENT để nó chỉ bao một issue thay vì cả team.
    await db.execute(
        text("INSERT INTO sla_policies(id,workspace_id,name,team_id,priority,deadline_minutes,"
             "enabled,created_by,created_at,updated_at)"
             " VALUES (:id,:workspace,'Urgent support',:team,'URGENT',240,true,:user,:now,:now)"),
        {'id': _cuid(), 'workspace': workspace, 'team': team, 'user': user, 'now': now},
    )
    running = await cycle('Running', 'ACTIVE', now - timedelta(days=3), now + timedelta(days=3))
    await db.execute(
        text("INSERT INTO issue_cycles(issue_id,cycle_id,created_at) VALUES (:issue,:cycle,:now)"),
        {'issue': in_active_cycle, 'cycle': running, 'now': now},
    )

    # Auto-archive: one settled issue, and one per thing still moving.
    # VI: Tự lưu trữ: một issue đã chốt, và mỗi thứ còn chuyển động một issue.
    await issue('D-ARCH-OK', done_status, stale_done, completed=stale_done)
    archive_parent = await issue('D-ARCH-HASOPENCHILD', done_status, stale_done,
                                 completed=stale_done)
    await issue('D-ARCH-OPENCHILD', open_status, stale_done, parent=archive_parent, due=soon)
    open_parent = await issue('D-ARCH-OPENPARENT', open_status, stale_done, due=soon)
    await issue('D-ARCH-UNDEROPEN', done_status, stale_done, completed=stale_done,
                parent=open_parent)
    in_upcoming = await issue('D-ARCH-UPCOMING', done_status, stale_done, completed=stale_done)
    planned = await cycle('Planned', 'UPCOMING', now + timedelta(days=10),
                          now + timedelta(days=24))
    await db.execute(
        text("INSERT INTO issue_cycles(issue_id,cycle_id,created_at) VALUES (:issue,:cycle,:now)"),
        {'issue': in_upcoming, 'cycle': planned, 'now': now},
    )

    # Someone who asked to hear when an issue is completed, so the notification
    # path is exercised on both sides rather than skipped.
    # VI: Một người đã bật nhận thông báo khi issue hoàn thành, để đường đi
    # VI: thông báo được chạy ở cả hai bên chứ không bị bỏ qua.
    await db.execute(
        text("INSERT INTO issue_subscriptions(issue_id,user_id,created_at)"
             " VALUES (:issue,:user,:now)"),
        {'issue': closable, 'user': user, 'now': now},
    )
    await db.execute(
        text("INSERT INTO notification_preferences(workspace_id,user_id,issue_completed,"
             "created_at,updated_at) VALUES (:workspace,:user,true,:now,:now)"),
        {'workspace': workspace, 'user': user, 'now': now},
    )
    await db.commit()
    return {'workspace_id': workspace, 'team_id': team, 'user_id': user}


async def seed_cadence_work(db: AsyncSession) -> None:
    """Leaves the team's calendar needing all three cadence operations.

    One cycle ended while still marked running, one covering today is still
    marked upcoming, and the calendar stops short of the horizon. Without this
    the cadence run has nothing to do and both sides agree on an empty set.

    VI: Để lại lịch của team ở trạng thái cần cả ba thao tác nhịp cycle. Một
    cycle đã kết thúc mà vẫn đang chạy, một cycle phủ hôm nay vẫn còn là sắp
    tới, và lịch chưa chạm tầm nhìn. Thiếu bước này thì lượt chạy nhịp cycle
    không có việc gì và hai bên đồng ý với nhau trên một tập rỗng.
    """
    today = (await db.execute(text("SELECT date_trunc('day', now() AT TIME ZONE 'UTC')"))).scalar_one()
    team = (await db.execute(
        text('SELECT id FROM teams WHERE cycle_cadence_weeks IS NOT NULL LIMIT 1')
    )).scalar_one()
    await db.execute(text('DELETE FROM issue_cycles'))
    await db.execute(text('DELETE FROM cycles WHERE team_id=:team'), {'team': team})
    workspace = (await db.execute(
        text('SELECT workspace_id FROM teams WHERE id=:team'), {'team': team}
    )).scalar_one()
    for name, status, start, end in (
        ('Cycle 1', 'ACTIVE', today - timedelta(days=30), today - timedelta(days=17)),
        ('Cycle 2', 'UPCOMING', today - timedelta(days=1), today + timedelta(days=2)),
    ):
        await db.execute(
            text("INSERT INTO cycles(id,workspace_id,team_id,name,status,start_date,end_date,"
                 "created_at,updated_at)"
                 " VALUES (:id,:workspace,:team,:name,CAST(:status AS \"CycleStatus\"),"
                 ":start,:end,now(),now())"),
            {'id': _cuid(), 'workspace': workspace, 'team': team, 'name': name,
             'status': status, 'start': start, 'end': end},
        )
    await db.commit()
