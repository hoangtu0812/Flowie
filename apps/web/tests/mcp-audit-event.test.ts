import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAuditEvent } from '../components/settings/mcp/audit-event';

test('tool events read as a label with their outcome', () => {
   assert.deepEqual(describeAuditEvent('mcp.read_attachment_text.succeeded'), {
      label: 'Read attachment text',
      outcome: 'succeeded',
   });
   assert.deepEqual(describeAuditEvent('mcp.get_issue.denied'), {
      label: 'Get issue',
      outcome: 'denied',
   });
});

test('management events have no outcome', () => {
   assert.deepEqual(describeAuditEvent('mcp.connection.updated'), {
      label: 'Connection updated',
      outcome: undefined,
   });
   assert.deepEqual(describeAuditEvent('mcp.repository.removed'), {
      label: 'Repository removed',
      outcome: undefined,
   });
});
