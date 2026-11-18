import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupBySubProject, NO_SUB_PROJECT } from '../features/issues/sub-project-groups';

test('sub project grouping repeats multi-labelled issues and ends with the empty group', () => {
   const web = { id: 'w', name: 'web', color: '#111111' };
   const api = { id: 'a', name: 'API', color: '#222222' };
   const groups = groupBySubProject([
      { id: '1', subProjectLabels: [web, api] },
      { id: '2', subProjectLabels: [web] },
      { id: '3', subProjectLabels: [] },
      { id: '4' },
   ]);
   assert.deepEqual(
      groups.map((group) => [group.id, group.issues.map((issue) => issue.id)]),
      [
         ['a', ['1']],
         ['w', ['1', '2']],
         [NO_SUB_PROJECT, ['3', '4']],
      ]
   );
   assert.deepEqual(
      groupBySubProject([{ id: '1', subProjectLabels: [api] }]).map((g) => g.id),
      ['a']
   );
});
