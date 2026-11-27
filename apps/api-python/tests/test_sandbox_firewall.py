"""The host firewall's rules for the sandbox bridge, built with a fake iptables (docs/sandbox.md)."""

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'infrastructure/sandbox/sandbox-firewall.sh'


def forward_rules(tmp_path, **env):
    log = tmp_path / 'iptables.log'
    for name, body in (
        ('iptables', f'echo "$*" >> {log}\ncase "$1" in -C) exit 1 ;; esac'),
        ('modprobe', ''),
        ('sysctl', ''),
    ):
        tool = tmp_path / name
        tool.write_text(f'#!/bin/sh\n{body}\n')
        tool.chmod(0o755)
    subprocess.run(
        ['bash', str(SCRIPT), 'apply'], check=True,
        # An internal git server is allowed too (macOS's bash 3.2 also refuses an empty list).
        env={**os.environ, 'PATH': f'{tmp_path}:{os.environ["PATH"]}', 'SANDBOX_ALLOW': '10.9.9.9:22', **env},
    )
    return [line.removeprefix('-A FLOWIE-SANDBOX ') for line in log.read_text().splitlines() if line.startswith('-A FLOWIE-SANDBOX ')]


def test_sandboxes_reach_only_the_api_port_before_everything_private_is_dropped(tmp_path):
    rules = forward_rules(tmp_path)
    api = '-d 172.31.250.2 -p tcp --dport 4000 -j RETURN'
    assert api in rules
    assert rules.index(api) < rules.index('-o flowie-sbx0 -j DROP') < rules.index('-d 192.168.0.0/16 -j DROP')
    assert [rule for rule in rules if '172.31.250.2' in rule] == ['-s 172.31.250.2 -j RETURN', api]
    assert rules.index('-d 10.9.9.9 -p tcp --dport 22 -j RETURN') < rules.index('-d 10.0.0.0/8 -j DROP')


def test_an_empty_api_port_closes_the_api_too(tmp_path):
    assert not any('172.31.250.2 -p tcp' in rule for rule in forward_rules(tmp_path, SANDBOX_API_PORT=''))
