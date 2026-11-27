import importlib.util
import json
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('sandbox_agent', ROOT / 'infrastructure/sandbox/sandbox_agent.py')
assert spec and spec.loader
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)

TOKEN = 't' * 64
CONVERSATION = '0f8fad5b-d9cb-469f-a165-70867728950e'


def done(stdout: str = '', code: int = 0) -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess([], code, stdout, '')


class FakeTmux:
    """Just enough tmux for the agent: sessions with a folder, a pane pid and a screen."""

    def __init__(self):
        self.sessions: dict[str, dict] = {}
        self.typed: list[tuple[str, ...]] = []

    def __call__(self, *args: str):
        verb, rest = args[0], list(args[1:])
        target = rest[rest.index('-t') + 1].strip('=').rstrip(':') if '-t' in rest else None
        if verb == 'has-session':
            return done(code=0 if target in self.sessions else 1)
        if verb == 'new-session':
            name = rest[rest.index('-s') + 1]
            self.sessions[name] = {'dir': rest[rest.index('-c') + 1], 'pid': str(500 + len(self.sessions)), 'screen': '$ '}
            return done()
        if verb == 'send-keys':
            self.typed.append(tuple(rest[2:]))
            return done()
        if verb == 'rename-session':
            if target not in self.sessions:
                return done(code=1)
            self.sessions[rest[-1]] = self.sessions.pop(target)
            return done()
        if verb == 'kill-session':
            return done(code=0 if self.sessions.pop(target, None) else 1)
        if verb == 'list-panes':
            if not self.sessions:
                return done(code=1)
            rows = [f"{n}\t11\t{s['pid']}\t{s['dir']}\t100\t{200 + i}" for i, (n, s) in enumerate(self.sessions.items())]
            return done('\n'.join(rows) + '\n')
        if verb == 'capture-pane':
            self.captured = rest
            return done(self.sessions[target]['screen'])
        if verb == 'display-message':
            return done('1\n' if self.sessions[target].get('copy_mode') else '0\n')
        if verb == 'set-buffer':
            self.buffer = rest[-1]
            return done()
        if verb == 'paste-buffer':
            self.typed.append(('paste', '-p' in rest, self.buffer))
            return done()
        return done(code=1)


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    home = tmp_path / 'home'
    (home / 'work' / 'DTD-7-flowie').mkdir(parents=True)
    monkeypatch.setenv('HOME', str(home))
    fake = FakeTmux()
    monkeypatch.setattr(agent, 'tmux', fake)
    ps = {'out': ''}
    monkeypatch.setattr(agent, 'run', lambda *args, **kw: done(ps['out']) if args[0] == 'ps' else done(code=1))
    return home, fake, ps


def call(method, path, body=None):
    status, answer = agent.route(TOKEN, method, f'/{TOKEN}/{path}', json.dumps(body).encode() if body else b'')
    return status, answer


def test_screen_rules_match_termi():
    assert agent.agent_state('foo\n Do you want to proceed?\n ❯ 1. Yes\n   2. No\n') == 'waiting'
    assert agent.agent_state('✻ Thinking… (12s · esc to interrupt)\n') == 'working'
    assert agent.agent_state('> \n? for shortcuts\n') == 'idle'
    screen = '╭────╮\n│ hi │\n▐▛███▜▌\n alpha\n x\n beta\n gamma\n? for shortcuts\n'
    assert agent.screen_preview(screen) == ' alpha\n beta\n gamma'


def test_agents_are_found_from_the_process_tree():
    ps = '\n'.join([
        '  1     0 /sbin/docker-init -- sandbox-start',
        '100     1 tmux new-session -A -s main',
        '200   100 -bash',
        '210   200 node /usr/local/bin/claude --resume x',
        '300   100 -bash',
        '310   300 node /usr/local/lib/node_modules/@openai/codex/bin/codex.js',
        '311   310 /usr/local/lib/node_modules/@openai/codex/vendor/x86_64/codex/codex',
        '400   100 bash',
        '410   400 vim claude.txt',
    ])
    owners = agent.agent_panes(ps)
    assert owners['200'] == 'claude' and owners['300'] == 'codex'
    assert '400' not in owners and '1' not in owners


def test_sessions_are_created_listed_renamed_and_closed(sandbox):
    home, fake, ps = sandbox
    folder = str(home / 'work' / 'DTD-7-flowie')
    assert call('POST', 'sessions', {'name': 'DTD-7', 'dir': folder, 'agent': 'claude', 'resume': CONVERSATION}) == (
        201, {'name': 'DTD-7'}
    )
    assert fake.typed == [('-l', '--', f'claude --resume {CONVERSATION}'), ('Enter',)]
    assert call('POST', 'sessions', {'name': 'shell', 'command': "echo 'x' && ls"})[0] == 201
    assert fake.typed[-2] == ('-l', '--', "echo 'x' && ls")
    assert call('POST', 'sessions', {'name': 'DTD-7'})[0] == 409

    fake.sessions['DTD-7']['screen'] = 'Edit file?\n❯ 1. Yes\n  2. No\n'
    ps['out'] = f"{fake.sessions['DTD-7']['pid']} 1 bash\n900 {fake.sessions['DTD-7']['pid']} node /usr/local/bin/claude\n"
    status, sessions = call('GET', 'sessions')
    assert status == 200
    by_name = {s['name']: s for s in sessions}
    assert by_name['DTD-7']['agent'] == 'claude' and by_name['DTD-7']['state'] == 'waiting'
    assert by_name['DTD-7']['dir'] == folder
    assert by_name['shell']['agent'] is None and by_name['shell']['state'] == 'shell'
    assert [s['name'] for s in sessions] == ['shell', 'DTD-7']  # most recent output first

    assert call('POST', 'sessions/DTD-7/rename', {'to': 'shell'})[0] == 409
    assert call('POST', 'sessions/DTD-7/rename', {'to': 'issue-7'}) == (200, {'name': 'issue-7'})
    assert call('DELETE', 'sessions/issue-7') == (204, None)
    assert call('DELETE', 'sessions/issue-7')[0] == 404


@pytest.mark.parametrize('body', [
    {'name': 'a b'},
    {'name': 'x', 'agent': 'bash'},
    {'name': 'x', 'resume': CONVERSATION},
    {'name': 'x', 'agent': 'codex', 'resume': 'not-a-uuid'},
    {'name': 'x', 'agent': 'claude', 'command': 'rm -rf ~'},
    {'name': 'x', 'dir': '/etc'},
    {'name': 'x', 'dir': '~/../..'},
    {'name': 'x', 'dir': '~/missing'},
])
def test_bad_sessions_are_refused_before_tmux_runs(sandbox, body):
    _, fake, _ = sandbox
    assert call('POST', 'sessions', body)[0] == 400
    assert fake.sessions == {} and fake.typed == []


def test_a_symlink_out_of_home_is_refused(sandbox, tmp_path):
    home, fake, _ = sandbox
    (home / 'escape').symlink_to(tmp_path)
    assert call('POST', 'sessions', {'name': 'x', 'dir': str(home / 'escape')})[0] == 400


def test_only_the_secret_path_answers(sandbox):
    assert agent.route(TOKEN, 'GET', '/sessions', b'')[0] == 404
    assert agent.route(TOKEN, 'GET', '/wrong/sessions', b'')[0] == 404
    assert agent.route('', 'GET', '//sessions', b'')[0] == 404
    assert agent.route(TOKEN, 'POST', f'/{TOKEN}/sessions', b'[1]')[0] == 400


def test_conversations_of_both_agents_newest_first_and_by_folder(sandbox):
    home, _, _ = sandbox
    folder = str(home / 'work' / 'DTD-7-flowie')
    claude_file = home / '.claude' / 'projects' / '-home-node-work-DTD-7-flowie' / f'{CONVERSATION}.jsonl'
    claude_file.parent.mkdir(parents=True)
    claude_file.write_text('\n'.join(json.dumps(r) for r in [
        {'type': 'user', 'cwd': folder, 'isMeta': True, 'message': {'content': '<command>'}},
        {'type': 'user', 'cwd': folder, 'message': {'content': [{'type': 'text', 'text': 'Fix the login page'}]}},
    ]))
    codex_id = str(uuid.UUID(int=7))
    codex_file = home / '.codex' / 'sessions' / '2026' / '11' / '27' / 'rollout-2026-11-27.jsonl'
    codex_file.parent.mkdir(parents=True)
    codex_file.write_text('\n'.join(json.dumps(r) for r in [
        {'type': 'session_meta', 'payload': {'id': codex_id, 'cwd': str(home)}},
        {'type': 'response_item', 'payload': {'role': 'user', 'content': [{'type': 'input_text', 'text': '# AGENTS.md rules'}]}},
        {'type': 'event_msg', 'payload': {'type': 'user_message', 'message': 'Add a Codex test'}},
    ]))
    status, found = call('GET', 'conversations')
    assert status == 200
    assert {(c['agent'], c['id'], c['title']) for c in found} == {
        ('claude', CONVERSATION, 'Fix the login page'), ('codex', codex_id, 'Add a Codex test'),
    }
    assert [c['agent'] for c in call('GET', f'conversations?dir={folder}')[1]] == ['claude']
    assert call('GET', 'conversations?dir=/etc')[0] == 400
    status, dirs = call('GET', 'dirs')
    assert dirs['home'] == str(home.resolve())
    assert folder in dirs['recent'] and str(home.resolve()) in dirs['recent']


@pytest.mark.skipif(not shutil.which('tmux'), reason='tmux is not installed')
def test_with_real_tmux(tmp_path, monkeypatch):
    # tmux's socket path must stay short (macOS allows 104 bytes), so not under tmp_path.
    sockets = tempfile.mkdtemp(prefix='fl-tmux-', dir='/tmp')
    monkeypatch.setenv('HOME', str(tmp_path))
    monkeypatch.setenv('TMUX_TMPDIR', sockets)
    monkeypatch.delenv('TMUX', raising=False)
    name = 'flowie-test'
    try:
        assert call('POST', 'sessions', {'name': name, 'command': 'echo ready-$((40+2)) > done.txt'})[0] == 201
        for _ in range(50):
            if (tmp_path / 'done.txt').exists():
                break
            subprocess.run(['sleep', '0.1'], check=False)
        assert (tmp_path / 'done.txt').read_text().strip() == 'ready-42'
        sessions = call('GET', 'sessions')[1]
        assert [(s['name'], s['state'], s['dir']) for s in sessions] == [(name, 'shell', str(tmp_path.resolve()))]
        assert call('POST', f'sessions/{name}/send', {'text': 'echo "xin chào $((1+1))" > vi.txt', 'enter': True})[0] == 200
        for _ in range(50):
            if (tmp_path / 'vi.txt').exists() and (tmp_path / 'vi.txt').read_text().strip():
                break
            subprocess.run(['sleep', '0.1'], check=False)
        assert (tmp_path / 'vi.txt').read_text().strip() == 'xin chào 2'
        assert 'xin chào' in call('GET', f'sessions/{name}/text')[1]['text']
    finally:
        subprocess.run(['tmux', 'kill-server'], check=False, capture_output=True)
        shutil.rmtree(sockets, ignore_errors=True)


def test_send_pastes_text_whole_then_presses_enter(sandbox):
    _, fake, _ = sandbox
    call('POST', 'sessions', {'name': 'cl'})
    fake.typed.clear()
    fake.sessions['cl']['copy_mode'] = True
    text = 'Sửa lỗi đăng nhập\nrồi chạy test'
    assert call('POST', 'sessions/cl/send', {'text': text, 'enter': True}) == (200, {'ok': True})
    assert fake.typed == [('-X', 'cancel'), ('paste', True, text), ('Enter',)]
    fake.typed.clear()
    assert call('POST', 'sessions/cl/send', {'key': 'BTab'})[0] == 200
    assert fake.typed == [('BTab',)]


@pytest.mark.parametrize('body', [{'key': 'C-z'}, {'key': 'rm'}, {'text': 'x' * 20_001}, {'text': 5}])
def test_send_refuses_other_keys_and_long_text(sandbox, body):
    _, fake, _ = sandbox
    call('POST', 'sessions', {'name': 'cl'})
    fake.typed.clear()
    assert call('POST', 'sessions/cl/send', body)[0] == 400
    assert fake.typed == []
    assert call('POST', 'sessions/missing/send', {'key': 'Enter'})[0] == 404


def test_session_text_includes_history(sandbox):
    _, fake, _ = sandbox
    call('POST', 'sessions', {'name': 'cl'})
    fake.sessions['cl']['screen'] = 'line 1\nline 2\n\n'
    assert call('GET', 'sessions/cl/text') == (200, {'text': 'line 1\nline 2'})
    assert fake.captured[fake.captured.index('-S') + 1] == '-2000'


def test_uploads_land_in_the_home_with_a_safe_name(sandbox):
    home, _, _ = sandbox
    status, saved = agent.route(TOKEN, 'POST', f'/{TOKEN}/uploads', b'\x89PNG', '..%2F..%2Fetc%2Fảnh chụp.png')
    assert status == 201
    path = Path(saved['path'])
    assert path.parent == home / '.flowie' / 'uploads'
    assert path.name.endswith('-nh-ch-p.png') and path.read_bytes() == b'\x89PNG'
    second = agent.route(TOKEN, 'POST', f'/{TOKEN}/uploads', b'x', 'a.txt')[1]['path']
    third = agent.route(TOKEN, 'POST', f'/{TOKEN}/uploads', b'y', 'a.txt')[1]['path']
    assert second != third
    assert agent.route(TOKEN, 'POST', f'/{TOKEN}/uploads', b'', 'a.txt')[0] == 400


def test_graph_lanes_follow_termi_for_a_merge():
    commits = [{'h': 'M', 'p': ['A', 'B']}, {'h': 'B', 'p': ['A']}, {'h': 'A', 'p': []}]
    assert agent.graph_layout(commits) == {'width': 2, 'rows': [
        {'col': 0, 'seg': [[0, 1, 0, 2], [0, 1, 1, 2]]},
        {'col': 1, 'seg': [[1, 0, 1, 1], [1, 1, 0, 2], [0, 0, 0, 2]]},
        {'col': 0, 'seg': [[0, 0, 0, 1]]},
    ]}


@pytest.fixture
def repo(sandbox):
    home, _, _ = sandbox
    folder = home / 'work' / 'repo'
    folder.mkdir(parents=True)
    run_git = lambda *args: subprocess.run(['git', '-C', str(folder), *args], check=True, capture_output=True)  # noqa: E731
    run_git('init', '-q', '-b', 'main')
    run_git('config', 'user.email', 't@t')
    run_git('config', 'user.name', 'Tester')
    (folder / 'README.md').write_text('# Hello\n')
    (folder / 'src').mkdir()
    (folder / 'src' / 'app.py').write_text('print(1)\n')
    run_git('add', '.')
    run_git('commit', '-q', '-m', 'first')
    (folder / 'README.md').write_text('# Hello\n\nMore.\n')
    (folder / 'src' / 'new.py').write_text('x = 1\n')
    (folder / 'logo.png').write_bytes(b'\x89PNG\r\n')
    (folder / 'blob.bin').write_bytes(b'a\0b')
    return folder


def test_folders_list_with_git_marks_and_files_read(repo, monkeypatch):
    monkeypatch.setattr(agent, 'run', subprocess.run)
    status, listed = call('GET', f'ls?dir={repo}')
    assert status == 200 and listed['parent'] == str(repo.parent)
    entries = {e['name']: e for e in listed['entries']}
    assert [e['name'] for e in listed['entries']][0] == 'src'  # folders first
    assert entries['README.md']['git'] == 'M' and entries['src']['git'] == '•' and entries['logo.png']['git'] == 'U'
    assert '.git' not in entries
    assert call('GET', f'file?path={repo}/README.md') == (200, {'path': str(repo / 'README.md'), 'text': '# Hello\n\nMore.\n'})
    assert call('GET', f'file?path={repo}/blob.bin')[1]['binary'] is True
    assert call('GET', f'file?path={repo}/logo.png')[1]['image'] is True
    raw = agent.route(TOKEN, 'GET', f'/{TOKEN}/raw?path={repo}/logo.png', b'')[1]
    assert raw.content_type == 'image/png' and raw.data == b'\x89PNG\r\n'
    assert call('GET', f'raw?path={repo}/README.md')[0] == 415
    assert call('GET', 'file?path=/etc/passwd')[0] == 400
    assert call('GET', f'file?path={repo}/../../../../etc/passwd')[0] == 400
    assert call('GET', 'ls?dir=/etc')[0] == 400


def test_git_overview_ops_and_diffs(repo):
    status, overview = call('GET', f'git?dir={repo}/src')
    assert status == 200 and overview['dir'] == str(repo.resolve())
    assert overview['head'].startswith('main')
    assert {(f['x'], f['y'], f['path']) for f in overview['files']} == {
        (' ', 'M', 'README.md'), ('?', '?', 'blob.bin'), ('?', '?', 'logo.png'), ('?', '?', 'src/new.py'),
    }
    assert [c['s'] for c in overview['commits']] == ['first'] and overview['branches'] == ['main']
    assert 'More.' in call('GET', f'git/show?dir={repo}&file=README.md')[1]['text']

    assert call('POST', 'git/op', {'dir': str(repo), 'op': 'stage', 'paths': ['README.md', 'src/new.py']})[0] == 200
    assert call('GET', f'git/show?dir={repo}&file=README.md&staged=1')[1]['text'].count('+More.') == 1
    assert call('POST', 'git/op', {'dir': str(repo), 'op': 'unstage', 'paths': ['src/new.py']})[0] == 200
    assert call('POST', 'git/op', {'dir': str(repo), 'op': 'commit', 'message': 'Sửa README'})[0] == 200
    overview = call('GET', f'git?dir={repo}')[1]
    assert [c['s'] for c in overview['commits']] == ['Sửa README', 'first']
    shown = call('GET', f"git/show?dir={repo}&rev={overview['commits'][0]['h']}")[1]
    assert shown['commit']['subject'] == 'Sửa README' and shown['files'] == [{'path': 'README.md', 'add': 2, 'del': 0}]

    for body in ({'op': 'commit', 'message': ' '}, {'op': 'switch', 'branch': '--force'}, {'op': 'switch', 'branch': 'a..b'},
                 {'op': 'stage', 'paths': []}, {'op': 'rm'}):
        assert call('POST', 'git/op', {'dir': str(repo), **body})[0] == 400
    assert call('GET', f'git/show?dir={repo}&rev=HEAD;rm')[0] == 400
    failed = call('POST', 'git/op', {'dir': str(repo), 'op': 'push'})
    assert failed[0] == 400 and failed[1]['error']  # no remote: git's own words come back
    assert call('GET', f'git?dir={repo.parent}')[0] == 400  # not a repository


def test_cpu_and_memory_come_from_the_cgroup(tmp_path, monkeypatch):
    (tmp_path / 'cpu.max').write_text('50000 100000\n')  # half a CPU
    (tmp_path / 'cpu.stat').write_text('usage_usec 1100000\nuser_usec 1\n')
    (tmp_path / 'memory.current').write_text('536870912\n')
    (tmp_path / 'memory.max').write_text('2147483648\n')
    monkeypatch.setattr(agent, '_cpu_sample', {'at': 10.0, 'used': 1_000_000})
    monkeypatch.setattr(agent.time, 'monotonic', lambda: 10.4)
    assert agent.cpu_percent(tmp_path) == 50  # 0.1 s of CPU in 0.4 s on half a CPU
    assert agent.memory(tmp_path) == {'used': 536870912, 'limit': 2147483648}
    (tmp_path / 'memory.max').write_text('max\n')
    assert agent.memory(tmp_path)['limit'] is None
    assert agent.cpu_percent(tmp_path / 'missing') is None


def test_plan_limits_of_codex_and_claude(sandbox):
    home, _, _ = sandbox
    now = 1_800_000_000
    rollout = home / '.codex' / 'sessions' / '2026' / '11' / '27' / 'rollout-1.jsonl'
    rollout.parent.mkdir(parents=True)
    rollout.write_text('\n'.join(json.dumps(r) for r in [
        {'type': 'event_msg', 'payload': {'type': 'token_count', 'rate_limits': {'plan_type': 'plus',
            'primary': {'used_percent': 12.4, 'window_minutes': 300, 'resets_at': now + 600},
            'secondary': {'used_percent': 40, 'window_minutes': 10080, 'resets_at': now - 1}}}},
        {'type': 'response_item', 'payload': {'type': 'message'}},
    ]))
    assert agent.codex_limits(now) == {
        'plan': 'plus', 'primary': {'pct': 12, 'resetsAt': (now + 600) * 1000, 'minutes': 300}, 'secondary': None,
    }
    assert agent.claude_limits(now) is None
    usage_file = home / '.flowie' / 'claude-usage.json'
    usage_file.parent.mkdir(parents=True)
    usage_file.write_text(json.dumps({'at': 5, 'rate_limits': {
        'five_hour': {'used_percentage': 33.6, 'resets_at': now + 60}, 'seven_day': {'used_percentage': 9, 'resets_at': now + 9}}}))
    assert agent.claude_limits(now) == {
        'fiveHour': {'pct': 34, 'resetsAt': (now + 60) * 1000}, 'sevenDay': {'pct': 9, 'resetsAt': (now + 9) * 1000}, 'at': 5,
    }
    status, usage = call('GET', 'usage')
    assert status == 200 and set(usage) == {'cpu', 'memory', 'disk', 'claude', 'codex'}
    assert usage['disk']['free'] > 0


def test_statusline_records_claude_limits_and_prints_model_and_folder(tmp_path):
    spec = importlib.util.spec_from_file_location('claude_statusline', ROOT / 'infrastructure/sandbox/claude_statusline.py')
    assert spec and spec.loader
    statusline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(statusline)
    status = {'model': {'display_name': 'Opus'}, 'workspace': {'current_dir': '/home/node/work/DTD-7'},
              'rate_limits': {'five_hour': {'used_percentage': 20, 'resets_at': 1}}}
    assert statusline.main(json.dumps(status), tmp_path) == 'Opus · DTD-7'
    saved = json.loads((tmp_path / '.flowie' / 'claude-usage.json').read_text())
    assert saved['rate_limits'] == status['rate_limits'] and saved['at'] > 0
    assert statusline.main('not json', tmp_path) == ''


def test_sessions_carry_their_branch_and_uncommitted_count(repo, monkeypatch):
    monkeypatch.setattr(agent, '_git_summaries', {})
    assert agent.git_summary(str(repo)) == {'branch': 'main', 'changes': 4}
    (repo / 'another.txt').write_text('x')
    assert agent.git_summary(str(repo))['changes'] == 4  # cached for 15 seconds
    monkeypatch.setattr(agent, '_git_summaries', {})
    assert agent.git_summary(str(repo))['changes'] == 5
    assert agent.git_summary(str(repo.parent)) == {'branch': None, 'changes': None}


def test_claude_chat_groups_tools_and_keeps_edited_files(sandbox):
    home, fake, ps = sandbox
    folder = home / 'work' / 'DTD-7-flowie'
    transcript = agent.claude_project_dir(str(folder)) / f'{CONVERSATION}.jsonl'
    transcript.parent.mkdir(parents=True)
    records = [
        {'type': 'user', 'isMeta': True, 'message': {'content': '<command-name>/clear</command-name>'}},
        {'type': 'user', 'timestamp': 't1', 'message': {'content': 'Sửa lỗi đăng nhập'}},
        {'type': 'assistant', 'timestamp': 't2', 'message': {'content': [
            {'type': 'text', 'text': 'Tôi xem file trước.'},
            {'type': 'tool_use', 'name': 'Read', 'input': {'file_path': f'{folder}/app/login.py'}},
        ]}},
        {'type': 'user', 'timestamp': 't3', 'message': {'content': [{'type': 'tool_result', 'content': 'ok'}]}},
        {'type': 'assistant', 'timestamp': 't4', 'message': {'content': [
            {'type': 'tool_use', 'name': 'Edit', 'input': {'file_path': f'{folder}/app/login.py'}},
            {'type': 'tool_use', 'name': 'Bash', 'input': {'command': 'pytest -q', 'description': 'Chạy test'}},
            {'type': 'tool_use', 'name': 'Write', 'input': {'file_path': f'{folder}/tests/test_login.py'}},
        ]}},
        {'type': 'assistant', 'isSidechain': True, 'message': {'content': 'inside a subagent'}},
        {'type': 'assistant', 'timestamp': 't5', 'message': {'content': [{'type': 'text', 'text': 'Xong, test đã qua.'}]}},
    ]
    transcript.write_text('\n'.join(json.dumps(r) for r in records) + '\n')
    call('POST', 'sessions', {'name': 'DTD-7', 'dir': str(folder)})
    pid = fake.sessions['DTD-7']['pid']
    ps['out'] = f'{pid} 1 bash\n900 {pid} node /usr/local/bin/claude\n'
    status, chat = call('GET', 'sessions/DTD-7/chat')
    assert status == 200 and chat['agent'] == 'claude' and chat['dir'] == str(folder.resolve())
    assert [(i['kind'], i.get('who'), i.get('text')) for i in chat['items']] == [
        ('msg', 'user', 'Sửa lỗi đăng nhập'),
        ('msg', 'assistant', 'Tôi xem file trước.'),
        ('tools', None, None),
        ('msg', 'assistant', 'Xong, test đã qua.'),
    ]
    steps = chat['items'][2]['steps']
    assert [(s['verb'], s['detail']) for s in steps] == [
        ('Read', 'login.py'), ('Edit', 'login.py'), ('Run', 'pytest -q'), ('Create', 'test_login.py'),
    ]
    assert steps[1]['file'] == f'{folder}/app/login.py' and steps[1]['change'] == 'edit'
    assert steps[3]['change'] == 'create' and 'file' not in steps[0]
    limited = agent.chat_items(agent.claude_events, agent._tail_lines(transcript), 1)  # newest message only
    assert [i.get('text') for i in limited if i['kind'] == 'msg'] == ['Xong, test đã qua.']
    assert call('GET', 'sessions/DTD-7/chat?limit=x')[0] == 200
    viewed = call('GET', f'conversations/claude/{CONVERSATION}')
    assert viewed[0] == 200 and len(viewed[1]['items']) == 4
    assert call('GET', 'conversations/claude/not-a-uuid')[0] == 400
    assert call('GET', f'conversations/claude/{uuid.UUID(int=1)}')[0] == 404
    assert call('GET', f'conversations/bash/{CONVERSATION}')[0] == 400


def test_codex_chat_reads_messages_commands_and_patches(sandbox):
    home, _, _ = sandbox
    folder = str(home / 'work' / 'DTD-7-flowie')
    codex_id = str(uuid.UUID(int=9))
    rollout = home / '.codex' / 'sessions' / '2026' / '11' / '27' / 'rollout-9.jsonl'
    rollout.parent.mkdir(parents=True)
    patch = '*** Begin Patch\n*** Update File: app/login.py\n@@\n-x\n+y\n*** Add File: docs/login.md\n+hi\n*** End Patch'
    rollout.write_text('\n'.join(json.dumps(r) for r in [
        {'type': 'session_meta', 'payload': {'id': codex_id, 'cwd': folder}},
        {'type': 'response_item', 'payload': {'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': '# AGENTS.md\nrules'}]}},
        {'type': 'response_item', 'payload': {'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': 'Thêm tài liệu'}]}},
        {'type': 'response_item', 'payload': {'type': 'function_call', 'name': 'shell', 'arguments': json.dumps({'command': ['bash', '-lc', 'ls']})}},
        {'type': 'response_item', 'payload': {'type': 'custom_tool_call', 'name': 'apply_patch', 'input': patch}},
        {'type': 'response_item', 'payload': {'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': 'Đã thêm.'}]}},
    ]) + '\n')
    assert agent.transcript_of('codex', folder) == rollout
    chat = call('GET', f'conversations/codex/{codex_id}')[1]
    assert [i.get('text') for i in chat['items'] if i['kind'] == 'msg'] == ['Thêm tài liệu', 'Đã thêm.']
    steps = chat['items'][1]['steps']
    assert steps[0] == {'verb': 'Run', 'detail': 'bash -lc ls'}
    assert steps[1]['verb'] == 'Edit' and steps[1]['files'] == [
        {'file': f'{folder}/app/login.py', 'change': 'edit'}, {'file': f'{folder}/docs/login.md', 'change': 'create'},
    ]


def test_remotes_are_recognised_like_termi():
    assert agent.parse_remote('https://github.com/hoangtu0812/Flowie.git') == {'provider': 'github', 'owner': 'hoangtu0812', 'repo': 'Flowie'}
    assert agent.parse_remote('git@github.com:o/r.git')['repo'] == 'r'
    assert agent.parse_remote('https://bsr@dev.azure.com/bsr/Digital%20Ops/_git/flowie') == {
        'provider': 'azure', 'org': 'bsr', 'project': 'Digital Ops', 'repo': 'flowie'}
    assert agent.parse_remote('https://bsr.visualstudio.com/DefaultCollection/P/_git/r')['org'] == 'bsr'
    assert agent.parse_remote('https://gitlab.com/o/r.git') is None
    assert agent.parse_remote('https://github.com/o/r;rm.git') is None


def test_runs_are_normalised_and_grouped():
    github = agent.github_run({'id': 7, 'run_number': 12, 'display_title': 'Fix login', 'name': 'CI', 'workflow_id': 3,
                               'status': 'completed', 'conclusion': 'timed_out', 'event': 'pull_request',
                               'head_branch': 'flowie/DTD-7', 'head_sha': 'abcdef0123456789', 'actor': {'login': 'tu'},
                               'created_at': '2026-11-27T01:00:00Z', 'updated_at': '2026-11-27T01:05:00Z', 'html_url': 'https://x'})
    assert github['result'] == 'failure' and github['trigger'] == 'pr' and github['sha'] == 'abcdef01'
    assert github['finishedAt'] - github['queuedAt'] == 300_000
    azure = agent.azure_run({'id': 9, 'buildNumber': '20261127.1', 'status': 'inProgress', 'reason': 'individualCI',
                             'definition': {'id': 4, 'name': 'Build'}, 'sourceBranch': 'refs/heads/main',
                             'sourceVersion': 'f' * 40, 'queueTime': '2026-11-27T01:00:00.1234567Z'},
                            {'org': 'bsr', 'project': 'P', 'repo': 'r'})
    assert azure['status'] == 'running' and azure['result'] is None and azure['branch'] == 'main'
    assert azure['queuedAt'] == github['queuedAt'] + 123 and azure['url'].endswith('buildId=9')
    assert agent.pipelines_of([github, azure, {**github, 'id': '8'}]) == [
        {'id': '4', 'name': 'Build', 'recent': ['running']}, {'id': '3', 'name': 'CI', 'recent': ['failure', 'failure']}]


def test_github_pipelines_use_gh(repo, monkeypatch):
    subprocess.run(['git', '-C', str(repo), 'remote', 'add', 'origin', 'https://github.com/o/r.git'], check=True)
    calls = []
    runs = [{'id': 1, 'run_number': 1, 'name': 'CI', 'workflow_id': 3, 'status': 'completed', 'conclusion': 'failure',
             'event': 'push', 'head_branch': 'main', 'head_sha': 'a', 'created_at': '2026-11-27T01:00:00Z'},
            {'id': 2, 'run_number': 2, 'name': 'CI', 'workflow_id': 3, 'status': 'in_progress', 'event': 'push',
             'head_branch': 'main', 'head_sha': 'b', 'created_at': '2026-11-27T02:00:00Z'}]

    def fake_run(*args, **kwargs):
        calls.append(args)
        if args[:2] == ('gh', 'api'):
            return done(json.dumps({'workflow_runs': runs}))
        if args[:3] == ('gh', 'run', 'view'):
            return done('\x1b[31merror\x1b[0m: tests failed\n')
        return done()

    monkeypatch.setattr(agent, 'run', fake_run)
    monkeypatch.setattr(agent, '_ci_cache', {})
    status, overview = call('GET', f'ci?dir={repo}')
    assert status == 200 and overview['provider'] == 'github' and overview['branch'] == 'main'
    assert [r['id'] for r in overview['runs']] == ['2', '1'] and overview['page'] == 'https://github.com/o/r/actions'
    assert call('GET', f'ci/log?dir={repo}&id=1') == (200, {'text': 'error: tests failed'})
    assert call('POST', 'ci/action', {'dir': str(repo), 'id': '1', 'action': 'rerun'})[0] == 200
    assert calls[-1] == ('gh', 'run', 'rerun', '1', '--failed', '-R', 'o/r')
    assert call('POST', 'ci/action', {'dir': str(repo), 'id': '2', 'action': 'cancel'})[0] == 200
    assert calls[-1] == ('gh', 'run', 'cancel', '2', '-R', 'o/r')
    assert call('POST', 'ci/action', {'dir': str(repo), 'id': '2', 'action': 'delete'})[0] == 400
    assert call('POST', 'ci/action', {'dir': str(repo), 'id': '99', 'action': 'cancel'})[0] == 404
    assert call('GET', f'ci/log?dir={repo}&id=1;rm')[0] == 400

    signed_out = subprocess.CompletedProcess([], 1, '', 'To get started with GitHub CLI, please run:  gh auth login')
    monkeypatch.setattr(agent, 'run', lambda *args, **kwargs: signed_out)
    monkeypatch.setattr(agent, '_ci_cache', {})
    status, error = call('GET', f'ci?dir={repo}')
    assert status == 400 and 'gh auth login' in error['error']


def test_azure_pipelines_use_the_stored_token_and_rest(repo, monkeypatch):
    home = repo.parent.parent
    subprocess.run(['git', '-C', str(repo), 'remote', 'add', 'origin', 'https://bsr@dev.azure.com/bsr/P/_git/flowie'], check=True)
    subprocess.run(['git', '-C', str(repo), 'config', 'credential.helper', 'store'], check=True)
    with pytest.raises(agent.Refused) as missing:  # nothing stored yet, and git must not prompt
        agent.azure_token(str(repo), {'org': 'bsr', 'project': 'P', 'repo': 'flowie'})
    assert missing.value.status == 400
    (home / '.git-credentials').write_text('https://bsr:secret-pat@dev.azure.com\n')
    assert agent.azure_token(str(repo), {'org': 'bsr', 'project': 'P', 'repo': 'flowie'}) == 'secret-pat'

    requests = []

    def fake_api(top, remote, method, path, body=None, raw=False):
        requests.append((method, path, body))
        if path.startswith('build/builds?'):
            return {'value': [
                {'id': 5, 'buildNumber': '1', 'status': 'completed', 'result': 'failed', 'definition': {'id': 4, 'name': 'Build'},
                 'sourceBranch': 'refs/heads/main', 'repository': {'name': 'flowie'}, 'queueTime': '2026-11-27T01:00:00Z'},
                {'id': 6, 'status': 'completed', 'definition': {'id': 8, 'name': 'Other'}, 'repository': {'name': 'other-repo'}},
            ]}
        if path.endswith('/timeline'):
            return {'records': [{'type': 'Task', 'result': 'failed', 'name': 'Run tests', 'log': {'id': 12}},
                                {'type': 'Task', 'result': 'succeeded', 'name': 'Build', 'log': {'id': 11}}]}
        if path.endswith('/logs/12'):
            return 'FAILED test_login\n'
        return {}

    monkeypatch.setattr(agent, 'azure_api', fake_api)
    monkeypatch.setattr(agent, '_ci_cache', {})
    overview = call('GET', f'ci?dir={repo}')[1]
    assert overview['provider'] == 'azure' and [r['id'] for r in overview['runs']] == ['5']
    assert overview['page'] == 'https://dev.azure.com/bsr/P/_build'
    assert call('GET', f'ci/log?dir={repo}&id=5')[1] == {'text': '== Run tests ==\nFAILED test_login'}
    call('POST', 'ci/action', {'dir': str(repo), 'id': '5', 'action': 'rerun'})
    assert requests[-1] == ('POST', 'pipelines/4/runs', {'resources': {'repositories': {'self': {'refName': 'refs/heads/main'}}}})
    call('POST', 'ci/action', {'dir': str(repo), 'id': '5', 'action': 'cancel'})
    assert requests[-1] == ('PATCH', 'build/builds/5', {'status': 'cancelling'})


def test_quick_actions_are_saved_shared_and_per_repository(repo):
    home = repo.parent.parent
    assert call('GET', f'quick?dir={repo}/src') == (200, {'shared': None, 'project': [], 'projectDir': str(repo.resolve())})
    shared = [{'label': 'Lint', 'text': 'Chạy pnpm lint và sửa lỗi', 'ask': False}]
    assert call('PUT', 'quick', {'scope': 'shared', 'actions': shared}) == (200, {'shared': shared})
    deploy = [{'label': 'Deploy', 'text': 'Deploy lên staging', 'ask': True, 'extra': 'ignored'}]
    status, saved = call('PUT', 'quick', {'scope': 'project', 'dir': f'{repo}/src', 'actions': deploy})
    assert status == 200 and saved['project'] == [{'label': 'Deploy', 'text': 'Deploy lên staging', 'ask': True}]
    assert call('GET', f'quick?dir={repo}')[1]['shared'] == shared
    assert call('GET', f'quick?dir={home}')[1]['project'] == []  # another folder has none
    stored = json.loads((home / '.flowie' / 'quick-actions.json').read_text())
    assert 'Chạy pnpm lint' in json.dumps(stored, ensure_ascii=False)
    assert call('PUT', 'quick', {'scope': 'project', 'dir': str(repo), 'actions': []})[1]['project'] == []
    assert call('PUT', 'quick', {'scope': 'shared', 'actions': None}) == (200, {'shared': None})  # back to defaults
    for bad in ({'scope': 'all', 'actions': []}, {'scope': 'shared', 'actions': [{'label': '', 'text': 'x'}]},
                {'scope': 'shared', 'actions': [{'label': 'x' * 41, 'text': 'x'}]},
                {'scope': 'shared', 'actions': [{'label': 'x', 'text': 'x'}] * 31},
                {'scope': 'project', 'dir': '/etc', 'actions': []}):
        assert call('PUT', 'quick', bad)[0] == 400


def test_mcp_token_is_kept_private_and_both_agents_read_it_from_the_environment(sandbox, monkeypatch):
    home = sandbox[0]
    ran = []
    monkeypatch.setattr(agent, 'run', lambda *args, **kw: ran.append(args) or done())
    token = 'flowie_mcp_' + 'A1-_' * 10
    url = 'http://circle-api:4000/mcp/'
    assert call('GET', 'mcp') == (200, {'hash': None})
    assert call('PUT', 'mcp', {'url': url, 'token': token}) == (200, {'claude': True, 'codex': True})
    stored = home / '.flowie' / 'mcp-token'
    assert stored.read_text() == token and stored.stat().st_mode & 0o777 == 0o600
    assert call('GET', 'mcp') == (200, {'hash': __import__('hashlib').sha256(token.encode()).hexdigest()})
    assert ran[0] == ('claude', 'mcp', 'remove', '-s', 'user', 'flowie')
    assert ran[1][:6] == ('claude', 'mcp', 'add-json', '-s', 'user', 'flowie')
    assert json.loads(ran[1][6]) == {'type': 'http', 'url': url, 'headers': {'Authorization': 'Bearer ${FLOWIE_MCP_TOKEN}'}}
    assert ran[2] == ('codex', 'mcp', 'add', 'flowie', '--url', url, '--bearer-token-env-var', 'FLOWIE_MCP_TOKEN')
    assert not any(token in part for command in ran for part in command)
    for bad in ({'url': url, 'token': 'ghp_' + 'x' * 30}, {'url': 'http://x/mcp/;rm -rf /', 'token': token}, {'url': url}):
        assert call('PUT', 'mcp', bad)[0] == 400


def test_mcp_registration_failures_are_reported_not_raised(sandbox, monkeypatch):
    def missing(*args, **kw):
        raise FileNotFoundError(args[0])

    monkeypatch.setattr(agent, 'run', missing)
    body = {'url': 'http://circle-api:4000/mcp/', 'token': 'flowie_mcp_' + 'b' * 40}
    assert call('PUT', 'mcp', body) == (200, {'claude': False, 'codex': False})
