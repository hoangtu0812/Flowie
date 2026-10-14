import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientConfig, CODING_PRESET, READ_PRESET } from '../features/ai/client-config';
test('client templates use environment references and separate read/coding grants', () => {
   const endpoint = 'https://flowie.example.test/mcp/';
   for (const client of ['Codex', 'Cursor', 'Claude Code'] as const) {
      const config = clientConfig(client, endpoint);
      assert.ok(config.includes(endpoint));
      assert.ok(config.includes('FLOWIE_MCP_TOKEN'));
      assert.equal(config.includes('flowie_mcp_'), false);
      if (client !== 'Codex') assert.ok(JSON.parse(config).mcpServers.flowie.url === endpoint);
   }
   assert.ok(READ_PRESET.every((scope) => scope.endsWith(':read')));
   assert.ok(
      CODING_PRESET.includes('issues:transition') && CODING_PRESET.includes('comments:write')
   );
});
