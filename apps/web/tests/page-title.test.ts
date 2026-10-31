import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentTitle, pageTitle } from '../lib/page-title';

const ws = { workspace: 'BSR DTD' };

test('issues read as identifier, Issue and name, with the project context ignored', () => {
   assert.equal(
      documentTitle(
         pageTitle('/bsr/issue/DTD-60', { entity: 'Tổng hợp các yêu cầu thay đổi UI/UX' })
      ),
      'DTD-60 | Issue: Tổng hợp các yêu cầu thay đổi UI/UX | Flowie'
   );
   assert.equal(pageTitle('/bsr/issue/DTD-60'), 'DTD-60 | Issue');
});

test('project tabs read as project name and tab', () => {
   assert.equal(
      documentTitle(pageTitle('/bsr/project/fl/overview', { entity: 'Flowie' })),
      'Flowie - Overview | Flowie'
   );
   assert.equal(pageTitle('/bsr/project/fl/issues', { entity: 'Flowie' }), 'Flowie - Issue');
   assert.equal(pageTitle('/bsr/project/fl/timeline'), 'Project - Timeline');
   assert.equal(pageTitle('/bsr/project/fl/unknown'), undefined);
});

test('workspace pages carry the workspace name, team pages the team name', () => {
   assert.equal(pageTitle('/bsr', ws), 'Inbox - BSR DTD');
   assert.equal(pageTitle('/bsr/issues/backlog', ws), 'Backlog - BSR DTD');
   assert.equal(pageTitle('/bsr/issues/no-project', ws), 'No project - Issues - BSR DTD');
   assert.equal(
      pageTitle('/bsr/team/GEN/cycle/active', { entity: 'General' }),
      'General - Active cycle'
   );
   assert.equal(pageTitle('/bsr/team/GEN/all'), 'GEN - All issues');
});

test('settings pages name their group', () => {
   assert.equal(pageTitle('/bsr/settings', ws), 'Preferences - Account settings');
   assert.equal(pageTitle('/bsr/settings/security', ws), 'Security & access - Account settings');
   assert.equal(pageTitle('/bsr/settings/audit', ws), 'Audit log - Workspace settings - BSR DTD');
   assert.equal(pageTitle('/bsr/settings/issue-labels', ws), 'Issue labels - Settings - BSR DTD');
   assert.equal(pageTitle('/bsr/settings/teams/new', ws), 'New team - Settings - BSR DTD');
   assert.equal(
      pageTitle('/bsr/settings/teams/c123', { entity: 'General' }),
      'General - Team settings'
   );
});

test('public pages, details and unknown paths', () => {
   assert.equal(pageTitle('/auth/login'), 'Log in');
   assert.equal(pageTitle('/invitations'), 'Workspace invitations');
   assert.equal(pageTitle('/bsr/documents/d1', { entity: 'FDS · Docs' }), 'FDS · Docs - Document');
   assert.equal(pageTitle('/bsr/review/r1/changes', { entity: '#12 Fix' }), '#12 Fix - Changes');
   assert.equal(pageTitle('/bsr/profiles/u1', { entity: 'An', ...ws }), 'An - Profile - BSR DTD');
   assert.equal(pageTitle('/bsr/unknown-page'), undefined);
   assert.equal(documentTitle(undefined), 'Flowie');
});
