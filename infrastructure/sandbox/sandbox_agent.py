"""Flowie's helper inside one sandbox (docs/sandbox.md).

It runs as the sandbox's unprivileged user and answers the Flowie API only:
every path must start with the sandbox's secret base path (TERMINAL_TOKEN),
which only the API knows, and the host firewall lets nothing but the API reach
the sandbox network. It manages the user's tmux sessions (list with the state
of the Claude Code or Codex agent running in them, create, rename, close) and
lists folders and past agent conversations to start from. Commands run with
an argument list, never through a shell. Standard library only.
VI: Service hỗ trợ của Flowie bên trong một sandbox (docs/sandbox.md).
VI: Nó chạy bằng user thường của sandbox và chỉ trả lời API Flowie: mọi đường dẫn phải
VI: bắt đầu bằng đường dẫn gốc bí mật của sandbox (TERMINAL_TOKEN) mà chỉ API biết, và
VI: firewall của host không cho gì ngoài API vào mạng sandbox. Nó quản lý các phiên tmux
VI: của người dùng (liệt kê kèm trạng thái của agent Claude Code hay Codex đang chạy trong
VI: đó, tạo, đổi tên, đóng) và liệt kê thư mục cùng hội thoại agent cũ để bắt đầu. Lệnh
VI: chạy bằng danh sách tham số, không bao giờ qua shell. Chỉ dùng thư viện chuẩn.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

PORT = 7681
SESSION_NAME = re.compile(r'^[A-Za-z0-9_-]{1,40}$')
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
MAX_BODY = 64 * 1024
MAX_COMMAND = 20_000
AGENTS: dict[str, dict[str, Any]] = {
    'claude': {'command': 'claude', 'resume': ['claude', '--resume'], 'package': '@anthropic-ai/claude-code'},
    'codex': {'command': 'codex', 'resume': ['codex', 'resume'], 'package': '@openai/codex'},
}

# Screen rules ported from termi (src/tmux/screen.mjs): what the last lines of an
# agent's screen say about it.
# VI: Luật đọc màn hình chuyển từ termi (src/tmux/screen.mjs): vài dòng cuối màn hình
# VI: của agent cho biết nó đang ở trạng thái nào.
WAITING = re.compile(r'Do you want to|Would you like to|Esc to cancel|Allow command|\(y/n\)|\[y/n\]|^\s*[›❯]\s*1\.', re.I | re.M)
WORKING = re.compile(r'esc to interrupt', re.I)
STATE_TAIL_LINES = 15
PREVIEW_LINES = 3
FRAME_CHARS = re.compile(r'[─━│╭╮╰╯╌┄┈\s]')
LOGO_BLOCKS = re.compile(r'[▐▛▜▝▘█▀]')
FOOTER_HINT = re.compile(r'^\s*(⏵|\? for shortcuts)')
CONVERSATION_LIMIT = 40
CONVERSATION_SCAN = 300
HEAD_BYTES = 512 * 1024
TITLE_CHARS = 160


class Refused(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def home() -> Path:
    return Path(os.environ.get('HOME', '/home/node')).resolve()


def run(*args: str, timeout: float = 10) -> subprocess.CompletedProcess[str]:
    return subprocess.run(list(args), capture_output=True, text=True, timeout=timeout, check=False)


def tmux(*args: str) -> subprocess.CompletedProcess[str]:
    return run('tmux', *args)


def agent_state(screen: str) -> str:
    tail = '\n'.join([line for line in screen.split('\n') if line.strip()][-STATE_TAIL_LINES:])
    if WAITING.search(tail):
        return 'waiting'
    if WORKING.search(tail):
        return 'working'
    return 'idle'


def screen_preview(screen: str) -> str:
    def has_content(line: str) -> bool:
        return len(FRAME_CHARS.sub('', line)) > 1 and not LOGO_BLOCKS.search(line) and not FOOTER_HINT.search(line)

    return '\n'.join([line.rstrip() for line in screen.split('\n') if has_content(line.rstrip())][-PREVIEW_LINES:])


def agent_of(command_line: str) -> str | None:
    """The agent a process is, from its command line: a native binary or a Node
    script (`node /usr/local/bin/claude`), installed from npm or elsewhere.
    VI: Tiến trình là agent nào, dựa vào dòng lệnh: binary gốc hay script Node
    VI: (`node /usr/local/bin/claude`), cài từ npm hay nơi khác."""
    args = command_line.split()
    if not args:
        return None
    runtime = os.path.basename(args[0])
    executable = args[1] if runtime in ('node', 'bun', 'deno') and len(args) > 1 else args[0]
    name = re.sub(r'\.[cm]?js$', '', os.path.basename(executable))
    for agent, spec in AGENTS.items():
        if name == spec['command'] or spec['package'] in executable:
            return agent
    return None


def agent_panes(ps_output: str) -> dict[str, str]:
    """pid -> agent for every process that has an agent among its descendants, so
    a pane's shell pid finds the agent running inside it.
    VI: pid -> agent cho mọi tiến trình có agent trong các tiến trình con cháu, để pid
    VI: shell của pane tìm ra agent đang chạy bên trong."""
    parent: dict[str, str] = {}
    agents: list[tuple[str, str]] = []
    for line in ps_output.splitlines():
        match = re.match(r'^\s*(\d+)\s+(\d+)\s+(.*)$', line)
        if not match:
            continue
        pid, ppid, command = match.groups()
        parent[pid] = ppid
        agent = agent_of(command)
        if agent:
            agents.append((pid, agent))
    owners: dict[str, str] = {}
    for pid, agent in agents:
        current: str | None = pid
        for _ in range(64):
            if not current or current in ('0', '1'):
                break
            owners.setdefault(current, agent)
            current = parent.get(current)
    return owners


def list_sessions() -> list[dict[str, Any]]:
    panes = tmux(
        'list-panes', '-a', '-F',
        '#{session_name}\t#{window_active}#{pane_active}\t#{pane_pid}\t#{pane_current_path}'
        '\t#{session_activity}\t#{window_activity}',
    )
    if panes.returncode != 0:
        return []
    owners = agent_panes(run('ps', '-ax', '-o', 'pid=,ppid=,args=').stdout)
    sessions: dict[str, dict[str, Any]] = {}
    for line in panes.stdout.splitlines():
        fields = line.split('\t')
        if len(fields) != 6:
            continue
        name, active, pid, directory, activity, output = fields
        session = sessions.setdefault(name, {
            'name': name, 'dir': directory, 'agent': None,
            'activity': int(activity or 0), 'output': int(output or 0),
        })
        if active == '11':
            session['dir'] = directory
        session['agent'] = session['agent'] or owners.get(pid)
    for session in sessions.values():
        screen = tmux('capture-pane', '-p', '-J', '-t', f"={session['name']}:").stdout
        session['state'] = agent_state(screen) if session['agent'] else 'shell'
        session['preview'] = screen_preview(screen)
    return sorted(sessions.values(), key=lambda s: max(s['activity'], s['output']), reverse=True)


def inside_home(directory: str) -> str:
    path = Path(directory or home()).expanduser().resolve()
    if path != home() and home() not in path.parents:
        raise Refused(400, 'The folder must be inside the home folder.')
    if not path.is_dir():
        raise Refused(400, 'The folder does not exist.')
    return str(path)


def create_session(body: dict[str, Any]) -> dict[str, Any]:
    name = body.get('name')
    agent = body.get('agent')
    resume = body.get('resume')
    command = body.get('command') or ''
    if not isinstance(name, str) or not SESSION_NAME.match(name):
        raise Refused(400, 'Invalid session name.')
    if agent is not None and agent not in AGENTS:
        raise Refused(400, 'Unknown agent.')
    if resume is not None and (agent is None or not isinstance(resume, str) or not UUID.match(resume)):
        raise Refused(400, 'Invalid conversation.')
    if not isinstance(command, str) or len(command) > MAX_COMMAND or (command and agent):
        raise Refused(400, 'Invalid command.')
    directory = inside_home(body.get('dir') or '')
    if tmux('has-session', '-t', f'={name}').returncode == 0:
        raise Refused(409, 'The session exists.')
    if tmux('new-session', '-d', '-s', name, '-c', directory).returncode != 0:
        raise Refused(500, 'Could not create the session.')
    if agent:
        command = ' '.join([*AGENTS[agent]['resume'], resume]) if resume else AGENTS[agent]['command']
    if command:
        tmux('send-keys', '-t', f'={name}:', '-l', '--', command)
        tmux('send-keys', '-t', f'={name}:', 'Enter')
    return {'name': name}


def rename_session(name: str, body: dict[str, Any]) -> dict[str, Any]:
    target = body.get('to')
    if not SESSION_NAME.match(name) or not isinstance(target, str) or not SESSION_NAME.match(target):
        raise Refused(400, 'Invalid session name.')
    if tmux('has-session', '-t', f'={target}').returncode == 0:
        raise Refused(409, 'A session with that name exists.')
    if tmux('rename-session', '-t', f'={name}', target).returncode != 0:
        raise Refused(404, 'No such session.')
    return {'name': target}


def close_session(name: str) -> None:
    if not SESSION_NAME.match(name):
        raise Refused(400, 'Invalid session name.')
    if tmux('kill-session', '-t', f'={name}').returncode != 0:
        raise Refused(404, 'No such session.')


def _records(file: Path) -> list[dict[str, Any]]:
    try:
        with file.open('rb') as handle:
            head = handle.read(HEAD_BYTES).decode('utf-8', 'replace')
    except OSError:
        return []
    records = []
    for line in head.split('\n'):
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if isinstance(record, dict):
            records.append(record)
    return records


def _real_prompt(text: Any) -> bool:
    return isinstance(text, str) and bool(text.strip()) and not text.startswith(('<', '# AGENTS.md'))


def _first_text(content: Any) -> Any:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return next((part.get('text') for part in content if isinstance(part, dict) and part.get('type') == 'text'), None)
    return None


def claude_conversation(file: Path) -> dict[str, Any] | None:
    entry: dict[str, Any] = {'id': file.stem}
    for record in _records(file):
        entry.setdefault('cwd', record.get('cwd'))
        if record.get('type') == 'summary' and record.get('summary'):
            entry['title'] = record['summary']
        if record.get('type') == 'custom-title' and record.get('customTitle'):
            entry['custom'] = record['customTitle']
        if record.get('type') == 'user' and not record.get('isMeta') and not entry.get('title'):
            text = _first_text((record.get('message') or {}).get('content'))
            if _real_prompt(text):
                entry['title'] = text
        if entry.get('cwd') and entry.get('title') and entry.get('custom'):
            break
    return entry if UUID.match(entry['id']) and entry.get('cwd') else None


def codex_conversation(file: Path) -> dict[str, Any] | None:
    entry: dict[str, Any] = {}
    for record in _records(file):
        payload = record.get('payload') or {}
        if record.get('type') == 'session_meta':
            entry['id'], entry['cwd'] = payload.get('id'), payload.get('cwd')
        text = None
        if record.get('type') == 'response_item' and payload.get('role') == 'user':
            text = next((p.get('text') for p in payload.get('content') or [] if p.get('type') == 'input_text'), None)
        elif record.get('type') == 'event_msg' and payload.get('type') == 'user_message':
            text = payload.get('message')
        if not entry.get('title') and _real_prompt(text):
            entry['title'] = text
        if entry.get('id') and entry.get('cwd') and entry.get('title'):
            break
    return entry if isinstance(entry.get('id'), str) and UUID.match(entry['id']) and entry.get('cwd') else None


def conversations(directory: str | None) -> list[dict[str, Any]]:
    """Past Claude Code and Codex conversations, newest first, for `--resume`.
    VI: Các hội thoại Claude Code và Codex cũ, mới nhất trước, để `--resume`."""
    files: list[tuple[float, str, Path]] = []
    for agent, root, pattern in (
        ('claude', home() / '.claude' / 'projects', '*/*.jsonl'),
        ('codex', home() / '.codex' / 'sessions', '**/rollout-*.jsonl'),
    ):
        for file in root.glob(pattern) if root.is_dir() else []:
            try:
                files.append((file.stat().st_mtime, agent, file))
            except OSError:
                continue
    files.sort(reverse=True)
    found = []
    for mtime, agent, file in files[:CONVERSATION_SCAN]:
        entry = claude_conversation(file) if agent == 'claude' else codex_conversation(file)
        if not entry or (directory and entry['cwd'] != directory):
            continue
        title = (entry.get('custom') or entry.get('title') or '').strip()[:TITLE_CHARS]
        found.append({'agent': agent, 'id': entry['id'], 'cwd': entry['cwd'], 'title': title, 'mtime': int(mtime)})
        if len(found) >= CONVERSATION_LIMIT:
            break
    return found


def recent_dirs() -> dict[str, Any]:
    """Folders worth starting a session in: open sessions' folders, the issue
    worktrees and clones Flowie makes, and folders of past conversations.
    VI: Thư mục đáng để mở phiên: thư mục của các phiên đang mở, worktree và bản clone
    VI: do Flowie tạo, và thư mục của các hội thoại cũ."""
    candidates = [session['dir'] for session in list_sessions()]
    for parent in ('work', 'repos'):
        root = home() / parent
        candidates += sorted(str(p) for p in root.iterdir() if p.is_dir()) if root.is_dir() else []
    candidates += [entry['cwd'] for entry in conversations(None)]
    recent: list[str] = []
    for candidate in candidates:
        try:
            directory = inside_home(candidate)
        except Refused:
            continue
        if directory not in recent:
            recent.append(directory)
    return {'home': str(home()), 'recent': recent[:50]}


def route(token: str, method: str, raw_path: str, body: bytes) -> tuple[int, Any]:
    parts = urlsplit(raw_path)
    segments = parts.path.strip('/').split('/')
    if not token or len(segments) < 2 or segments[0] != token:
        return 404, {'error': 'Not found'}
    path = segments[1:]
    query = parse_qs(parts.query)
    try:
        request = json.loads(body) if body else {}
    except ValueError:
        return 400, {'error': 'Invalid JSON'}
    if not isinstance(request, dict):
        return 400, {'error': 'Invalid JSON'}
    try:
        if method == 'GET' and path == ['sessions']:
            return 200, list_sessions()
        if method == 'POST' and path == ['sessions']:
            return 201, create_session(request)
        if method == 'POST' and len(path) == 3 and path[0] == 'sessions' and path[2] == 'rename':
            return 200, rename_session(path[1], request)
        if method == 'DELETE' and len(path) == 2 and path[0] == 'sessions':
            close_session(path[1])
            return 204, None
        if method == 'GET' and path == ['dirs']:
            return 200, recent_dirs()
        if method == 'GET' and path == ['conversations']:
            directory = query.get('dir', [''])[0]
            return 200, conversations(inside_home(directory) if directory else None)
    except Refused as error:
        return error.status, {'error': str(error)}
    except subprocess.TimeoutExpired:
        return 504, {'error': 'The command took too long.'}
    return 404, {'error': 'Not found'}


def serve(token: str, port: int = PORT) -> None:
    class Handler(BaseHTTPRequestHandler):
        server_version = 'flowie-sandbox-agent'

        def _respond(self) -> None:
            length = int(self.headers.get('Content-Length') or 0)
            if length > MAX_BODY:
                status, answer = 413, {'error': 'Too large'}
            else:
                status, answer = route(token, self.command, self.path, self.rfile.read(length) if length else b'')
            payload = b'' if answer is None else json.dumps(answer).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - BaseHTTPRequestHandler's name
            pass

        do_GET = do_POST = do_DELETE = _respond

    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()


if __name__ == '__main__':
    secret = os.environ.get('TERMINAL_TOKEN', '')
    if len(secret) < 32:
        print('TERMINAL_TOKEN is required.', file=sys.stderr)
        sys.exit(1)
    serve(secret)
