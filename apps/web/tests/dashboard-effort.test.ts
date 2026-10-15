import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effortSeries } from '../features/dashboard/effort-series';

test('dashboard effort buckets preserve totals across DST and the account week start', () => {
   const rows = Array.from({ length: 60 }, (_, index) => {
      const date = new Date('2026-03-01T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + index);
      return { day: date.toISOString().slice(0, 10), estimated: 0.5, actual: index % 2 };
   });
   for (const weekStart of [0, 5, 6]) {
      const grouped = effortSeries(rows, weekStart);
      assert.equal(
         grouped.reduce((sum, row) => sum + row.estimated, 0),
         30
      );
      assert.equal(
         grouped.reduce((sum, row) => sum + row.actual, 0),
         30
      );
      assert.ok(
         grouped.every(
            (row) => new Date(row.day + 'T00:00:00Z').getUTCDay() === (weekStart + 1) % 7
         )
      );
   }
});
