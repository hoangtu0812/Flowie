import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderNotifications } from '../features/inbox/notification-order';

test('Inbox orders by original instants and keeps unread-first independent of direction', () => {
   const items = [
      { id: 'old', read: false, timestamp: '2h', notificationCreatedAt: '2026-10-14T09:00:00' },
      { id: 'new', read: true, timestamp: '5m', notificationCreatedAt: '2026-10-14T11:00:00Z' },
      { id: 'unknown', read: true, timestamp: 'now', notificationCreatedAt: 'invalid' },
   ];
   assert.deepEqual(
      orderNotifications(items, true, false).map((item) => item.id),
      ['new', 'old', 'unknown']
   );
   assert.deepEqual(
      orderNotifications(items, true, true).map((item) => item.id),
      ['old', 'new', 'unknown']
   );
   assert.deepEqual(
      items.map((item) => item.id),
      ['old', 'new', 'unknown']
   );
});
