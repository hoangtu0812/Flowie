"""Stops sandboxes nobody has used for SANDBOX_IDLE_MINUTES (docs/sandbox.md).

Use means terminal input or output in any of the sandbox's tmux sessions, which
termi reports per session. An agent that is still working prints to its screen,
so it is never stopped mid-task; a tab that is merely open is not use. The home
volume stays, so the next Start or "Open with…" brings everything back.
VI: Dừng các sandbox không ai dùng trong SANDBOX_IDLE_MINUTES phút (docs/sandbox.md).
VI: Dùng nghĩa là có nhập hoặc output terminal trong bất kỳ phiên tmux nào của sandbox,
VI: termi báo theo từng phiên. Agent còn đang làm việc thì in ra màn hình nên không bao
VI: giờ bị dừng giữa chừng; chỉ mở tab thì không tính là dùng. Volume home được giữ, nên
VI: lần Khởi động hoặc "Mở bằng…" sau sẽ có lại mọi thứ.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import datetime
from typing import Any

import httpx

from ...core.config import Settings
from ...sandbox_manager import TERMI_PORT, container_name
from .api import _manager, _upstream_headers

logger = logging.getLogger(__name__)

CHECK_SECONDS = 300


def _epoch(started_at: str | None, now: float) -> float:
    # Docker writes nanoseconds, which fromisoformat rejects; seconds are enough here.
    # VI: Docker ghi tới nano giây, fromisoformat không nhận; ở đây chỉ cần giây.
    try:
        return datetime.fromisoformat(f'{(started_at or "")[:19]}+00:00').timestamp()
    except ValueError:
        return now  # Unknown start: count it as fresh rather than stop it.


def last_activity(started_at: str | None, sessions: list[dict[str, Any]], now: float) -> float:
    """The latest of the container start and each session's input and output, in epoch seconds.
    VI: Mốc muộn nhất giữa lúc container khởi động và nhập/output của từng phiên, tính bằng giây epoch."""
    moments = [float(session.get(key) or 0) for session in sessions for key in ('activity', 'output')]
    return max([_epoch(started_at, now), *moments])


async def _sessions(settings: Settings, user_id: str) -> list[dict[str, Any]]:
    """termi's sessions, or none when termi does not answer: then only the start time counts.
    VI: Các phiên của termi, hoặc rỗng khi termi không trả lời: khi đó chỉ tính giờ khởi động."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f'http://{container_name(user_id)}:{TERMI_PORT}/api/sessions',
                headers=_upstream_headers({}, settings, user_id),
            )
    except httpx.HTTPError:
        return []
    body = response.json() if response.status_code == 200 else []
    return body if isinstance(body, list) else []


async def stop_idle_sandboxes(settings: Settings, now: Callable[[], float] = time.time) -> list[str]:
    """Stops every running sandbox idle for longer than the limit; returns their user ids.
    VI: Dừng mọi sandbox đang chạy rảnh quá giới hạn; trả về id người dùng của chúng."""
    _, running = await _manager(settings, 'GET', '/sandboxes')
    stopped = []
    for sandbox in running or []:
        user_id = sandbox['userId']
        moment = now()
        idle = moment - last_activity(sandbox.get('startedAt'), await _sessions(settings, user_id), moment)
        if idle > settings.sandbox_idle_minutes * 60:
            await _manager(settings, 'POST', f'/sandboxes/{user_id}/stop')
            stopped.append(user_id)
    return stopped


async def sandbox_idle_loop(settings: Settings, stop: asyncio.Event, interval_seconds: float = CHECK_SECONDS) -> None:
    while not stop.is_set():
        try:
            stopped = await stop_idle_sandboxes(settings)
            if stopped:
                logger.info('Stopped %s idle sandbox(es): %s', len(stopped), ', '.join(stopped))
        except Exception:  # Keep the API alive; the check repeats next interval.
            logger.exception('Sandbox idle check failed.')
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
        except TimeoutError:
            pass
