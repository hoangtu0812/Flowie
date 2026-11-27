"""Claude Code status line for sandboxes (docs/sandbox.md), like termi's.

Claude Code runs it after each reply with the session's details on stdin, which
include the plan's 5-hour and 7-day limits. It keeps those in
~/.flowie/claude-usage.json, where the sandbox agent reads them for the usage
chip, and prints a short status line: the model and the folder.
VI: Status line của Claude Code cho sandbox (docs/sandbox.md), như của termi.
VI: Claude Code chạy nó sau mỗi câu trả lời với thông tin phiên qua stdin, gồm giới hạn 5 giờ
VI: và 7 ngày của gói. Nó giữ các giới hạn đó trong ~/.flowie/claude-usage.json, nơi sandbox
VI: agent đọc cho chip usage, và in một dòng trạng thái ngắn: model và thư mục.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path


def main(stdin: str, home: Path) -> str:
    try:
        status = json.loads(stdin)
    except ValueError:
        return ''
    if not isinstance(status, dict):
        return ''
    rates = status.get('rate_limits')
    if isinstance(rates, dict):
        target = home / '.flowie' / 'claude-usage.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f'{target.name}.{os.getpid()}')
        temporary.write_text(json.dumps({'rate_limits': rates, 'at': int(time.time() * 1000)}))
        temporary.replace(target)
    model = (status.get('model') or {}).get('display_name') or ''
    folder = os.path.basename((status.get('workspace') or {}).get('current_dir') or status.get('cwd') or '')
    return ' · '.join(part for part in (model, folder) if part)


if __name__ == '__main__':
    print(main(sys.stdin.read(), Path(os.environ.get('HOME', '/home/node'))))
