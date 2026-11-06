import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLag } from '../features/operations/format-lag';

test('queue lag uses the two largest units', () => {
   assert.equal(formatLag(0), '0s');
   assert.equal(formatLag(-5), '0s');
   assert.equal(formatLag(59.9), '59s');
   assert.equal(formatLag(60), '1m');
   assert.equal(formatLag(3599), '59m');
   assert.equal(formatLag(49644), '13h 47m');
   assert.equal(formatLag(86400 * 2 + 3600 * 3 + 59), '2d 3h');
});
