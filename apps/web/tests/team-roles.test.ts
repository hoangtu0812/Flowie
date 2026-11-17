import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAssignable, isBot } from '../lib/team-roles';

test('Team VIEWERs are hidden from the assignee picker of their own team only', () => {
   const roles = { core: 'VIEWER', ops: 'MEMBER' } as const;
   assert.equal(isAssignable(roles, 'core'), false);
   assert.equal(isAssignable(roles, 'ops'), true);
   assert.equal(isAssignable(roles, 'other'), true);
   assert.equal(isAssignable(roles, null), true);
   assert.equal(isAssignable(undefined, 'core'), true);
});

test('Bot badge follows the BOT role of the given team, or any team without one', () => {
   const roles = { core: 'BOT', ops: 'MEMBER' } as const;
   assert.equal(isBot(roles, 'core'), true);
   assert.equal(isBot(roles, 'ops'), false);
   assert.equal(isBot(roles), true);
   assert.equal(isBot({ ops: 'LEAD' }), false);
   assert.equal(isBot(undefined, 'core'), false);
});
