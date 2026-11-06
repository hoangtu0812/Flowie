import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeHeadingIndex } from '../lib/markdown-headings';

test('the contents highlight follows the last heading scrolled past the reading line', () => {
   assert.equal(activeHeadingIndex([10, 400, 900], 80, false), 0);
   assert.equal(activeHeadingIndex([-500, 60, 700], 80, false), 1);
   assert.equal(activeHeadingIndex([-900, -300, 80], 80, false), 2);
   assert.equal(activeHeadingIndex([-900, -300, 300], 80, true), 2);
});
