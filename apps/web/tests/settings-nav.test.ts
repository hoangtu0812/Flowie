import assert from 'node:assert/strict';
import test from 'node:test';
import { findSettingsPage } from '../lib/settings-nav';

const groups = [
   { label: 'Issues', items: [{ name: 'Labels', url: '/settings/issue-labels' }] },
   {
      label: 'AI & integrations',
      items: [
         { name: 'AI & Agents', url: '/settings/ai' },
         { name: 'AI operations', url: '/settings/ai-operations' },
      ],
   },
];

test('the header names the settings page and its group', () => {
   const found = findSettingsPage(groups, 'ws', '/ws/settings/issue-labels');
   assert.deepEqual([found?.group.label, found?.item.name], ['Issues', 'Labels']);
   const nested = findSettingsPage(groups, 'ws', '/ws/settings/ai/models');
   assert.equal(nested?.item.name, 'AI & Agents');
});

test('similar prefixes and unlisted pages do not match the wrong page', () => {
   assert.equal(
      findSettingsPage(groups, 'ws', '/ws/settings/ai-operations')?.item.name,
      'AI operations'
   );
   assert.equal(findSettingsPage(groups, 'ws', '/ws/settings/teams/t1'), undefined);
   assert.equal(findSettingsPage(groups, 'other', '/ws/settings/issue-labels'), undefined);
});
