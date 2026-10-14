import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeMemberIssues } from '../features/members/profile-scope';

test('member Created uses the persisted creator rather than an identifier hash', () => {
   const issues = [
      { creatorId: 'a', assignee: { id: 'b' } },
      { creatorId: 'b', assignee: { id: 'a' } },
   ];
   assert.deepEqual(scopeMemberIssues(issues, 'a', 'created'), [issues[0]]);
   assert.deepEqual(scopeMemberIssues(issues, 'a', 'assigned'), [issues[1]]);
   assert.deepEqual(scopeMemberIssues(issues, 'missing', 'created'), []);
});
