import os
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[3]
BASH = str(Path(shutil.which('git')).resolve().parents[1] / 'bin/bash.exe') if os.name == 'nt' else shutil.which('bash')


def git(directory, *args):
    return subprocess.check_output(['git', '-C', str(directory), *args], text=True).strip()


@pytest.mark.skipif(not BASH or not Path(BASH).exists(), reason='Bash is unavailable')
def test_deployment_pins_verified_revision_even_when_main_advances(tmp_path):
    origin, checkout = tmp_path / 'origin', tmp_path / 'checkout'
    origin.mkdir()
    git(origin, 'init', '-b', 'main')
    git(origin, 'config', 'user.email', 'deploy@example.test')
    git(origin, 'config', 'user.name', 'Deployment fixture')
    source = origin / 'source.txt'
    source.write_text('verified', encoding='utf-8')
    git(origin, 'add', '.')
    git(origin, 'commit', '-m', 'verified')
    verified = git(origin, 'rev-parse', 'HEAD')
    source.write_text('newer unverified source', encoding='utf-8')
    git(origin, 'commit', '-am', 'later merge')
    subprocess.run(['git', 'clone', str(origin), str(checkout)], check=True, capture_output=True)
    script = ROOT / 'scripts/checkout-production.sh'
    result = subprocess.run([BASH, str(script), str(checkout), verified], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert git(checkout, 'rev-parse', 'HEAD') == verified
    assert (checkout / 'source.txt').read_text() == 'verified'
    (checkout / 'source.txt').write_text('local change', encoding='utf-8')
    rejected = subprocess.run([BASH, str(script), str(checkout), git(origin, 'rev-parse', 'HEAD')], capture_output=True, text=True)
    assert rejected.returncode != 0
    assert (checkout / 'source.txt').read_text() == 'local change'
    invalid = subprocess.run([BASH, str(script), str(checkout), 'main'], capture_output=True, text=True)
    assert invalid.returncode != 0
