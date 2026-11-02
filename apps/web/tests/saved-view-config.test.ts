import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureIssueView } from '../features/views/config';

test('capture preserves source scope and compound filters without cursor or workspace identity', () => {
   const filters = [{ columnId: 'priority', type: 'option', operator: 'is not', values: ['low'] }];
   const query = new URLSearchParams({
      workspaceId: 'w',
      teamId: 't',
      categories: 'started,unstarted',
      filters: JSON.stringify(filters),
      cursor: 'old',
      limit: '100',
      includeSubIssues: 'false',
      query: 'Đồng bộ',
   });
   assert.deepEqual(captureIssueView(query.toString()), {
      version: 1,
      teamId: 't',
      query: {
         filters,
         categories: ['started', 'unstarted'],
         includeSubIssues: false,
         query: 'Đồng bộ',
      },
   });
});

test('no-team and no-project scopes survive without inventing a team', () => {
   assert.deepEqual(captureIssueView('noTeam=true&noProject=true&issueType=BUG'), {
      version: 1,
      query: {
         filters: [],
         includeSubIssues: true,
         noTeam: true,
         noProject: true,
         issueType: 'BUG',
      },
   });
   assert.throws(() => captureIssueView('scope=assigned'));
});
