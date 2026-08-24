import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWorkspaceRoot } from '../lib/workspace-root.ts';

const base = {
   adminAccessible: false,
   workspacesAccessible: true,
   invitationCount: 0,
   defaultHome: 'inbox',
};

test('keeps the existing root destinations in priority order', () => {
   assert.equal(resolveWorkspaceRoot({ ...base, adminAccessible: true }), '/admin');
   assert.equal(resolveWorkspaceRoot({ ...base, workspacesAccessible: false }), '/auth/login');
   assert.equal(
      resolveWorkspaceRoot({ ...base, workspaceSlug: 'product', defaultHome: 'my-issues' }),
      '/product/my-issues'
   );
   assert.equal(resolveWorkspaceRoot({ ...base, invitationCount: 1 }), '/invitations');
});

test('returns the onboarding state for an authenticated account with no destination', () => {
   assert.equal(resolveWorkspaceRoot(base), null);
});
