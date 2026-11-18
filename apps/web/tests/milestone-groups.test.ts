import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareMilestones } from '../features/issues/milestone-groups';

test('milestones sort by target date, undated last, then by title', () => {
   const sorted = [
      { id: 'u', title: 'undated' },
      { id: 'l', title: 'Late', targetDate: '2026-12-31' },
      { id: 'b', title: 'beta', targetDate: '2026-11-30' },
      { id: 'a', title: 'Alpha', targetDate: '2026-11-30' },
      { id: 'n', title: 'Another', targetDate: null },
   ].sort(compareMilestones);
   assert.deepEqual(
      sorted.map((milestone) => milestone.id),
      ['a', 'b', 'l', 'n', 'u']
   );
});
