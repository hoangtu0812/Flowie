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
