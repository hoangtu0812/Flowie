import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, reportWeekStart } from '../features/shared/date-format';
import { messageText } from '../features/shared/messages';
import { initialAssignee } from '../features/issues/create-defaults';
test('account formatting separates date-only values from instants across timezones', () => {
   assert.equal(formatDate('2026-10-15', 'en-US', 'America/Los_Angeles'), 'Oct 15, 2026');
   assert.equal(
      formatDate('2026-10-15T00:30:00Z', 'en-US', 'America/Los_Angeles'),
      'Oct 14, 2026, 5:30 PM'
   );
   assert.equal(
      formatDate('2026-10-15T00:30:00', 'en-US', 'America/Los_Angeles'),
      'Oct 14, 2026, 5:30 PM'
   );
   assert.equal(
      formatDate('2026-10-15T00:30:00Z', 'vi-VN', 'Asia/Ho_Chi_Minh'),
      '07:30 15 thg 10, 2026'
   );
   assert.equal(formatDate('invalid', 'en-US', 'UTC'), '—');
});
test('UI interpolation preserves user text without recursively translating it', () => {
   const text = { 'Archived {title}': 'Đã lưu trữ {title}' };
   assert.equal(
      messageText('vi', text, 'Archived {title}', { title: 'Archived {title} <script>' }),
      'Đã lưu trữ Archived {title} <script>'
   );
   assert.equal(
      messageText('en', text, 'Archived {title}', { title: 'Tài liệu' }),
      'Archived Tài liệu'
   );
});
test('optional self-assignment only picks the current eligible member', () => {
   const members = [
      { id: 'me', name: 'Account', email: 'me@example.test' },
      { id: 'other', name: 'Other', email: 'other@example.test' },
   ];
   assert.equal(initialAssignee(members, 'me', false, 'GEN'), null);
   assert.equal(initialAssignee(members, 'lost', true, 'GEN'), null);
   assert.equal(initialAssignee(members, 'me', true, 'GEN')?.id, 'me');
});

test('calendar and report weekday conventions describe the same selected day', () => {
   assert.equal(reportWeekStart(1), 0);
   assert.equal(reportWeekStart(0), 6);
   assert.equal(reportWeekStart(6), 5);
});
