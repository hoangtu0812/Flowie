import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupActivityByMonth } from '../features/initiatives/activity/group-activity';

test('activity months separate years and follow the account timezone at UTC boundaries', () => {
   const rows = [
      { id: 'new', createdAt: '2026-01-01T00:30:00' },
      { id: 'prior', createdAt: '2025-01-01T00:30:00Z' },
   ];
   const groups = groupActivityByMonth(rows, 'en-US', 'America/Los_Angeles');
   assert.deepEqual(
      groups.map((group) => [group.key, group.label, group.rows[0].id]),
      [
         ['2025-12', 'December 2025', 'new'],
         ['2024-12', 'December 2024', 'prior'],
      ]
   );
   assert.deepEqual(
      groupActivityByMonth(rows, 'vi-VN', 'Asia/Ho_Chi_Minh').map((group) => group.key),
      ['2026-01', '2025-01']
   );
});
