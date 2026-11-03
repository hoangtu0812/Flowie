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

test('optimistic ordering moves a sibling without discarding intervening descendants', async () => {
   const { moveInList } = await import('../features/manual-order/order');
   const items = [{ id: 'a' }, { id: 'child-a', parentIssueId: 'a' }, { id: 'b' }];
   assert.deepEqual(
      moveInList(items, 'b', 'a', 'before').map((i) => i.id),
      ['b', 'a', 'child-a']
   );
   assert.deepEqual(
      items.map((i) => i.id),
      ['a', 'child-a', 'b']
   );
});
