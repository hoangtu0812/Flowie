import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInstant, relativeTime } from '../lib/time';

test('legacy UTC instants and offset instants describe the same moment', () => {
   assert.equal(
      parseInstant('2026-10-14T01:00:00').getTime(),
      parseInstant('2026-10-14T08:00:00+07:00').getTime()
   );
   assert.equal(
      parseInstant('2026-10-14T01:00:00Z').getTime(),
      parseInstant('2026-10-14T01:00:00').getTime()
   );
});

test('relative times distinguish fresh, future and invalid timestamps', () => {
   const now = Date.UTC(2026, 9, 14, 1);
   assert.equal(relativeTime('2026-10-14T01:00:00', now), 'just now');
   assert.equal(relativeTime('2026-10-14T01:05:00Z', now), 'in 5m');
   assert.equal(relativeTime('invalid', now), 'Unknown time');
});
