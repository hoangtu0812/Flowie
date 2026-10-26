import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalWorkspacePath } from '../lib/workspace-route';

const memberships = [{ workspace: { id: 'ws-fixed-id', slug: 'ph-ng-chuy-n-i-s' } }];

test('legacy deep links preserve their complete destination', () => {
   assert.equal(
      canonicalWorkspacePath('/ph-ng-chuy-n-i-s/projects', memberships, '?tab=active#timeline'),
      '/ws-fixed-id/projects?tab=active#timeline'
   );
   assert.equal(
      canonicalWorkspacePath('/ph-ng-chuy-n-i-s/settings/workspace', memberships),
      '/ws-fixed-id/settings/workspace'
   );
   assert.equal(canonicalWorkspacePath('/ph-ng-chuy-n-i-s', memberships), '/ws-fixed-id');
});

test('canonical, unknown, and malformed workspace routes do not redirect', () => {
   for (const path of ['/ws-fixed-id/projects', '/unavailable/issue/GEN-1', '/%ZZ/projects', '/'])
      assert.equal(canonicalWorkspacePath(path, memberships), undefined);
});

test('IDs take precedence over a legacy slug and encoded slugs resolve', () => {
   assert.equal(
      canonicalWorkspacePath('/ws-fixed-id/projects', [
         ...memberships,
         { workspace: { id: 'other', slug: 'ws-fixed-id' } },
      ]),
      undefined
   );
   assert.equal(
      canonicalWorkspacePath('/ph%2Dng-chuy-n-i-s/issues', memberships),
      '/ws-fixed-id/issues'
   );
});
