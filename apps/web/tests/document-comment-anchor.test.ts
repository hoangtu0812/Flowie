import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { blockKey, resolveBlock } from '../lib/document-comment-anchor';

test('a comment finds its block again after edits, or reports it gone', () => {
   const texts = ['Intro', 'Rules  apply\nhere', 'Other', 'Rules apply here'];
   // Same text: the copy nearest the old position wins. VI: Cùng chữ: bản gần vị trí cũ thắng.
   assert.equal(resolveBlock(texts, { blockText: 'Rules apply here', blockIndex: 3 }), 3);
   assert.equal(resolveBlock(texts, { blockText: 'Rules apply here', blockIndex: 0 }), 1);
   // Edited block: the quoted phrase still locates it. VI: Đoạn bị sửa: cụm trích vẫn tìm ra.
   assert.equal(
      resolveBlock(['Intro', 'Rules changed, apply'], {
         blockText: 'Rules apply',
         blockIndex: 1,
         quote: 'changed',
      }),
      1
   );
   // A list item and its paragraph both contain the quote: the inner paragraph wins.
   // VI: Mục danh sách và đoạn văn bên trong đều chứa cụm trích: đoạn bên trong thắng.
   assert.equal(
      resolveBlock(['Item text', 'Item text'], { blockText: 'x', blockIndex: 0, quote: 'text' }, [
         [1],
         [],
      ]),
      1
   );
   assert.equal(resolveBlock(texts, { blockText: 'Removed', blockIndex: 1, quote: 'nowhere' }), -1);
   assert.equal(blockKey(' a \n b '), 'a b');
});
