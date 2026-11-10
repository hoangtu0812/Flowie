import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initials } from '../lib/initials';

test('Avatar initials keep at most two letters of the person and drop the agent name', () => {
   assert.equal(initials('Pham Hoang Tu · flowie-agent'), 'PT');
   assert.equal(initials('Pham Hong Phuc'), 'PP');
   assert.equal(initials('Flowie'), 'F');
   assert.equal(initials('đỗ  ánh'), 'ĐÁ');
   assert.equal(initials(''), '');
   assert.equal(initials(' · agent'), '');
});
