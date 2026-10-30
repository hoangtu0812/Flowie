import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
   CLIENTS,
   clientConfig,
   CODING_PRESET,
   installCommand,
   installLink,
   READ_PRESET,
   TOKEN_PLACEHOLDER,
} from '../features/ai/client-config';

const endpoint = 'https://flowie.example.test/mcp/';
const token = 'flowie_mcp_test-Token_123';

test('client configurations embed the token or a placeholder', () => {
   for (const client of CLIENTS) {
      for (const value of [token, undefined]) {
         const config = clientConfig(client, endpoint, value);
         assert.ok(config.includes(endpoint));
         assert.ok(config.includes(`Bearer ${value ?? TOKEN_PLACEHOLDER}`));
         if (client !== 'Codex') assert.ok(JSON.parse(config));
      }
   }
   assert.equal(
      JSON.parse(clientConfig('Antigravity', endpoint, token)).mcpServers.flowie.serverUrl,
      endpoint
   );
   assert.equal(JSON.parse(clientConfig('VS Code', endpoint, token)).servers.flowie.type, 'http');
   assert.ok(READ_PRESET.every((scope) => scope.endsWith(':read')));
   assert.ok(
      CODING_PRESET.includes('issues:transition') && CODING_PRESET.includes('comments:write')
   );
});

test('install commands are re-runnable and never duplicate the Codex table', () => {
   for (const os of ['macOS', 'Windows'] as const) {
      const claude = installCommand('Claude Code', os, endpoint, token)!;
      assert.ok(claude.indexOf('claude mcp remove') < claude.indexOf('claude mcp add'));
      assert.ok(claude.includes(`--header "Authorization: Bearer ${token}"`));
      const codex = installCommand('Codex', os, endpoint, token)!;
      assert.ok(codex.includes('codex mcp remove flowie'));
      assert.ok(codex.includes('^\\[mcp_servers\\.flowie\\]'));
      assert.ok(codex.includes(`http_headers = { Authorization = "Bearer ${token}" }`));
      assert.equal(installCommand('Cursor', os, endpoint, token), undefined);
   }
   assert.match(
      installCommand('Codex', 'macOS', endpoint)!,
      /<<'EOF'\n\n\[mcp_servers\.flowie\][^]*\nEOF\nfi$/
   );
   assert.match(
      installCommand('Codex', 'Windows', endpoint)!,
      /@'\n\n\[mcp_servers\.flowie\][^]*\n'@\n}$/
   );
});

test('one-click links carry the server, URL and token header', () => {
   const cursor = new URL(installLink('Cursor', endpoint, token)!);
   assert.equal(cursor.searchParams.get('name'), 'flowie');
   assert.deepEqual(JSON.parse(atob(cursor.searchParams.get('config')!)), {
      url: endpoint,
      headers: { Authorization: `Bearer ${token}` },
   });
   const vscode = installLink('VS Code', endpoint, token)!;
   assert.deepEqual(JSON.parse(decodeURIComponent(vscode.slice('vscode:mcp/install?'.length))), {
      name: 'flowie',
      type: 'http',
      url: endpoint,
      headers: { Authorization: `Bearer ${token}` },
   });
   assert.equal(installLink('Codex', endpoint, token), undefined);
});
