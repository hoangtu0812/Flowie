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

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlsplit

PORT = 7681
SESSION_NAME = re.compile(r'^[A-Za-z0-9_-]{1,40}$')
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
# JSON arrives ASCII-escaped, so 20 000 Vietnamese characters take about 120 KB.
# VI: JSON tới dạng thoát ASCII, nên 20 000 ký tự tiếng Việt chiếm khoảng 120 KB.
MAX_BODY = 256 * 1024
MAX_COMMAND = 20_000
MAX_TEXT = 20_000
MAX_UPLOAD = 25 * 1024 * 1024
SCROLLBACK_LINES = 2000
PASTE_BUFFER = 'flowie'
# The keys termi sends (src/validate.mjs), and menu numbers.
# VI: Các phím termi gửi (src/validate.mjs), và số của menu.
KEYS = frozenset(
    ['Escape', 'C-c', 'C-d', 'Tab', 'BTab', 'Up', 'Down', 'Left', 'Right', 'Enter', 'PageUp', 'PageDown', *'123456789']
)
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
        session.update(git_summary(session['dir']))
    return sorted(sessions.values(), key=lambda s: max(s['activity'], s['output']), reverse=True)


GIT_SUMMARY_SECONDS = 15
_git_summaries: dict[str, tuple[float, dict[str, Any]]] = {}


def git_summary(directory: str) -> dict[str, Any]:
    """The branch and number of uncommitted files of a session's folder, for the status bar and
    the Git badge; cached for 15 seconds per folder, as termi does. None outside a repository.
    VI: Nhánh và số file chưa commit của thư mục phiên, cho status bar và badge Git; cache 15 giây
    VI: cho mỗi thư mục như termi. None khi không nằm trong repository."""
    cached = _git_summaries.get(directory)
    if cached and time.monotonic() - cached[0] < GIT_SUMMARY_SECONDS:
        return cached[1]
    summary: dict[str, Any] = {'branch': None, 'changes': None}
    try:
        result = subprocess.run(
            ['git', '-C', directory, 'status', '--porcelain=v1', '-b', '-z', '--untracked-files=normal'],
            capture_output=True, text=True, timeout=5, check=False,
            env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'},
        )
    except (OSError, subprocess.TimeoutExpired):
        result = None
    if result is not None and result.returncode == 0:
        head, _, rest = result.stdout.partition('\0')
        branch = head.removeprefix('## ').split('...')[0]
        summary = {
            'branch': branch.removeprefix('No commits yet on ') or None,
            'changes': len(_status_entries(rest)),
        }
    _git_summaries[directory] = (time.monotonic(), summary)
    return summary


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


def _session(name: str) -> str:
    if not SESSION_NAME.match(name) or tmux('has-session', '-t', f'={name}').returncode != 0:
        raise Refused(404, 'No such session.')
    return f'={name}:'


def send(name: str, body: dict[str, Any]) -> dict[str, Any]:
    """Types into a session as termi does: a key from the allowed set, then text as a
    bracketed paste (so a multi-line message, Vietnamese included, arrives whole and an
    agent does not run it line by line), then Enter if asked.
    VI: Gõ vào một phiên như termi: một phím trong tập cho phép, rồi chữ dạng bracketed
    VI: paste (để tin nhiều dòng, kể cả tiếng Việt, tới nguyên vẹn và agent không chạy từng
    VI: dòng), rồi Enter nếu được yêu cầu."""
    key, text, enter = body.get('key'), body.get('text') or '', body.get('enter') is True
    if key is not None and key not in KEYS:
        raise Refused(400, 'Unsupported key.')
    if not isinstance(text, str) or len(text) > MAX_TEXT:
        raise Refused(400, 'The text is too long.')
    pane = _session(name)
    if key:
        tmux('send-keys', '-t', pane, key)
    if text:
        if tmux('display-message', '-p', '-t', pane, '#{pane_in_mode}').stdout.strip() == '1':
            tmux('send-keys', '-t', pane, '-X', 'cancel')
        tmux('set-buffer', '-b', PASTE_BUFFER, '--', text)
        tmux('paste-buffer', '-p', '-d', '-b', PASTE_BUFFER, '-t', pane)
    if enter:
        tmux('send-keys', '-t', pane, 'Enter')
    return {'ok': True}


def session_text(name: str) -> dict[str, Any]:
    """The session's screen and the last lines of its history, as plain text to copy.
    VI: Màn hình của phiên và các dòng lịch sử cuối, dạng chữ thường để copy."""
    pane = _session(name)
    text = tmux('capture-pane', '-p', '-J', '-S', f'-{SCROLLBACK_LINES}', '-t', pane).stdout
    return {'text': text.rstrip()}


def save_upload(filename: str, data: bytes) -> dict[str, Any]:
    """Keeps a file the person attached in ~/.flowie/uploads and returns its path, which
    the message then names so the agent can read it.
    VI: Lưu file người dùng đính kèm vào ~/.flowie/uploads và trả đường dẫn, để tin nhắn
    VI: ghi đường dẫn đó cho agent đọc."""
    if not data:
        raise Refused(400, 'The file is empty.')
    safe = re.sub(r'[^A-Za-z0-9._-]+', '-', os.path.basename(unquote(filename) or 'file')).strip('.-')[:80] or 'file'
    folder = home() / '.flowie' / 'uploads'
    folder.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime('%Y%m%d-%H%M%S')
    target = folder / f'{stamp}-{safe}'
    for n in range(2, 100):
        if not target.exists():
            break
        target = folder / f'{stamp}-{n}-{safe}'
    target.write_bytes(data)
    return {'path': str(target)}


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


# ---- Files and git, ported from termi (src/routes/files.mjs, src/routes/git.mjs, src/git/*) ----
# VI: ---- File và git, chuyển từ termi (src/routes/files.mjs, src/routes/git.mjs, src/git/*) ----

MAX_OUTPUT_CHARS = 200_000
TRUNCATED = '\n… (cut)'
HIDDEN = {'.git', '.DS_Store'}
IMAGE_TYPES = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
}
MAX_IMAGE = 10 * 1024 * 1024
LOG_LIMIT = '200'
LOG_FORMAT = '%x1f'.join(['%H', '%P', '%D', '%s', '%an', '%at'])
COMMIT_FORMAT = '%H%x1f%an%x1f%at%x1f%s%x1f%b'
REVISION = re.compile(r'^[0-9a-f]{4,40}$')
BRANCH = re.compile(r'^[A-Za-z0-9._/-]{1,200}$')
MAX_COMMIT_MESSAGE = 5000
MAX_OP_OUTPUT = 2000
SUBDIR_MARK = '•'


class Raw:
    """A non-JSON answer (an image). VI: Câu trả lời không phải JSON (một ảnh)."""

    def __init__(self, data: bytes, content_type: str):
        self.data = data
        self.content_type = content_type


def clip(text: str) -> str:
    return text[:MAX_OUTPUT_CHARS] + TRUNCATED if len(text) > MAX_OUTPUT_CHARS else text


def inside_home_file(file: str) -> Path:
    path = Path(file or '').expanduser().resolve()
    if home() not in path.parents:
        raise Refused(400, 'The file must be inside the home folder.')
    if not path.is_file():
        raise Refused(404, 'No such file.')
    return path


def git(directory: str, *args: str, timeout: float = 90) -> str:
    """git with an argument list, never asking for a password (a missing credential
    fails instead of hanging) and without colour; a failure becomes a 400 with git's words.
    VI: git bằng danh sách tham số, không bao giờ hỏi mật khẩu (thiếu thông tin đăng nhập thì
    VI: báo lỗi thay vì treo) và không màu; lỗi thành 400 kèm thông báo của git."""
    env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_OPTIONAL_LOCKS': '0'}
    result = subprocess.run(
        ['git', '-C', directory, '-c', 'color.ui=never', *args],
        capture_output=True, text=True, timeout=timeout, env=env, check=False,
    )
    if result.returncode != 0:
        raise Refused(400, (result.stderr or result.stdout or 'git failed').strip()[:800])
    return result.stdout


def _status_entries(raw: str) -> list[dict[str, str]]:
    parts = raw.split('\0')
    files, index = [], 0
    while index < len(parts):
        entry = parts[index]
        index += 1
        if not entry:
            continue
        files.append({'x': entry[0], 'y': entry[1], 'path': entry[3:]})
        if entry[0] in ('R', 'C'):
            index += 1  # the rename's source path follows
    return files


def git_marks(directory: str) -> dict[str, str]:
    """Change letter per entry of a folder (U untracked, else the staged or worktree
    letter, • for a folder with changes below).
    VI: Chữ cái thay đổi cho từng mục của thư mục (U chưa theo dõi, còn lại là chữ của stage
    VI: hay worktree, • cho thư mục có thay đổi bên dưới)."""
    try:
        top = git(directory, 'rev-parse', '--show-toplevel').strip()
        raw = git(top, 'status', '--porcelain=v1', '-z', '--untracked-files=normal')
    except Refused:
        return {}
    rel = os.path.relpath(directory, top)
    prefix = '' if rel == '.' else f'{rel}/'
    marks: dict[str, str] = {}
    for file in _status_entries(raw):
        if not file['path'].startswith(prefix):
            continue
        rest = file['path'][len(prefix):].rstrip('/')
        name, _, below = rest.partition('/')
        code = 'U' if file['x'] == '?' else (file['x'] if file['x'] != ' ' else file['y'])
        marks[name] = SUBDIR_MARK if below else code
    return marks


def list_folder(directory: str) -> dict[str, Any]:
    folder = inside_home(directory)
    marks = git_marks(folder)
    entries: list[dict[str, Any]] = []
    for child in Path(folder).iterdir():
        if child.name in HIDDEN or child.name.startswith('._'):
            continue
        try:
            stat = child.stat()
        except OSError:
            continue
        entry: dict[str, Any] = {'name': child.name, 'path': str(child), 'dir': child.is_dir(), 'size': stat.st_size,
                 'mtime': int(stat.st_mtime)}
        if child.name in marks:
            entry['git'] = marks[child.name]
        entries.append(entry)
    entries.sort(key=lambda e: (not e['dir'], str(e['name']).lower()))
    parent = str(Path(folder).parent) if Path(folder) != home() else None
    return {'dir': folder, 'parent': parent, 'entries': entries}


def read_file(file: str) -> dict[str, Any]:
    path = inside_home_file(file)
    if path.suffix.lower() in IMAGE_TYPES:
        return {'path': str(path), 'image': True}
    with path.open('rb') as handle:
        data = handle.read(MAX_OUTPUT_CHARS * 4 + 1)
    if b'\0' in data:
        return {'path': str(path), 'binary': True}
    return {'path': str(path), 'text': clip(data.decode('utf-8', 'replace'))}


def raw_image(file: str) -> Raw:
    path = inside_home_file(file)
    content_type = IMAGE_TYPES.get(path.suffix.lower())
    if not content_type:
        raise Refused(415, 'Only images can be shown directly.')
    if path.stat().st_size > MAX_IMAGE:
        raise Refused(413, 'The image is too large.')
    return Raw(path.read_bytes(), content_type)


def graph_layout(commits: list[dict[str, Any]]) -> dict[str, Any]:
    """termi's commit graph lanes (src/git/graph.mjs): per row the commit's column and
    segments [from lane, from position, to lane, to position], positions 0 top, 1 dot, 2 bottom.
    VI: Làn đồ thị commit của termi (src/git/graph.mjs): mỗi hàng có cột của commit và các đoạn
    VI: [làn đầu, vị trí đầu, làn cuối, vị trí cuối], vị trí 0 trên, 1 chấm, 2 dưới."""
    lanes: list[str | None] = []
    width = 1
    rows = []
    for commit in commits:
        column = lanes.index(commit['h']) if commit['h'] in lanes else (
            lanes.index(None) if None in lanes else len(lanes))
        segments = [[lane, 0, column, 1] for lane, hash_ in enumerate(lanes) if hash_ == commit['h']]
        after: list[str | None] = [None if hash_ == commit['h'] else hash_ for hash_ in lanes]
        for index, parent in enumerate(commit['p']):
            if parent in after:
                lane = after.index(parent)
            else:
                lane = column if index == 0 else (after.index(None) if None in after else len(after))
                if lane >= len(after):
                    after.extend([None] * (lane + 1 - len(after)))
                after[lane] = parent
            segments.append([column, 1, lane, 2])
        for lane, hash_ in enumerate(lanes):
            if hash_ is not None and hash_ != commit['h']:
                segments.append([lane, 0, after.index(hash_), 2])
        while after and after[-1] is None:
            after.pop()
        width = max(width, len(lanes), len(after), column + 1)
        lanes = after
        rows.append({'col': column, 'seg': segments})
    return {'width': width, 'rows': rows}


def repository(directory: str) -> str:
    folder = inside_home(directory)
    try:
        return git(folder, 'rev-parse', '--show-toplevel').strip()
    except Refused as error:
        raise Refused(400, 'This folder is not in a git repository.') from error


def git_overview(directory: str) -> dict[str, Any]:
    top = repository(directory)
    status = git(top, 'status', '--porcelain=v1', '-b', '-z')
    head, _, rest = status.partition('\0')
    try:
        log = git(top, 'log', '--all', '--date-order', '-n', LOG_LIMIT, f'--format={LOG_FORMAT}')
    except Refused:
        log = ''  # a repository without commits
    commits = []
    for line in log.splitlines():
        fields = line.split('\x1f')
        if len(fields) != 6:
            continue
        h, parents, refs, subject, author, at = fields
        commits.append({'h': h, 'p': parents.split() if parents else [], 'refs': refs.split(', ') if refs else [],
                        's': subject, 'a': author, 't': int(at or 0) * 1000})
    try:
        branches = git(top, 'branch', '-a', '--format=%(refname:short)').splitlines()
    except Refused:
        branches = []
    return {
        'dir': top, 'head': head.removeprefix('## '), 'files': _status_entries(rest), 'commits': commits,
        'graph': graph_layout(commits),
        'branches': [b for b in branches if b and not b.endswith('/HEAD') and b != 'origin'],
    }


def _numstat(raw: str) -> list[dict[str, Any]]:
    files = []
    for line in raw.splitlines():
        added, deleted, *rest = line.split('\t')
        if rest:
            files.append({'path': '\t'.join(rest), 'add': None if added == '-' else int(added),
                          'del': None if deleted == '-' else int(deleted)})
    return files


def git_show(directory: str, rev: str, file: str, staged: bool) -> dict[str, Any]:
    top = repository(directory)
    if rev and not REVISION.match(rev):
        raise Refused(400, 'Invalid commit.')
    if file:
        if '\0' in file or len(file) > 4096:
            raise Refused(400, 'Invalid file.')
        text = git(top, 'diff', *(['--cached'] if staged else []), '--', file)
        return {'text': clip(text) or '(no changes)'}
    scope = ['show', '--format=', rev] if rev else ['diff', 'HEAD']
    try:
        patch, numstat = git(top, *scope, '--patch'), git(top, *scope, '--numstat')
    except Refused:
        patch, numstat = git(top, 'diff', '--patch'), git(top, 'diff', '--numstat')
    commit = None
    if rev:
        hash_, author, at, subject, body = (git(top, 'log', '-1', f'--format={COMMIT_FORMAT}', rev).split('\x1f') + [''] * 5)[:5]
        commit = {'hash': hash_, 'author': author, 't': int(at or 0) * 1000, 'subject': subject, 'body': body.strip()}
    return {'text': clip(patch) or '(no changes)', 'files': _numstat(numstat), 'commit': commit}


def _paths(body: dict[str, Any]) -> list[str]:
    paths = body.get('paths')
    if not isinstance(paths, list) or not paths or not all(
        isinstance(p, str) and p and '\0' not in p and len(p) < 4096 for p in paths
    ):
        raise Refused(400, 'Invalid file list.')
    return paths


def git_op(body: dict[str, Any]) -> dict[str, Any]:
    top = repository(body.get('dir') or '')
    op = body.get('op')
    if op == 'stage':
        out = git(top, 'add', '--', *_paths(body))
    elif op == 'unstage':
        paths = _paths(body)
        try:
            out = git(top, 'restore', '--staged', '--', *paths)
        except Refused as error:
            if "resolve 'HEAD'" not in str(error):
                raise
            out = git(top, 'rm', '--cached', '-r', '-q', '--', *paths)
    elif op == 'commit':
        message = body.get('message')
        if not isinstance(message, str) or not message.strip() or len(message) > MAX_COMMIT_MESSAGE:
            raise Refused(400, 'A commit message is needed.')
        out = git(top, 'commit', '-m', message)
    elif op == 'push':
        try:
            out = git(top, 'push')
        except Refused as error:
            if 'no upstream' not in str(error).lower():
                raise
            out = git(top, 'push', '-u', 'origin', 'HEAD')
    elif op == 'pull':
        out = git(top, 'pull', '--ff-only')
    elif op == 'fetch':
        out = git(top, 'fetch', '--all', '--prune')
    elif op == 'switch':
        branch = body.get('branch')
        if not isinstance(branch, str) or not BRANCH.match(branch) or branch.startswith('-') or '..' in branch:
            raise Refused(400, 'Invalid branch.')
        out = git(top, 'switch', branch.removeprefix('origin/'))
    else:
        raise Refused(400, 'Unsupported git operation.')
    return {'ok': True, 'output': out.strip()[:MAX_OP_OUTPUT]}


# ---- Usage, ported from termi (src/system.mjs, src/agents/claude.mjs and codex.mjs limits) ----
# VI: ---- Mức dùng, chuyển từ termi (src/system.mjs, giới hạn trong src/agents/claude.mjs, codex.mjs) ----

CGROUP = Path('/sys/fs/cgroup')
CPU_SAMPLE_SECONDS = 0.2
ROLLOUT_FILES = 30
TAIL_BYTES = 256 * 1024
_cpu_sample: dict[str, float] = {}


def _read(path: Path) -> str:
    try:
        return path.read_text().strip()
    except OSError:
        return ''


def cpu_percent(cgroup: Path = CGROUP) -> int | None:
    """CPU the container used since the last call, as a share of its limit (cgroup v2).
    VI: CPU container đã dùng kể từ lần gọi trước, theo tỷ lệ so với giới hạn của nó (cgroup v2)."""
    usage = re.search(r'usage_usec (\d+)', _read(cgroup / 'cpu.stat'))
    if not usage:
        return None
    quota, _, period = (_read(cgroup / 'cpu.max') or 'max 100000').partition(' ')
    cpus = int(quota) / int(period or 100000) if quota != 'max' else float(os.cpu_count() or 1)
    now, used = time.monotonic(), int(usage.group(1))
    previous = dict(_cpu_sample)
    _cpu_sample.update(at=now, used=used)
    if not previous:
        time.sleep(CPU_SAMPLE_SECONDS)
        return cpu_percent(cgroup)
    elapsed = (now - previous['at']) * 1_000_000 * cpus
    return max(0, min(100, round((used - previous['used']) / elapsed * 100))) if elapsed > 0 else None


def memory(cgroup: Path = CGROUP) -> dict[str, int | None]:
    current, limit = _read(cgroup / 'memory.current'), _read(cgroup / 'memory.max')
    return {'used': int(current) if current.isdigit() else None, 'limit': int(limit) if limit.isdigit() else None}


def _tail_records(file: Path) -> list[dict[str, Any]]:
    try:
        with file.open('rb') as handle:
            handle.seek(max(0, file.stat().st_size - TAIL_BYTES))
            lines = handle.read().decode('utf-8', 'replace').split('\n')
    except OSError:
        return []
    records = []
    for line in lines:
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if isinstance(record, dict):
            records.append(record)
    return records


def _window(window: Any, now: float, percent_key: str) -> dict[str, Any] | None:
    if not isinstance(window, dict) or not isinstance(window.get('resets_at'), (int, float)):
        return None
    if window['resets_at'] <= now:
        return None
    return {'pct': round(float(window.get(percent_key) or 0)), 'resetsAt': int(window['resets_at'] * 1000),
            **({'minutes': window['window_minutes']} if 'window_minutes' in window else {})}


def codex_limits(now: float | None = None) -> dict[str, Any] | None:
    """Codex's plan windows from the newest rollout that reported them (`token_count`).
    VI: Các khung giới hạn gói của Codex từ file rollout mới nhất có báo (`token_count`)."""
    root = home() / '.codex' / 'sessions'
    files = sorted(root.glob('**/rollout-*.jsonl'), key=lambda f: f.stat().st_mtime, reverse=True) if root.is_dir() else []
    moment = now if now is not None else time.time()
    for file in files[:ROLLOUT_FILES]:
        for record in reversed(_tail_records(file)):
            payload = record.get('payload') or {}
            rates = payload.get('rate_limits') if payload.get('type') == 'token_count' else None
            if isinstance(rates, dict):
                return {'plan': rates.get('plan_type'),
                        'primary': _window(rates.get('primary'), moment, 'used_percent'),
                        'secondary': _window(rates.get('secondary'), moment, 'used_percent')}
    return None


def claude_limits(now: float | None = None) -> dict[str, Any] | None:
    """Claude's 5-hour and 7-day windows, as Flowie's statusline script last saw them.
    VI: Khung 5 giờ và 7 ngày của Claude, theo lần cuối script statusline của Flowie thấy."""
    try:
        saved = json.loads((home() / '.flowie' / 'claude-usage.json').read_text())
    except (OSError, ValueError):
        return None
    rates = saved.get('rate_limits') if isinstance(saved, dict) else None
    if not isinstance(rates, dict):
        return None
    moment = now if now is not None else time.time()
    return {'fiveHour': _window(rates.get('five_hour'), moment, 'used_percentage'),
            'sevenDay': _window(rates.get('seven_day'), moment, 'used_percentage'), 'at': saved.get('at')}


def usage() -> dict[str, Any]:
    disk = os.statvfs(home())
    return {
        'cpu': cpu_percent(),
        'memory': memory(),
        'disk': {'free': disk.f_bavail * disk.f_frsize, 'total': disk.f_blocks * disk.f_frsize},
        'claude': claude_limits(),
        'codex': codex_limits(),
    }


# ---- Chat view, ported from termi (src/agents/chat.mjs, tools.mjs, claude.mjs, codex.mjs) ----
# VI: ---- Màn hình Chat, chuyển từ termi (src/agents/chat.mjs, tools.mjs, claude.mjs, codex.mjs) ----

CHAT_TAIL_BYTES = 4 * 1024 * 1024
CHAT_LIMIT = 80
MAX_STEP_DETAIL = 140
INJECTED = ('<', '# AGENTS.md')
# Verbs are English keys the web page translates. VI: Động từ là khoá tiếng Anh, trang web dịch.
TOOL_VERBS: dict[str, tuple[str, str]] = {
    'Read': ('Read', 'file_path'), 'Edit': ('Edit', 'file_path'), 'MultiEdit': ('Edit', 'file_path'),
    'NotebookEdit': ('Edit', 'notebook_path'), 'Write': ('Create', 'file_path'), 'Bash': ('Run', 'command'),
    'Grep': ('Search', 'pattern'), 'Glob': ('Find files', 'pattern'), 'WebFetch': ('Read the web', 'url'),
    'WebSearch': ('Search the web', 'query'), 'Agent': ('Delegate', 'description'), 'Task': ('Delegate', 'description'),
    'TodoWrite': ('Update the to-do list', ''), 'AskUserQuestion': ('Ask you', 'questions'),
}
FILE_CHANGES = {'Edit': 'edit', 'MultiEdit': 'edit', 'NotebookEdit': 'edit', 'Write': 'create'}
PATCH_FILE = re.compile(r'^\*\*\* (Add|Update|Delete) File: (.+)$', re.M)


def _tail_lines(file: Path, size: int = CHAT_TAIL_BYTES) -> list[str]:
    """The last lines of a file, newest first. VI: Các dòng cuối của file, mới nhất trước."""
    try:
        with file.open('rb') as handle:
            handle.seek(max(0, file.stat().st_size - size))
            return handle.read().decode('utf-8', 'replace').split('\n')[::-1]
    except OSError:
        return []


def tool_step(name: str, raw: Any, cwd: str = '') -> dict[str, Any]:
    """One tool call as a step: a verb, a short detail, and the file it edits or creates.
    VI: Một lời gọi tool thành một bước: động từ, chi tiết ngắn, và file nó sửa hay tạo."""
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except ValueError:
            data = {'raw': raw}
    else:
        data = raw if isinstance(raw, dict) else {}
    data = data if isinstance(data, dict) else {}
    verb, field = TOOL_VERBS.get(name, ('Run' if name in ('exec', 'shell', 'exec_command') else name, 'command'))
    detail: Any = data.get(field) if field else ''
    if field in ('file_path', 'notebook_path'):
        detail = os.path.basename(str(detail or ''))
    elif field == 'questions' and isinstance(detail, list) and detail:
        detail = (detail[0] or {}).get('question', '')
    elif field == 'description' and not detail:
        detail = data.get('prompt', '')
    if isinstance(detail, list):
        detail = ' '.join(str(part) for part in detail)
    step: dict[str, Any] = {'verb': verb, 'detail': re.sub(r'\s+', ' ', str(detail or '')).strip()[:MAX_STEP_DETAIL]}
    file = data.get('file_path') or data.get('notebook_path')
    if name in FILE_CHANGES and isinstance(file, str) and file.startswith('/'):
        step.update(file=file, change=FILE_CHANGES[name])
    if name == 'apply_patch':  # Codex edits files through a patch
        patch = data.get('raw') or data.get('input') or ''
        files = [(kind, path.strip()) for kind, path in PATCH_FILE.findall(str(patch))]
        step['verb'], step['detail'] = 'Edit', ', '.join(os.path.basename(path) for _, path in files)[:MAX_STEP_DETAIL]
        step['files'] = [{'file': path if path.startswith('/') else os.path.join(cwd, path),
                          'change': 'create' if kind == 'Add' else 'edit'} for kind, path in files if kind != 'Delete']
    return step


def claude_events(record: dict[str, Any]) -> list[dict[str, Any]]:
    if record.get('type') not in ('user', 'assistant') or record.get('isMeta') or record.get('isSidechain'):
        return []
    content = (record.get('message') or {}).get('content')
    parts = [{'type': 'text', 'text': content}] if isinstance(content, str) else content if isinstance(content, list) else []
    events: list[dict[str, Any]] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        text = part.get('text')
        if part.get('type') == 'text' and isinstance(text, str) and text.strip() and not text.startswith('<'):
            events.append({'who': record['type'], 'text': text.strip()})
        elif part.get('type') == 'tool_use' and record['type'] == 'assistant':
            events.append({'tool': tool_step(str(part.get('name')), part.get('input'), record.get('cwd') or '')})
    return events


def codex_events(record: dict[str, Any]) -> list[dict[str, Any]]:
    if record.get('type') != 'response_item':
        return []
    payload = record.get('payload') or {}
    if payload.get('type') == 'message' and payload.get('role') in ('user', 'assistant'):
        text = '\n'.join(
            p.get('text', '') for p in payload.get('content') or [] if p.get('type') in ('input_text', 'output_text')
        ).strip()
        return [{'who': payload['role'], 'text': text}] if text and not text.startswith(INJECTED) else []
    if payload.get('type') in ('function_call', 'custom_tool_call'):
        return [{'tool': tool_step(str(payload.get('name')), payload.get('arguments', payload.get('input')))}]
    return []


def chat_items(events_of: Any, lines: list[str], limit: int = CHAT_LIMIT, cwd: str = '') -> list[dict[str, Any]]:
    """termi's chat: messages, with consecutive tool calls grouped into one step list; `lines`
    newest first, stopping after `limit` messages.
    VI: Chat của termi: các tin, với các lời gọi tool liền nhau gộp thành một danh sách bước;
    VI: `lines` mới nhất trước, dừng sau `limit` tin."""
    events: list[dict[str, Any]] = []
    messages = 0
    for line in lines:
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if not isinstance(record, dict):
            continue
        at = record.get('timestamp')
        found = [{**event, 't': at} for event in events_of(record)]
        for event in found:
            if 'tool' in event and cwd:
                for change in event['tool'].get('files') or []:
                    change['file'] = change['file'] if change['file'].startswith('/') else os.path.join(cwd, change['file'])
        events.extend(reversed(found))
        messages += sum(1 for event in found if 'who' in event)
        if messages >= limit:
            break
    items: list[dict[str, Any]] = []
    for event in reversed(events):
        if 'tool' in event and items and items[-1]['kind'] == 'tools':
            items[-1]['steps'].append(event['tool'])
            items[-1]['t'] = event['t']
        elif 'tool' in event:
            items.append({'kind': 'tools', 'steps': [event['tool']], 't': event['t']})
        else:
            items.append({'kind': 'msg', 'who': event['who'], 'text': event['text'], 't': event['t']})
    return items


def claude_project_dir(directory: str) -> Path:
    return home() / '.claude' / 'projects' / re.sub(r'[^A-Za-z0-9]', '-', directory)


def transcript_of(agent: str, directory: str) -> Path | None:
    """The newest conversation file of an agent in a folder.
    VI: File hội thoại mới nhất của một agent trong một thư mục."""
    if agent == 'claude':
        folder = claude_project_dir(directory)
        files = [f for f in folder.glob('*.jsonl') if f.is_file()] if folder.is_dir() else []
        return max(files, key=lambda f: f.stat().st_mtime) if files else None
    if agent == 'codex':
        root = home() / '.codex' / 'sessions'
        rollouts = sorted(root.glob('**/rollout-*.jsonl'), key=lambda f: f.stat().st_mtime, reverse=True) if root.is_dir() else []
        for file in rollouts[:ROLLOUT_FILES]:
            meta = next((r for r in _records(file) if r.get('type') == 'session_meta'), None)
            if meta and (meta.get('payload') or {}).get('cwd') == directory:
                return file
    return None


def conversation_file(agent: str, conversation: str) -> Path | None:
    if not UUID.match(conversation):
        raise Refused(400, 'Invalid conversation.')
    if agent == 'claude':
        root = home() / '.claude' / 'projects'
        return next(iter(root.glob(f'*/{conversation}.jsonl')), None) if root.is_dir() else None
    if agent == 'codex':
        root = home() / '.codex' / 'sessions'
        for file in root.glob('**/rollout-*.jsonl') if root.is_dir() else []:
            meta = next((r for r in _records(file) if r.get('type') == 'session_meta'), None)
            if meta and (meta.get('payload') or {}).get('id') == conversation:
                return file
        return None
    raise Refused(400, 'Unknown agent.')


EVENTS = {'claude': claude_events, 'codex': codex_events}


def session_chat(name: str, limit: int) -> dict[str, Any]:
    _session(name)
    session = next((s for s in list_sessions() if s['name'] == name), None)
    if not session:
        raise Refused(404, 'No such session.')
    agent = session.get('agent')
    file = transcript_of(agent, session['dir']) if agent else None
    items = chat_items(EVENTS[agent], _tail_lines(file), limit, session['dir']) if agent and file else []
    return {'agent': agent, 'state': session.get('state'), 'dir': session['dir'], 'items': items}


def conversation_chat(agent: str, conversation: str, limit: int) -> dict[str, Any]:
    file = conversation_file(agent, conversation)
    if not file:
        raise Refused(404, 'No such conversation.')
    first = next((r for r in _records(file) if r.get('cwd') or r.get('type') == 'session_meta'), {})
    cwd = first.get('cwd') or (first.get('payload') or {}).get('cwd') or ''
    return {'agent': agent, 'dir': cwd, 'items': chat_items(EVENTS[agent], _tail_lines(file), limit, cwd)}


# ---- Pipelines, ported from termi (src/ci/*): GitHub through gh, Azure DevOps through its REST API ----
# VI: ---- Pipeline, chuyển từ termi (src/ci/*): GitHub qua gh, Azure DevOps qua REST API của nó ----

CI_RUNS = 40
CI_CACHE_SECONDS = 15
CI_LOG_LINES = 400
CI_FAILED_STEPS = 3
SAFE_PART = re.compile(r'^[\w.\- ]{1,100}$')
GITHUB_REMOTES = (
    re.compile(r'^https://(?:[^@/]+@)?github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$'),
    re.compile(r'^(?:ssh://)?git@github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?$'),
)
AZURE_REMOTES = (
    re.compile(r'^https://(?:[^@/]+@)?dev\.azure\.com/([^/]+)/([^/]+)/_git/([^/]+?)/?$'),
    re.compile(r'^(?:ssh://)?git@ssh\.dev\.azure\.com:v3/([^/]+)/([^/]+)/([^/]+?)$'),
    re.compile(r'^https://(?:[^@/]+@)?([^.]+)\.visualstudio\.com/(?:DefaultCollection/)?([^/]+)/_git/([^/]+?)/?$'),
)
ANSI = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')
GITHUB_STATUS = {'queued': 'queued', 'waiting': 'queued', 'requested': 'queued', 'pending': 'queued', 'in_progress': 'running'}
GITHUB_RESULT = {'success': 'success', 'failure': 'failure', 'cancelled': 'cancelled', 'timed_out': 'failure'}
GITHUB_TRIGGER = {'pull_request': 'pr', 'pull_request_target': 'pr', 'workflow_dispatch': 'manual', 'push': 'push',
                  'schedule': 'schedule'}
AZURE_STATUS = {'notStarted': 'queued', 'postponed': 'queued', 'inProgress': 'running', 'cancelling': 'running'}
AZURE_RESULT = {'succeeded': 'success', 'partiallySucceeded': 'warning', 'failed': 'failure', 'canceled': 'cancelled'}
AZURE_TRIGGER = {'pullRequest': 'pr', 'manual': 'manual', 'individualCI': 'push', 'batchedCI': 'push',
                 'schedule': 'schedule', 'resourceTrigger': 'other'}
NEEDS_GH = 'Sign in to GitHub in the terminal first: gh auth login'
NEEDS_AZURE = 'Clone or push this Azure DevOps repository once in the terminal so git keeps your personal access token.'
_ci_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def parse_remote(url: str) -> dict[str, str] | None:
    """The CI host of a git remote: GitHub owner/repo or Azure DevOps org/project/repo.
    VI: Nơi chạy CI của một git remote: owner/repo của GitHub hoặc org/project/repo của Azure DevOps."""
    text = (url or '').strip()
    for pattern in GITHUB_REMOTES:
        match = pattern.match(text)
        if match:
            owner, repo = (unquote(part) for part in match.groups())
            return {'provider': 'github', 'owner': owner, 'repo': repo} if all(SAFE_PART.match(p) for p in (owner, repo)) else None
    for pattern in AZURE_REMOTES:
        match = pattern.match(text)
        if match:
            org, project, repo = (unquote(part) for part in match.groups())
            ok = all(SAFE_PART.match(p) for p in (org, project, repo))
            return {'provider': 'azure', 'org': org, 'project': project, 'repo': repo} if ok else None
    return None


def _millis(value: Any) -> int | None:
    """An ISO time as epoch milliseconds; Azure writes 7 fractional digits, cut to 6.
    VI: Thời gian ISO thành mili giây epoch; Azure ghi 7 chữ số phần giây, cắt còn 6."""
    if not isinstance(value, str) or not value:
        return None
    try:
        text = re.sub(r'(\.\d{6})\d+', r'\1', value.replace('Z', '+00:00'))
        return int(datetime.fromisoformat(text).timestamp() * 1000)
    except ValueError:
        return None


def github_run(run: dict[str, Any]) -> dict[str, Any]:
    status = GITHUB_STATUS.get(run.get('status') or '', 'completed')
    return {
        'id': str(run.get('id')), 'number': f"#{run.get('run_number')}", 'title': run.get('display_title') or run.get('name'),
        'pipeline': run.get('name') or '', 'pipelineId': str(run.get('workflow_id')), 'status': status,
        'result': GITHUB_RESULT.get(run.get('conclusion') or '', 'other') if status == 'completed' else None,
        'trigger': GITHUB_TRIGGER.get(run.get('event') or '', 'other'), 'branch': run.get('head_branch') or '',
        'ref': run.get('head_branch') or '', 'sha': str(run.get('head_sha') or '')[:8],
        'actor': (run.get('actor') or {}).get('login', ''), 'queuedAt': _millis(run.get('created_at')),
        'startedAt': _millis(run.get('run_started_at')),
        'finishedAt': _millis(run.get('updated_at')) if status == 'completed' else None, 'url': run.get('html_url'),
    }


def azure_run(run: dict[str, Any], remote: dict[str, str]) -> dict[str, Any]:
    status = 'completed' if run.get('status') == 'completed' else AZURE_STATUS.get(run.get('status') or '', 'queued')
    try:
        source = json.loads(run.get('parameters') or '{}').get('system.pullRequest.sourceBranch', '')
    except ValueError:
        source = ''
    web = f"https://dev.azure.com/{quote(remote['org'])}/{quote(remote['project'])}"
    pr = (run.get('triggerInfo') or {}).get('pr.number')
    title = run.get('_subject') or (f'PR {pr}' if pr else str(run.get('sourceVersion') or '')[:8])
    return {
        'id': str(run.get('id')), 'number': f"#{run.get('buildNumber')}", 'title': title,
        'pipeline': (run.get('definition') or {}).get('name', ''), 'pipelineId': str((run.get('definition') or {}).get('id', '')),
        'status': status, 'result': AZURE_RESULT.get(run.get('result') or '', 'other') if status == 'completed' else None,
        'trigger': AZURE_TRIGGER.get(run.get('reason') or '', 'other'),
        'branch': str(source or run.get('sourceBranch') or '').removeprefix('refs/heads/'), 'ref': run.get('sourceBranch') or '',
        'sha': str(run.get('sourceVersion') or '')[:8], 'actor': (run.get('requestedFor') or {}).get('displayName', ''),
        'queuedAt': _millis(run.get('queueTime')), 'startedAt': _millis(run.get('startTime')),
        'finishedAt': _millis(run.get('finishTime')), 'url': f"{web}/_build/results?buildId={run.get('id')}",
    }


def pipelines_of(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for run in runs:
        entry = by_id.setdefault(run['pipelineId'], {'id': run['pipelineId'], 'name': run['pipeline'], 'recent': []})
        if len(entry['recent']) < 3:
            entry['recent'].append(run['result'] if run['status'] == 'completed' else run['status'])
    return sorted(by_id.values(), key=lambda entry: entry['name'])


def gh(*args: str, timeout: float = 60) -> str:
    try:
        result = run('gh', *args, timeout=timeout)
    except FileNotFoundError as error:
        raise Refused(400, NEEDS_GH) from error
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise Refused(400, NEEDS_GH) if re.search(r'auth login|not logged|401', detail, re.I) else Refused(502, detail[:300])
    return result.stdout


def azure_token(top: str, remote: dict[str, str]) -> str:
    """The personal access token git keeps for this Azure DevOps repository, asked from git's own
    credential helper without ever prompting. VI: PAT mà git lưu cho repository Azure DevOps này, hỏi
    VI: từ credential helper của chính git mà không bao giờ hiện lời nhắc."""
    request = f"protocol=https\nhost=dev.azure.com\npath={remote['org']}/{remote['project']}/_git/{remote['repo']}\n\n"
    result = subprocess.run(
        ['git', '-C', top, '-c', 'credential.interactive=never', 'credential', 'fill'], input=request,
        capture_output=True, text=True, timeout=15, check=False,
        env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_ASKPASS': '/bin/false', 'SSH_ASKPASS': '/bin/false'},
    )
    password = next((line[9:] for line in result.stdout.splitlines() if line.startswith('password=')), '')
    if result.returncode != 0 or not password:
        raise Refused(400, NEEDS_AZURE)
    return password


def azure_api(top: str, remote: dict[str, str], method: str, path: str, body: Any = None, raw: bool = False) -> Any:
    import base64
    import urllib.error
    import urllib.request
    url = f"https://dev.azure.com/{quote(remote['org'])}/{quote(remote['project'])}/_apis/{path}"
    url += ('&' if '?' in url else '?') + 'api-version=7.1'
    auth = base64.b64encode(f':{azure_token(top, remote)}'.encode()).decode()
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': f'Basic {auth}', 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:  # noqa: S310 - fixed https host
            payload = response.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as error:
        raise Refused(400, NEEDS_AZURE) if error.code in (401, 203) else Refused(502, f'Azure DevOps answered {error.code}.') from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise Refused(502, 'Azure DevOps cannot be reached.') from error
    return payload if raw else json.loads(payload or 'null')


def ci_overview(directory: str, fresh: bool = False) -> dict[str, Any]:
    top = repository(directory)
    cached = _ci_cache.get(top)
    if cached and not fresh and time.monotonic() - cached[0] < CI_CACHE_SECONDS:
        return cached[1]
    try:
        url = git(top, 'remote', 'get-url', 'origin').strip()
    except Refused:
        url = ''
    remote = parse_remote(url)
    if not remote:
        overview: dict[str, Any] = {'provider': None}
    else:
        if remote['provider'] == 'github':
            data = json.loads(gh('api', f"repos/{remote['owner']}/{remote['repo']}/actions/runs?per_page={CI_RUNS}") or '{}')
            runs = [github_run(item) for item in data.get('workflow_runs') or []]
            page = f"https://github.com/{remote['owner']}/{remote['repo']}/actions"
            label = f"{remote['owner']}/{remote['repo']}"
        else:
            data = azure_api(top, remote, 'GET', f'build/builds?$top={CI_RUNS}') or {}
            builds = [b for b in data.get('value') or [] if not (b.get('repository') or {}).get('name') or b['repository']['name'] == remote['repo']]
            for build in builds:
                sha = str(build.get('sourceVersion') or '')
                if re.fullmatch(r'[0-9a-f]{40}', sha):
                    try:
                        build['_subject'] = git(top, 'log', '-1', '--format=%s', sha).strip()
                    except Refused:
                        pass
            runs = [azure_run(build, remote) for build in builds]
            page = f"https://dev.azure.com/{quote(remote['org'])}/{quote(remote['project'])}/_build"
            label = f"{remote['org']}/{remote['project']}/{remote['repo']}"
        runs.sort(key=lambda r: r['queuedAt'] or 0, reverse=True)
        try:
            branch = git(top, 'rev-parse', '--abbrev-ref', 'HEAD').strip()
        except Refused:
            branch = ''
        overview = {'provider': remote['provider'], 'remote': remote, 'repo': label, 'page': page,
                    'branch': '' if branch == 'HEAD' else branch, 'pipelines': pipelines_of(runs), 'runs': runs}
    _ci_cache[top] = (time.monotonic(), overview)
    return overview


def _ci_run(directory: str, run_id: str) -> tuple[str, dict[str, str], dict[str, Any]]:
    if not re.fullmatch(r'\d{1,20}', str(run_id or '')):
        raise Refused(400, 'Invalid run.')
    overview = ci_overview(directory)
    found = next((r for r in overview.get('runs') or [] if r['id'] == str(run_id)), None)
    if not found:
        raise Refused(404, 'No such run.')
    return repository(directory), overview['remote'], found


def ci_log(directory: str, run_id: str) -> dict[str, Any]:
    top, remote, found = _ci_run(directory, run_id)
    if remote['provider'] == 'github':
        text = gh('run', 'view', found['id'], '--log-failed', '-R', f"{remote['owner']}/{remote['repo']}")
    else:
        timeline = azure_api(top, remote, 'GET', f"build/builds/{found['id']}/timeline") or {}
        failed = [r for r in timeline.get('records') or []
                  if r.get('type') == 'Task' and r.get('result') == 'failed' and (r.get('log') or {}).get('id')][:CI_FAILED_STEPS]
        parts = [f"== {task.get('name')} ==\n" + azure_api(top, remote, 'GET', f"build/builds/{found['id']}/logs/{task['log']['id']}", raw=True)
                 for task in failed]
        text = '\n\n'.join(parts)
    lines = ANSI.sub('', text).rstrip().split('\n')
    return {'text': '\n'.join(lines[-CI_LOG_LINES:]) if text.strip() else '(no failed-step log)'}


def ci_action(body: dict[str, Any]) -> dict[str, Any]:
    action = body.get('action')
    if action not in ('rerun', 'cancel'):
        raise Refused(400, 'Unsupported action.')
    directory = str(body.get('dir') or '')
    top, remote, found = _ci_run(directory, str(body.get('id') or ''))
    if remote['provider'] == 'github':
        repo = ['-R', f"{remote['owner']}/{remote['repo']}"]
        if action == 'cancel':
            gh('run', 'cancel', found['id'], *repo)
        else:
            gh('run', 'rerun', found['id'], *(['--failed'] if found['result'] == 'failure' else []), *repo)
    elif action == 'cancel':
        azure_api(top, remote, 'PATCH', f"build/builds/{found['id']}", {'status': 'cancelling'})
    else:
        azure_api(top, remote, 'POST', f"pipelines/{found['pipelineId']}/runs",
                  {'resources': {'repositories': {'self': {'refName': found['ref']}}}})
    _ci_cache.pop(top, None)
    return {'ok': True}


# ---- Quick actions the person edits, shared or per project (termi v1.12) ----
# VI: ---- Thao tác nhanh người dùng tự sửa, dùng chung hoặc theo dự án (termi v1.12) ----

MAX_QUICK = 30
MAX_QUICK_LABEL = 40
MAX_QUICK_TEXT = 2000


def _quick_file() -> Path:
    return home() / '.flowie' / 'quick-actions.json'


def _quick_saved() -> dict[str, Any]:
    try:
        saved = json.loads(_quick_file().read_text())
    except (OSError, ValueError):
        return {'shared': None, 'projects': {}}
    return saved if isinstance(saved, dict) else {'shared': None, 'projects': {}}


def _project_of(directory: str) -> str:
    """The repository a folder belongs to, or the folder itself outside one.
    VI: Repository chứa thư mục, hoặc chính thư mục khi không nằm trong repository."""
    folder = inside_home(directory)
    try:
        return git(folder, 'rev-parse', '--show-toplevel').strip()
    except Refused:
        return folder


def _clean_actions(actions: Any) -> list[dict[str, Any]]:
    if not isinstance(actions, list) or len(actions) > MAX_QUICK:
        raise Refused(400, f'Up to {MAX_QUICK} quick actions.')
    cleaned = []
    for action in actions:
        label = action.get('label') if isinstance(action, dict) else None
        text = action.get('text') if isinstance(action, dict) else None
        if not isinstance(label, str) or not label.strip() or len(label) > MAX_QUICK_LABEL:
            raise Refused(400, f'Each quick action needs a name of up to {MAX_QUICK_LABEL} characters.')
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_QUICK_TEXT:
            raise Refused(400, f'Each quick action needs a request of up to {MAX_QUICK_TEXT} characters.')
        cleaned.append({'label': label.strip(), 'text': text, 'ask': action.get('ask') is True})
    return cleaned


def quick_actions(directory: str) -> dict[str, Any]:
    saved = _quick_saved()
    project = _project_of(directory) if directory else ''
    return {
        'shared': saved.get('shared'),
        'project': (saved.get('projects') or {}).get(project, []) if project else [],
        'projectDir': project or None,
    }


def save_quick_actions(body: dict[str, Any]) -> dict[str, Any]:
    scope = body.get('scope')
    if scope not in ('shared', 'project'):
        raise Refused(400, 'The scope is shared or project.')
    reset = body.get('actions') is None
    actions = None if reset else _clean_actions(body.get('actions'))
    saved = _quick_saved()
    stored = saved.get('projects')
    projects: dict[str, Any] = stored if isinstance(stored, dict) else {}
    if scope == 'shared':
        saved['shared'] = actions  # None goes back to the defaults
    else:
        project = _project_of(str(body.get('dir') or ''))
        if actions:
            projects[project] = actions
        else:
            projects.pop(project, None)
    saved['projects'] = projects
    target = _quick_file()
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f'{target.name}.{os.getpid()}')
    temporary.write_text(json.dumps(saved, ensure_ascii=False, indent=1))
    temporary.replace(target)
    return quick_actions(str(body.get('dir') or '')) if scope == 'project' else {'shared': saved['shared']}


# ---- Flowie MCP (docs/sandbox.md): the API hands over a token, both agents read it from the
# environment of a new shell, which /etc/bash.bashrc fills from the token file. ----
# VI: ---- MCP của Flowie (docs/sandbox.md): API trao token, cả hai agent đọc nó từ môi trường
# VI: của shell mới, do /etc/bash.bashrc lấy từ file token. ----
MCP_SERVER = 'flowie'
MCP_TOKEN_VAR = 'FLOWIE_MCP_TOKEN'
MCP_TOKEN = re.compile(r'^flowie_mcp_[A-Za-z0-9_-]{20,100}$')
MCP_URL = re.compile(r'^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?/[A-Za-z0-9/_-]*$')


def _mcp_token_file() -> Path:
    return home() / '.flowie' / 'mcp-token'


def mcp_held() -> dict[str, Any]:
    """The SHA-256 of the token held, never the token, so the API can tell whether it still works.
    VI: SHA-256 của token đang giữ, không bao giờ là token, để API biết nó còn dùng được không."""
    try:
        token = _mcp_token_file().read_text().strip()
    except OSError:
        token = ''
    return {'hash': hashlib.sha256(token.encode()).hexdigest() if token else None}


def save_mcp(body: dict[str, Any]) -> dict[str, Any]:
    """Stores the token readable by the sandbox user only and registers the server in Claude Code
    and Codex under the user scope; neither configuration holds the token itself.
    VI: Lưu token chỉ user của sandbox đọc được và đăng ký server trong Claude Code và Codex ở
    VI: phạm vi user; cấu hình của cả hai không chứa chính token."""
    url, token = body.get('url'), body.get('token')
    if not isinstance(url, str) or not MCP_URL.match(url) or not isinstance(token, str) or not MCP_TOKEN.match(token):
        raise Refused(400, 'Invalid MCP settings.')
    target = _mcp_token_file()
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = target.with_name(f'{target.name}.{os.getpid()}')
    with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as file:
        file.write(token)
    temporary.replace(target)
    claude = {'type': 'http', 'url': url, 'headers': {'Authorization': f'Bearer ${{{MCP_TOKEN_VAR}}}'}}
    commands = [
        ('claude', 'mcp', 'remove', '-s', 'user', MCP_SERVER),
        ('claude', 'mcp', 'add-json', '-s', 'user', MCP_SERVER, json.dumps(claude)),
        ('codex', 'mcp', 'add', MCP_SERVER, '--url', url, '--bearer-token-env-var', MCP_TOKEN_VAR),
    ]
    succeeded = []
    for command in commands:
        try:
            succeeded.append(run(*command, timeout=30).returncode == 0)
        except (OSError, subprocess.TimeoutExpired):
            succeeded.append(False)
    return {'claude': succeeded[1], 'codex': succeeded[2]}


def _limit(query: dict[str, list[str]]) -> int:
    try:
        return max(10, min(200, int(query.get('limit', [CHAT_LIMIT])[0])))
    except ValueError:
        return CHAT_LIMIT


def route(token: str, method: str, raw_path: str, body: bytes, filename: str = '') -> tuple[int, Any]:
    parts = urlsplit(raw_path)
    segments = parts.path.strip('/').split('/')
    if not token or len(segments) < 2 or segments[0] != token:
        return 404, {'error': 'Not found'}
    path = segments[1:]
    query = parse_qs(parts.query)
    if method == 'POST' and path == ['uploads']:
        try:
            return 201, save_upload(filename, body)
        except Refused as error:
            return error.status, {'error': str(error)}
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
        if method == 'POST' and len(path) == 3 and path[0] == 'sessions' and path[2] == 'send':
            return 200, send(path[1], request)
        if method == 'GET' and len(path) == 3 and path[0] == 'sessions' and path[2] == 'text':
            return 200, session_text(path[1])
        if method == 'GET' and path == ['ls']:
            return 200, list_folder(query.get('dir', [''])[0])
        if method == 'GET' and path == ['file']:
            return 200, read_file(query.get('path', [''])[0])
        if method == 'GET' and path == ['raw']:
            return 200, raw_image(query.get('path', [''])[0])
        if method == 'GET' and path == ['git']:
            return 200, git_overview(query.get('dir', [''])[0])
        if method == 'GET' and path == ['git', 'show']:
            return 200, git_show(
                query.get('dir', [''])[0], query.get('rev', [''])[0], query.get('file', [''])[0],
                query.get('staged', [''])[0] == '1',
            )
        if method == 'POST' and path == ['git', 'op']:
            return 200, git_op(request)
        if method == 'GET' and len(path) == 3 and path[0] == 'sessions' and path[2] == 'chat':
            return 200, session_chat(path[1], _limit(query))
        if method == 'GET' and len(path) == 3 and path[0] == 'conversations':
            return 200, conversation_chat(path[1], path[2], _limit(query))
        if method == 'GET' and path == ['ci']:
            return 200, ci_overview(query.get('dir', [''])[0], query.get('fresh', [''])[0] == '1')
        if method == 'GET' and path == ['ci', 'log']:
            return 200, ci_log(query.get('dir', [''])[0], query.get('id', [''])[0])
        if method == 'POST' and path == ['ci', 'action']:
            return 200, ci_action(request)
        if method == 'GET' and path == ['quick']:
            return 200, quick_actions(query.get('dir', [''])[0])
        if method == 'PUT' and path == ['quick']:
            return 200, save_quick_actions(request)
        if method == 'GET' and path == ['mcp']:
            return 200, mcp_held()
        if method == 'PUT' and path == ['mcp']:
            return 200, save_mcp(request)
        if method == 'GET' and path == ['usage']:
            return 200, usage()
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
            limit = MAX_UPLOAD if urlsplit(self.path).path.endswith('/uploads') else MAX_BODY
            if length > limit:
                status, answer = 413, {'error': 'Too large'}
            else:
                body = self.rfile.read(length) if length else b''
                status, answer = route(token, self.command, self.path, body, self.headers.get('X-Filename', ''))
            if isinstance(answer, Raw):
                payload, content_type = answer.data, answer.content_type
            else:
                payload, content_type = b'' if answer is None else json.dumps(answer).encode(), 'application/json'
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - BaseHTTPRequestHandler's name
            pass

        do_GET = do_POST = do_PUT = do_DELETE = _respond

    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()


if __name__ == '__main__':
    secret = os.environ.get('TERMINAL_TOKEN', '')
    if len(secret) < 32:
        print('TERMINAL_TOKEN is required.', file=sys.stderr)
        sys.exit(1)
    serve(secret)
