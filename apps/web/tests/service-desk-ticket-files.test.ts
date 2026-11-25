import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastedFiles } from '../features/service-desk/ticket-files';

const clipboard = (files: File[], text = '') => ({
   clipboardData: {
      files: files as unknown as FileList,
      getData: (type: string) => (type === 'text/plain' ? text : ''),
   },
});

test('pasted screenshots get distinct names and other files keep theirs', () => {
   const files = pastedFiles(
      clipboard([
         new File(['a'], 'image.png', { type: 'image/png' }),
         new File(['b'], 'image.png', { type: 'image/jpeg' }),
         new File(['c'], 'report.pdf', { type: 'application/pdf' }),
      ])
   );
   assert.match(files[0].name, /^screenshot-\d+-1\.png$/);
   assert.match(files[1].name, /^screenshot-\d+-2\.jpeg$/);
   assert.equal(files[2].name, 'report.pdf');
   assert.equal(files[0].type, 'image/png');
});

// VI: Chữ chép từ Word/Excel kèm ảnh của chính nó; lần dán đó phải giữ là chữ.
test('a paste that carries text stays a text paste', () => {
   const picture = new File(['a'], 'image.png', { type: 'image/png' });
   assert.deepEqual(pastedFiles(clipboard([picture], 'Total 42')), []);
});
