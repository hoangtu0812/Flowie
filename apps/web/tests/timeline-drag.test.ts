import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
   addDays,
   dayWidthOf,
   dragSchedule,
   monthWidthOf,
} from '../components/common/timeline/timeline-scale';
import { outsideParent } from '../lib/issue-span';
import { byManualOrder } from '../features/manual-order/sub-issue-sort';

test('dragging a bar snaps to whole days and never ends before it starts', () => {
   const span = { start: '2026-11-02', end: '2026-11-05' };
   assert.deepEqual(dragSchedule(span, 'move', 3), { start: '2026-11-05', end: '2026-11-08' });
   assert.deepEqual(dragSchedule(span, 'start', -2), { start: '2026-10-31', end: '2026-11-05' });
   assert.deepEqual(dragSchedule(span, 'end', 4), { start: '2026-11-02', end: '2026-11-09' });
   // Resizing past the other edge stops on the same day.
   assert.deepEqual(dragSchedule(span, 'start', 10), { start: '2026-11-05', end: '2026-11-05' });
   assert.deepEqual(dragSchedule(span, 'end', -10), { start: '2026-11-02', end: '2026-11-02' });
   // A bar without an end keeps none when moved; resizing its end sets one.
   assert.deepEqual(dragSchedule({ start: '2026-11-02', end: null }, 'move', 1), {
      start: '2026-11-03',
      end: null,
   });
   assert.equal(addDays('2026-03-28', 2), '2026-03-30');
   assert.equal(addDays('2026-12-31', 1), '2027-01-01');
   assert.ok(Math.abs(dayWidthOf(monthWidthOf('month')) * 30.4 - 480) < 5);
});

test('a sub-issue is outside its parent only on the sides the parent has dates', () => {
   const parent = { createdAt: '2026-10-01', startDate: '2026-11-02', targetDate: '2026-11-20' };
   const child = (startDate: string | null, targetDate: string | null) => ({
      createdAt: '2026-11-03',
      startDate,
      targetDate,
   });
   assert.equal(outsideParent(child('2026-11-03', '2026-11-20'), parent), false);
   assert.equal(outsideParent(child('2026-11-01', '2026-11-10'), parent), true);
   assert.equal(outsideParent(child('2026-11-03', '2026-11-21'), parent), true);
   assert.equal(outsideParent(child(null, null), parent), false);
   assert.equal(
      outsideParent(child('2020-01-01', '2030-01-01'), { createdAt: '2026-10-01' }),
      false
   );
});

test('manual order follows the stored position, then id, like the sub-issues API', () => {
   const rows = [
      { id: 'c', manualOrder: '2048' },
      { id: 'b', manualOrder: '1024' },
      { id: 'a', manualOrder: '2048' },
      { id: 'd', manualOrder: '9007199254740993' },
   ];
   assert.deepEqual(
      byManualOrder(rows).map((row) => row.id),
      ['b', 'a', 'c', 'd']
   );
});
