import assert from 'node:assert/strict';
import test from 'node:test';
import { preferredWorkspaceSlug, resolveWorkspaceRoot } from '../lib/workspace-root';

const base = {
   adminAccessible: false,
   workspacesAccessible: true,
   invitationCount: 0,
   defaultHome: 'inbox' as const,
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

test('uses the saved workspace even for admins and respects the home view', () => {
   assert.equal(
      resolveWorkspaceRoot({
         ...base,
         adminAccessible: true,
         preferredWorkspaceSlug: 'design',
         workspaceSlug: 'first',
         defaultHome: 'my-issues',
      }),
      '/design/my-issues'
   );
   assert.equal(
      resolveWorkspaceRoot({
         ...base,
         workspacesAccessible: false,
         preferredWorkspaceSlug: 'design',
      }),
      '/auth/login'
   );
});

test('resolves a saved workspace by stable ID to its current slug and ignores removed memberships', () => {
   const memberships = [
      { workspace: { id: 'one', slug: 'renamed' } },
      { workspace: { id: 'two', slug: 'second' } },
   ];
   assert.equal(preferredWorkspaceSlug(memberships, 'one'), 'renamed');
   assert.equal(preferredWorkspaceSlug(memberships, 'two'), 'second');
   assert.equal(preferredWorkspaceSlug(memberships, 'revoked'), undefined);
   assert.equal(preferredWorkspaceSlug(memberships, null), undefined);
   assert.equal(
      resolveWorkspaceRoot({
         ...base,
         workspaceSlug: 'renamed',
         preferredWorkspaceSlug: preferredWorkspaceSlug(memberships, 'revoked'),
      }),
      '/renamed/inbox'
   );
});
