import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalWorkspacePath, withWorkspaceSegment, workspaceKey } from '../lib/workspace-route';

const memberships = [{ workspace: { id: 'ws-fixed-id', slug: 'bsr-dtd' } }];

test('id links move to the slug and keep their complete destination', () => {
   assert.equal(
      canonicalWorkspacePath('/ws-fixed-id/projects', memberships, '?tab=active#timeline'),
      '/bsr-dtd/projects?tab=active#timeline'
   );
   assert.equal(
      canonicalWorkspacePath('/ws-fixed-id/settings/workspace', memberships),
      '/bsr-dtd/settings/workspace'
   );
   assert.equal(canonicalWorkspacePath('/ws-fixed-id', memberships), '/bsr-dtd');
});

test('slug, unknown, and malformed workspace routes do not redirect', () => {
   for (const path of ['/bsr-dtd/projects', '/old-slug/issue/GEN-1', '/%ZZ/projects', '/'])
      assert.equal(canonicalWorkspacePath(path, memberships), undefined);
});

test('an id wins over another workspace whose slug matches it', () => {
   assert.equal(
      canonicalWorkspacePath('/ws-fixed-id/projects', [
         { workspace: { id: 'other', slug: 'ws-fixed-id' } },
         ...memberships,
      ]),
      '/bsr-dtd/projects'
   );
});

test('the workspace segment is read decoded and replaced in place', () => {
   assert.equal(workspaceKey('/ph%2Dng/issues'), 'ph-ng');
   assert.equal(workspaceKey('/'), undefined);
   assert.equal(
      withWorkspaceSegment('/old-slug/project/fl/docs', 'bsr-dtd', '#tree'),
      '/bsr-dtd/project/fl/docs#tree'
   );
});
