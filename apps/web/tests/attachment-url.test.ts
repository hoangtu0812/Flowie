import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentIdFromUrl, attachmentPreviewKind } from '../lib/attachment-url';

test('preview links resolve to their attachment on any host or base path', () => {
   for (const src of [
      'https://flowie.dtd.bsr.com.vn/api/v1/attachments/cn9idrg/preview',
      'https://poc-dtd.bsr.com.vn/flowie/api/v1/attachments/cn9idrg/preview',
      'http://localhost:4000/api/v1/attachments/cn9idrg/preview',
      '/flowie/api/v1/attachments/cn9idrg/preview',
   ])
      assert.equal(attachmentIdFromUrl(src), 'cn9idrg', src);
});

test('other images are left alone', () => {
   for (const src of [
      'https://example.com/cat.png',
      'https://example.com/x?u=/api/v1/attachments/cn9idrg/preview',
      'https://flowie.dtd.bsr.com.vn/api/v1/attachments/cn9idrg/download',
      'https://flowie.dtd.bsr.com.vn/api/v1/attachments/../preview',
      'data:image/png;base64,AAAA',
   ])
      assert.equal(attachmentIdFromUrl(src), undefined, src);
});

test('previewable attachments are picked by extension, others only download', () => {
   assert.equal(attachmentPreviewKind('notes.MD'), 'markdown');
   assert.equal(attachmentPreviewKind('spec.pdf'), 'pdf');
   assert.equal(attachmentPreviewKind('mockup.HTML'), 'html');
   assert.equal(attachmentPreviewKind('index 2.htm'), 'html');
   for (const name of ['plan.xlsx', 'data.csv', 'brief.docx', 'run.log'])
      assert.equal(attachmentPreviewKind(name), 'page', name);
   for (const name of ['deck.pptx', 'legacy.xls', 'archive.zip', 'html', 'page.html.exe'])
      assert.equal(attachmentPreviewKind(name), null, name);
});
