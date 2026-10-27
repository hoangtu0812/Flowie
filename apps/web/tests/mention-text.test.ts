import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
   insertMention,
   splitMentions,
   mentionSearchKey,
   trailingMentionQuery,
} from '../features/issues/mention-text';

test('a mention query is read only while it is being typed at the end', () => {
   assert.equal(trailingMentionQuery('@'), '');
   assert.equal(trailingMentionQuery('Please check @tu'), 'tu');
   assert.equal(trailingMentionQuery('mail me at tu@example.test'), null);
   assert.equal(trailingMentionQuery('@tu done'), null);
});

test('mention search ignores case and Vietnamese diacritics', () => {
   assert.equal(mentionSearchKey('Phạm Hoàng Từ'), 'pham hoang tu');
   assert.equal(mentionSearchKey('Đinh Đoàn'), 'dinh doan');
});

test('choosing a member replaces the typed query or appends the mention', () => {
   assert.equal(insertMention('Please check @tu', 'Pham Hoang Tu'), 'Please check @Pham Hoang Tu ');
   assert.equal(insertMention('Looks good', 'Khoa'), 'Looks good @Khoa ');
   assert.equal(insertMention('', 'Khoa'), '@Khoa ');
});

test('only mentioned names are split out, longest name first', () => {
   assert.deepEqual(splitMentions('Hi @Pham Hong Phuc, please check', ['Pham Hong Phuc']), [
      'Hi ',
      { mention: '@Pham Hong Phuc' },
      ', please check',
   ]);
   assert.deepEqual(splitMentions('@Tu Pham and @Tu', ['Tu', 'Tu Pham']), [
      { mention: '@Tu Pham' },
      ' and ',
      { mention: '@Tu' },
   ]);
   assert.deepEqual(splitMentions('@Từ ơi', ['Từ']), [{ mention: '@Từ' }, ' ơi']);
});

test('lookalikes, e-mail addresses and unknown names stay plain', () => {
   for (const text of ['mail tu@Tu.vn', '@Tuan is here', '@@Tu', '@Khoa only'])
      assert.deepEqual(splitMentions(text, ['Tu']), [text], text);
   assert.deepEqual(splitMentions('@Tu', []), ['@Tu']);
   assert.deepEqual(splitMentions('@A.B', ['A.B']), [{ mention: '@A.B' }]);
});
