"""Runs the retiring worker and its Python replacement over identical data.

The two are given byte-identical clones of one seeded database, made with
`CREATE DATABASE ... TEMPLATE`, and then every row either of them could have
written is compared. Agreement on counts is not enough: the first run of this
found the counts matching while the cycle audit metadata differed by a missing
UTC offset, which only a field-by-field comparison catches.

This works only while `apps/worker` still exists. DTD-519 phase 2 deletes it,
and with it the ability to make this comparison ever again.

VI: Cho worker sắp nghỉ và bản thay thế bằng Python cùng chạy trên dữ liệu
giống hệt nhau. Hai bên nhận hai bản sao giống nhau từng byte của một database
đã gieo, tạo bằng `CREATE DATABASE ... TEMPLATE`, rồi mọi dòng mà một trong hai
có thể đã ghi đều được so sánh. Khớp số đếm là chưa đủ: lần chạy đầu tiên của
công cụ này thấy số đếm khớp trong khi metadata audit của cycle lệch nhau ở chỗ
thiếu offset UTC, thứ chỉ phép so từng trường mới bắt được.

Công cụ này chỉ dùng được chừng nào `apps/worker` còn tồn tại. DTD-519 giai
đoạn 2 sẽ xoá nó, và xoá luôn khả năng thực hiện phép đối chiếu này.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url

from .fixture import EXPECTED_ARCHIVED, EXPECTED_CLOSED, seed, seed_cadence_work

ROOT = Path(__file__).resolve().parents[2]

# Everything either implementation writes. Comparing only the issue rows would
# have missed the audit metadata defect, so the side effects are in here too.
# VI: Mọi thứ mà một trong hai bản có thể ghi. Chỉ so các dòng issue thì đã bỏ
# VI: sót lỗi metadata audit, nên các tác dụng phụ cũng nằm trong này.
PROBES = {
    'issues': """SELECT issue.identifier || ' status=' || status.category
                        || ' canceled=' || (issue.canceled_at IS NOT NULL)::text
                        || ' archived=' || (issue.archived_at IS NOT NULL)::text
                 FROM issues issue JOIN issue_statuses status ON status.id = issue.status_id
                 ORDER BY issue.identifier""",
    'activities': """SELECT activity.type || ' on ' || issue.identifier
                            || ' data=' || COALESCE(activity.data::text, 'null')
                     FROM activities activity JOIN issues issue ON issue.id = activity.issue_id
                     WHERE activity.type LIKE 'issue.auto%'
                     ORDER BY activity.type, issue.identifier""",
    'notifications': """SELECT notification.type || ' on ' || issue.identifier
                        FROM notifications notification
                        JOIN issues issue ON issue.id = notification.entity_id
                        WHERE notification.type LIKE 'issue.auto%'
                        ORDER BY notification.type, issue.identifier""",
    'cycles': """SELECT name || ' ' || status || ' ' || start_date::date || '..' || end_date::date
                 FROM cycles ORDER BY start_date, name""",
    # Only the notation is normalised, never the meaning: a trailing `Z` with
    # optional fractional seconds becomes `+00:00`, because the worker spells
    # UTC that way and Python spells it the other. An instant with no offset at
    # all is a different meaning and must still show as a difference — casting
    # to timestamptz here would have hidden exactly that, by reading the naive
    # string in the server's own zone. That was the first defect this tool
    # found, so the comparison must stay able to find it again.
    # VI: Chỉ chuẩn hoá cách viết, không bao giờ chuẩn hoá ý nghĩa: hậu tố `Z`
    # VI: kèm phần giây lẻ tuỳ chọn được đổi thành `+00:00`, vì worker viết UTC
    # VI: kiểu này còn Python viết kiểu kia. Một mốc thời gian hoàn toàn không
    # VI: có offset mang ý nghĩa khác và vẫn phải lộ ra là khác biệt — ép sang
    # VI: timestamptz ở đây sẽ che đúng điều đó, bằng cách đọc chuỗi naive theo
    # VI: múi giờ của chính server. Đó là lỗi đầu tiên công cụ này tìm ra, nên
    # VI: phép so phải giữ được khả năng tìm lại nó.
    'cycle audits': """SELECT action
                              || ' team=' || COALESCE(metadata->>'teamId', '?')
                              || ' weeks=' || COALESCE(metadata->>'cadenceWeeks', '?')
                              || ' start=' || regexp_replace(regexp_replace(
                                   COALESCE(metadata->>'startDate', '?'), '\.\d+Z$', 'Z'), 'Z$', '+00:00')
                              || ' end=' || regexp_replace(regexp_replace(
                                   COALESCE(metadata->>'endDate', '?'), '\.\d+Z$', 'Z'), 'Z$', '+00:00')
                       FROM audit_logs WHERE action = 'cycle.auto_generated'
                       ORDER BY metadata->>'startDate'""",
}


def _admin_url(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, '/postgres', '', ''))


def _named(url: str, database: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, '/' + database, '', ''))


async def _admin(url: str, statements: list[str]) -> None:
    engine = create_async_engine(_async_database_url(_admin_url(url)), isolation_level='AUTOCOMMIT')
    try:
        async with engine.connect() as connection:
            for statement in statements:
                await connection.execute(text(statement))
    finally:
        await engine.dispose()


async def _probe(url: str, database: str) -> dict[str, list[str]]:
    engine = create_async_engine(_async_database_url(_named(url, database)))
    try:
        async with engine.connect() as connection:
            return {
                name: [row for (row,) in (await connection.execute(text(query))).all()]
                for name, query in PROBES.items()
            }
    finally:
        await engine.dispose()


def _run_worker(url: str, database: str, which: str) -> dict[str, int]:
    """Drives the worker through its harness, which only tsx can run.

    pnpm writes both a POSIX shim and a `.CMD` wrapper into `.bin`; Windows can
    only start the second, so the right one is chosen here rather than left to
    the shell.

    VI: pnpm ghi cả shim POSIX lẫn bản bọc `.CMD` vào `.bin`; Windows chỉ khởi
    động được cái thứ hai, nên chọn đúng bản ở đây chứ không phó mặc cho shell.
    """
    binary = ROOT / 'apps/worker/node_modules/.bin' / ('tsx.CMD' if sys.platform == 'win32' else 'tsx')
    if not binary.exists():
        raise SystemExit(f'{binary} is missing: run pnpm install first.')
    completed = subprocess.run(
        [str(binary), 'differential-harness.ts', which],
        cwd=ROOT / 'apps/worker', capture_output=True, text=True,
        env={**_subprocess_env(), 'DATABASE_URL': _named(url, database)},
    )
    if completed.returncode != 0:
        raise SystemExit(f'The worker harness failed:\n{completed.stdout}\n{completed.stderr}')
    return json.loads(completed.stdout.strip().splitlines()[-1])


def _subprocess_env() -> dict[str, str]:
    import os

    return dict(os.environ)


async def _run_python(url: str, database: str, which: str) -> dict[str, object]:
    from app.jobs.cycle_cadence import run_cycle_cadence
    from app.jobs.team_policies import run_team_policies

    engine = create_async_engine(_async_database_url(_named(url, database)))
    try:
        factory = async_sessionmaker(engine)
        if which == 'cadence':
            return await run_cycle_cadence(factory, writes_enabled=True)
        result = await run_team_policies(factory, writes_enabled=True)
        return {key: value for key, value in result.items() if key != 'planned'}
    finally:
        await engine.dispose()


def _report(stage: str, worker: dict, python: dict,
            worker_rows: dict[str, list[str]], python_rows: dict[str, list[str]]) -> bool:
    print(f'\n=== {stage} ===')
    print(f'  worker counts: {json.dumps(worker, sort_keys=True)}')
    print(f'  python counts: {json.dumps(python, sort_keys=True)}')
    agreed = True
    for name in PROBES:
        left, right = worker_rows[name], python_rows[name]
        if left == right:
            print(f'  {name}: {len(left)} row(s) identical')
            continue
        agreed = False
        print(f'  {name}: DIFFERENT')
        for row in sorted(set(left) - set(right)):
            print(f'    worker only: {row}')
        for row in sorted(set(right) - set(left)):
            print(f'    python only: {row}')
    return agreed


async def main(url: str) -> int:
    parts = urlsplit(url)
    if parts.hostname not in {'localhost', '127.0.0.1', '::1'} or not (parts.path or '').startswith('/flowie_'):
        raise SystemExit('This drops and recreates databases: point it at a loopback flowie_* database.')
    base, worker_db, python_db = 'retention_diff_base', 'retention_diff_worker', 'retention_diff_python'

    await _admin(url, [f'DROP DATABASE IF EXISTS {name}' for name in (worker_db, python_db, base)]
                 + [f'CREATE DATABASE {base}'])
    migrate = subprocess.run(
        ['pnpm', '--filter', '@circle/database', 'exec', 'prisma', 'migrate', 'deploy',
         '--schema', 'prisma/schema.prisma'],
        cwd=ROOT, capture_output=True, text=True, shell=sys.platform == 'win32',
        env={**_subprocess_env(), 'DATABASE_URL': _named(url, base)},
    )
    if migrate.returncode != 0:
        raise SystemExit(f'Migrating the base database failed:\n{migrate.stdout}\n{migrate.stderr}')

    engine = create_async_engine(_async_database_url(_named(url, base)))
    async with async_sessionmaker(engine)() as db:
        await seed(db)
    await engine.dispose()

    agreed = True
    for stage, which in (('retention policies', 'policies'), ('cycle cadence', 'cadence')):
        if which == 'cadence':
            engine = create_async_engine(_async_database_url(_named(url, base)))
            async with async_sessionmaker(engine)() as db:
                await seed_cadence_work(db)
            await engine.dispose()
        await _admin(url, [
            f'DROP DATABASE IF EXISTS {worker_db}', f'DROP DATABASE IF EXISTS {python_db}',
            f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{base}' AND pid<>pg_backend_pid()",
            f'CREATE DATABASE {worker_db} TEMPLATE {base}',
            f'CREATE DATABASE {python_db} TEMPLATE {base}',
        ])
        worker = _run_worker(url, worker_db, which)
        python = await _run_python(url, python_db, which)
        python_rows = await _probe(url, python_db)
        agreed &= _report(stage, worker, python, await _probe(url, worker_db), python_rows)
        if which == 'policies':
            # Kept from this stage: the cadence stage re-clones from the base,
            # where no retention run has happened, so reading it afterwards
            # would ask the wrong database what the policies decided.
            # VI: Giữ lại từ giai đoạn này: giai đoạn cadence nhân bản lại từ
            # VI: database gốc, nơi chưa lượt retention nào chạy, nên đọc nó sau
            # VI: đó là hỏi nhầm database về quyết định của chính sách.
            retention_rows = python_rows

    closed = {row.split(' ')[0] for row in retention_rows['issues'] if 'canceled=true' in row}
    archived = {row.split(' ')[0] for row in retention_rows['issues'] if 'archived=true' in row}
    print(f'\n  issues cancelled: {sorted(closed)} (fixture expects {sorted(EXPECTED_CLOSED)})')
    print(f'  issues archived:  {sorted(archived)} (fixture expects {sorted(EXPECTED_ARCHIVED)})')
    if closed != set(EXPECTED_CLOSED) or archived != set(EXPECTED_ARCHIVED):
        # Both sides agreeing on the wrong answer is still the wrong answer.
        # VI: Hai bên cùng đồng ý một đáp án sai thì vẫn là đáp án sai.
        print('\nBoth implementations agreed, but not with the fixture.')
        agreed = False

    print('\nThe two implementations agree.' if agreed else '\nThe two implementations DIFFER.')
    return 0 if agreed else 1


def run(url: str) -> int:
    return asyncio.run(main(url))
