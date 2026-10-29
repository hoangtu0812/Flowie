import assert from 'node:assert/strict';
import test from 'node:test';
import { issueTree } from '../lib/issue-tree';

test('three levels nest and an issue whose parent is not listed stays visible as a root', () => {
   const { roots, children } = issueTree([
      { id: 'a', parentIssueId: null },
      { id: 'b', parentIssueId: 'a' },
      { id: 'c', parentIssueId: 'b' },
      { id: 'orphan', parentIssueId: 'other-project' },
   ]);
   assert.deepEqual(
      roots.map((issue) => issue.id),
      ['a', 'orphan']
   );
   assert.deepEqual(
      children.get('a')?.map((issue) => issue.id),
      ['b']
   );
   assert.deepEqual(
      children.get('b')?.map((issue) => issue.id),
      ['c']
   );
});
