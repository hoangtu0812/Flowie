import assert from 'node:assert/strict';
import test from 'node:test';
import { issueSpan } from '../lib/issue-span';

const created = '2026-10-27T03:00:00.000Z';

test('the planned schedule decides where an issue bar starts and ends', () => {
   assert.deepEqual(
      issueSpan({
         createdAt: created,
         startDate: '2026-11-04T00:00:00',
         targetDate: '2026-11-10T00:00:00',
         dueDate: '2026-11-20T00:00:00',
      }),
      { start: '2026-11-04', end: '2026-11-10' }
   );
});

test('creation day and due date fill in only when the schedule is missing', () => {
   assert.deepEqual(issueSpan({ createdAt: created, dueDate: '2026-11-10' }), {
      start: '2026-10-27',
      end: '2026-11-10',
   });
   assert.deepEqual(issueSpan({ createdAt: created, startDate: '2026-11-01', dueDate: null }), {
      start: '2026-11-01',
      end: null,
   });
   assert.deepEqual(issueSpan({ createdAt: created, targetDate: '2026-11-05' }), {
      start: '2026-10-27',
      end: '2026-11-05',
   });
});
