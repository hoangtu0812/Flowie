import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

from app.core.config import _sync_interval
from app.jobs.scm_sync import scm_sync_loop, sync_due_connections


class FakeResult:
    def __init__(self, ids):
        self.ids = ids

    def scalars(self):
        return SimpleNamespace(all=lambda: self.ids)

    def scalar(self):
        return self.ids[0] if self.ids else None


class FakeSession:
    def __init__(self, due, not_due):
        self.due = due
        self.not_due = not_due

    async def __aenter__(self):
        return self

    async def __aexit__(self, *error):
        return False

    async def execute(self, statement, params):
        # The scan has no id; the re-check under the lock filters one id.
        # VI: Lượt quét không có id; lượt kiểm tra lại khi giữ lock lọc theo một id.
        if 'id' not in params:
            return FakeResult(self.due)
        return FakeResult([] if params['id'] in self.not_due else [params['id']])


def run_due(due, locked=(), not_due=(), failing=()):
    synced = []

    @asynccontextmanager
    async def lock(factory, connection_id):
        yield connection_id not in locked

    async def sync(db, connection_id, settings):
        if connection_id in failing:
            raise RuntimeError('provider unavailable')
        synced.append(connection_id)
        return {'repositories': 1, 'reviews': 1}

    count = asyncio.run(
        sync_due_connections(lambda: FakeSession(due, not_due), SimpleNamespace(), 300, sync=sync, lock=lock)
    )
    return count, synced


def test_periodic_sync_skips_connections_locked_by_another_sync():
    assert run_due(['a', 'b', 'c'], locked={'b'}) == (2, ['a', 'c'])


def test_periodic_sync_skips_a_connection_synchronized_after_the_scan():
    assert run_due(['a', 'b'], not_due={'a'}) == (1, ['b'])


def test_periodic_sync_continues_after_a_failed_connection():
    assert run_due(['a', 'b'], failing={'a'}) == (1, ['b'])


def test_scm_sync_loop_survives_a_failed_scan_and_stops_on_request():
    calls = []

    async def verify():
        stop = asyncio.Event()

        async def run(factory, settings, interval):
            calls.append(interval)
            if len(calls) == 1:
                raise RuntimeError('database unavailable')
            stop.set()
            return 0

        await asyncio.wait_for(
            scm_sync_loop(lambda: None, SimpleNamespace(scm_sync_interval_seconds=0.01), stop, run=run), 2
        )

    asyncio.run(verify())
    assert calls == [0.01, 0.01]


def test_sync_interval_is_off_by_default_and_never_below_a_minute():
    assert [_sync_interval(value) for value in (0, -5, 10, 300)] == [0, 0, 60, 300]
