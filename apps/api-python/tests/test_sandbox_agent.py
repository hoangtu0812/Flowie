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
            return done(self.sessions[target]['screen'])
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
    finally:
        subprocess.run(['tmux', 'kill-server'], check=False, capture_output=True)
        shutil.rmtree(sockets, ignore_errors=True)
