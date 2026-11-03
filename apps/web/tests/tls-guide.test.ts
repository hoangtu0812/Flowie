import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tlsProbeCommand } from '../features/ai/tls-guide';

test('TLS checks require HTTPS and exclude credentials', () => {
   for (const endpoint of [
      'http://localhost:4000/mcp/',
      'file:///tmp/ca',
      'not a URL',
      'https://user:secret@example.test/mcp/',
   ])
      assert.equal(tlsProbeCommand(endpoint, 'macOS'), undefined);
   for (const os of ['macOS', 'Windows', 'Linux'] as const) {
      const value = tlsProbeCommand('https://flowie.example.test/flowie/mcp/', os)!;
      assert.ok(value.includes('--cacert') && value.includes('--head --'));
      assert.ok(!value.includes('Authorization') && !value.includes('Bearer'));
      assert.equal(value.startsWith('curl.exe'), os === 'Windows');
   }
});
test('POSIX shell receives the endpoint literally without executing substitutions', () => {
   const endpoint = "https://flowie.example.test/mcp/'$(printf EXPANDED)`printf EXPANDED`";
   const command = tlsProbeCommand(endpoint, 'Linux')!;
   const output = execFileSync('sh', ['-c', `curl() { printf '%s\\n' "$@"; }; ${command}`], {
      encoding: 'utf8',
   });
   assert.equal(output.trim().split('\n').at(-1), endpoint);
   const windows = tlsProbeCommand(endpoint, 'Windows')!;
   assert.ok(windows.includes("mcp/''$(printf EXPANDED)"));
});
