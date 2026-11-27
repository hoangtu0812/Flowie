import asyncio
from dataclasses import replace

import httpx

from app.core.config import Settings
from app.modules.sandbox import api as sandbox_api
from app.modules.sandbox import idle

TOKEN = 'm' * 64
NOW = 1_800_000_000.0  # 2027-01-15T08:00:00Z
BUSY = 'cbusy00000000000000000000'
SILENT = 'csilent000000000000000000'
BROKEN = 'cbroken000000000000000000'
FRESH = 'cfresh0000000000000000000'


def iso(seconds_ago: float) -> str:
    from datetime import UTC, datetime

    return datetime.fromtimestamp(NOW - seconds_ago, UTC).strftime('%Y-%m-%dT%H:%M:%S.123456789Z')


def test_last_activity_takes_the_latest_input_or_output_and_trusts_unknown_starts():
    assert idle.last_activity(iso(7200), [], NOW) == NOW - 7200
    sessions = [{'activity': NOW - 3000, 'output': NOW - 600}, {'activity': NOW - 5000, 'output': None}]
    assert idle.last_activity(iso(7200), sessions, NOW) == NOW - 600
    assert idle.last_activity(None, [], NOW) == NOW
    assert idle.last_activity('garbage', [], NOW) == NOW


def test_only_sandboxes_idle_past_the_limit_are_stopped(monkeypatch):
    settings = replace(Settings.from_environment(), sandbox_manager_token=TOKEN, sandbox_idle_minutes=60)
    running = [
        {'userId': BUSY, 'state': 'running', 'startedAt': iso(7200)},
        {'userId': SILENT, 'state': 'running', 'startedAt': iso(7200)},
        {'userId': BROKEN, 'state': 'running', 'startedAt': iso(7200)},
        {'userId': FRESH, 'state': 'running', 'startedAt': iso(600)},
    ]
    sessions = {
        BUSY: [{'name': 'DTD-1', 'activity': NOW - 5000, 'output': NOW - 120}],
        SILENT: [{'name': 'DTD-2', 'activity': NOW - 4000, 'output': NOW - 3700}],
        FRESH: [],
    }
    stopped = []

    def handler(request):
        if request.url.port == 4100:
            if request.method == 'GET':
                return httpx.Response(200, json=running)
            stopped.append(request.url.path.split('/')[2])
            return httpx.Response(200, json={'state': 'exited'})
        user_id = request.url.host.removeprefix('flowie-sandbox-')
        assert request.url.path == '/api/sessions'
        assert request.headers['x-termi-token'] == sandbox_api.termi_token(TOKEN, user_id)
        if user_id == BROKEN:
            raise httpx.ConnectError('down')
        return httpx.Response(200, json=sessions[user_id])

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    result = asyncio.run(idle.stop_idle_sandboxes(settings, now=lambda: NOW))
    assert result == stopped == [SILENT, BROKEN]
