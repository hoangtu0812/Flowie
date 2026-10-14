import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueQueryParams } from '../features/issues/issue-query';
test('server queries preserve personal scope, Unicode search and filter semantics', () => {
   const filters = [
      { columnId: 'issueType', type: 'option', operator: 'is not', values: ['TASK'] },
   ];
   const query = issueQueryParams({
      scope: 'assigned',
      categories: ['unstarted', 'started'],
      query: 'Đồng bộ',
      filters,
      includeSubIssues: false,
   });
   assert.equal(query.get('scope'), 'assigned');
   assert.equal(query.get('query'), 'Đồng bộ');
   assert.equal(query.get('categories'), 'unstarted,started');
   assert.deepEqual(JSON.parse(query.get('filters')!), filters);
   assert.equal(query.get('includeSubIssues'), 'false');
   assert.equal(query.get('limit'), '100');
});
