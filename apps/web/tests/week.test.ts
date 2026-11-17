import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDay, mondayOf } from '../lib/week';

test('Timesheet weeks start on Monday and move across months and years', () => {
   assert.equal(mondayOf('2026-11-19'), '2026-11-16');
   assert.equal(mondayOf('2026-11-16'), '2026-11-16');
   assert.equal(mondayOf('2026-11-22'), '2026-11-16');
   assert.equal(mondayOf('2026-11-19', -3), '2026-10-26');
   assert.equal(mondayOf('2026-12-31', 1), '2027-01-04');
   assert.equal(localDay(new Date(2026, 0, 5)), '2026-01-05');
});
