import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFeed } from '../features/issues/feed-merge';

test('older page responses cannot erase a newly posted or edited comment', () => {
   const current = [
      { id: 'new', createdAt: '2026-10-14T11:00:00Z', version: 1 },
      { id: 'edited', createdAt: '2026-10-14T10:00:00Z', version: 3 },
   ];
   const result = mergeFeed(current, [
      { id: 'edited', createdAt: '2026-10-14T10:00:00Z', version: 2 },
      { id: 'old', createdAt: '2026-10-14T09:00:00Z', version: 1 },
   ]);
   assert.deepEqual(
      result.map((item) => [item.id, item.version]),
      [
         ['old', 1],
         ['edited', 3],
         ['new', 1],
      ]
   );
});
