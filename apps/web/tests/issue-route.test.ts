import assert from 'node:assert/strict';
import test from 'node:test';
import { isOpenedFromProject, isProjectPath, issueHref } from '../lib/issue-route';

test('only project pages mark issue links as opened from a project', () => {
   for (const path of ['/ws/project/p1/issues', '/ws/project/p1/overview', '/ws/project/p1'])
      assert.equal(isProjectPath(path), true, path);
   for (const path of ['/ws/projects', '/ws/team/DTD/all', '/ws/issues', '/ws/issue/DTD-1', null])
      assert.equal(isProjectPath(path), false, String(path));
});

test('issue links carry the marker the issue header reads back', () => {
   assert.equal(issueHref('ws', 'DTD-15'), '/ws/issue/DTD-15');
   const href = issueHref('ws', 'DTD-15', true);
   assert.equal(href, '/ws/issue/DTD-15?from=project');
   assert.equal(isOpenedFromProject(new URLSearchParams(href.split('?')[1])), true);
   assert.equal(isOpenedFromProject(new URLSearchParams('from=team')), false);
   assert.equal(isOpenedFromProject(null), false);
});
