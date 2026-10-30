import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalProjectPath, projectPath } from '../lib/project-route';

test('project links use the slug and fall back to the id', () => {
   assert.equal(projectPath('ws', { id: 'cabc', slug: 'flowie' }), '/ws/project/flowie/overview');
   assert.equal(projectPath('ws', { id: 'cabc' }, 'docs'), '/ws/project/cabc/docs');
   assert.equal(projectPath('ws', { id: 'cabc', slug: null }, 'issues'), '/ws/project/cabc/issues');
});

test('an id or old slug URL becomes the current slug with its subpath and suffix', () => {
   assert.equal(
      canonicalProjectPath('/ws/project/cabc/issues', 'flowie', '?view=board#top'),
      '/ws/project/flowie/issues?view=board#top'
   );
   assert.equal(
      canonicalProjectPath('/ws/project/old-name/docs', 'flowie'),
      '/ws/project/flowie/docs'
   );
   assert.equal(canonicalProjectPath('/ws/project/cabc', 'flowie'), '/ws/project/flowie');
});

test('a URL that already uses the slug, or is not a project URL, is left alone', () => {
   assert.equal(canonicalProjectPath('/ws/project/flowie/issues', 'flowie'), undefined);
   assert.equal(canonicalProjectPath('/ws/team/GEN/all', 'flowie'), undefined);
   assert.equal(canonicalProjectPath('/ws/project/%E0%A4%A/issues', 'flowie'), undefined);
});
