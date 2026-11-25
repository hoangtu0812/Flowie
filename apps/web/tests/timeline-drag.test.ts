import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
   addDays,
   dayWidthOf,
   dragSchedule,
   monthWidthOf,
} from '../components/common/timeline/timeline-scale';
import {
   dependencyPath,
   isLateDependency,
   issueProgress,
   labelFitsInside,
} from '../components/common/timeline/timeline-gantt';
import { hasPlannedDates, issueSpan, outsideParent } from '../lib/issue-span';
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

test('Gantt progress, late dependencies and arrow paths come from real dates and statuses', () => {
   assert.equal(issueProgress('completed', []), 100);
   assert.equal(issueProgress('started', []), 0);
   // Canceled sub-issues do not count against the parent.
   assert.equal(issueProgress('started', ['completed', 'started', 'canceled', 'unstarted']), 33);
   assert.equal(isLateDependency({ end: '2026-11-20', done: false }, '2026-11-18'), true);
   assert.equal(isLateDependency({ end: '2026-11-20', done: true }, '2026-11-18'), false);
   assert.equal(isLateDependency({ end: '2026-11-17', done: false }, '2026-11-18'), false);
   assert.equal(isLateDependency({ end: null, done: false }, '2026-11-18'), false);
   assert.equal(dependencyPath(100, 16, 200, 80, 32), 'M100 16H108V80H200');
   // A blocked bar starting left of the blocker's end turns back between the rows.
   assert.equal(dependencyPath(100, 16, 90, 80, 32), 'M100 16H108V64H82V80H90');
});

test('narrow bars put their label outside, and issues without a start begin no later than their end', () => {
   // A 1–2 day bar at the Week zoom (~32 px per day) cannot hold a normal title.
   assert.equal(labelFitsInside(64, 'Fix login redirect', true), false);
   assert.equal(labelFitsInside(400, 'Fix login redirect', true), true);
   assert.equal(labelFitsInside(140, 'Fix login redirect', false), true);
   // Created after its end date: the bar starts on the end date instead of after it.
   assert.deepEqual(issueSpan({ createdAt: '2026-11-20T08:00:00Z', targetDate: '2026-11-10' }), {
      start: '2026-11-10',
      end: '2026-11-10',
   });
   assert.deepEqual(issueSpan({ createdAt: '2026-11-01T08:00:00Z', dueDate: '2026-11-10' }), {
      start: '2026-11-01',
      end: '2026-11-10',
   });
   assert.equal(hasPlannedDates({ createdAt: '2026-11-01' }), false);
   assert.equal(hasPlannedDates({ createdAt: '2026-11-01', dueDate: '2026-11-10' }), true);
});
