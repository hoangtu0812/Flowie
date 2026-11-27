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
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

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

        do_GET = do_POST = do_DELETE = _respond

    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()


if __name__ == '__main__':
    secret = os.environ.get('TERMINAL_TOKEN', '')
    if len(secret) < 32:
        print('TERMINAL_TOKEN is required.', file=sys.stderr)
        sys.exit(1)
    serve(secret)
