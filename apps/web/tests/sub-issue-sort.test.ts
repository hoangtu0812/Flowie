import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortSubIssues } from '../features/manual-order/sub-issue-sort';
test('sub-issue sorting uses numeric IDs and workflow position without mutating manual order', () => {
   const items = [
      { id: 'b', identifier: 'DTD-10', status: { id: 'done' } },
      { id: 'a', identifier: 'DTD-2', status: { id: 'todo' } },
   ];
   const statuses = [{ id: 'todo' }, { id: 'done' }];
   for (const sort of ['identifier-asc', 'status-asc'] as const)
      assert.deepEqual(
         sortSubIssues(items, sort, statuses).map((i) => i.id),
         ['a', 'b']
      );
   for (const sort of ['identifier-desc', 'status-desc', 'manual'] as const)
      assert.deepEqual(
         sortSubIssues(items, sort, statuses).map((i) => i.id),
         ['b', 'a']
      );
   assert.deepEqual(
      items.map((i) => i.id),
      ['b', 'a']
   );
});
