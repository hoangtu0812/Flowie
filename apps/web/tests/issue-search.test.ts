import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchIssueCollection } from '../features/issues/search';

test('search honors the supplied view scope and supports Vietnamese queries', () => {
   const assigned = [{ identifier: 'GEN-1', title: 'Đổi trạng thái công việc' }];
   assert.equal(searchIssueCollection(assigned, 'doi trang thai')[0].identifier, 'GEN-1');
   assert.deepEqual(searchIssueCollection(assigned, 'unassigned'), []);
   assert.equal(searchIssueCollection(assigned, 'GEN-1').length, 1);
   assert.deepEqual(searchIssueCollection(assigned, ' '), []);
});
