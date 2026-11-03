import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleColumnSort } from '../features/issues/column-sorting';
import { issueQueryParams } from '../features/issues/issue-query';
test('column sorting cycles and supports additive priorities', () => {
   const a = toggleColumnSort([], 'title', false);
   assert.deepEqual(a, [{ key: 'title', direction: 'asc' }]);
   const b = toggleColumnSort(a, 'project', true);
   assert.deepEqual(
      b.map((i) => i.key),
      ['title', 'project']
   );
   const c = toggleColumnSort(b, 'title', true);
   assert.equal(c[0].direction, 'desc');
   assert.deepEqual(toggleColumnSort(c, 'title', true), [{ key: 'project', direction: 'asc' }]);
   assert.deepEqual(toggleColumnSort(c, 'title', false), []);
   assert.deepEqual(JSON.parse(issueQueryParams({ sort: b }).get('sort')!), b);
});
