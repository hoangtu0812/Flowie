import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MarkdownManager } from '@tiptap/markdown';
import {
   descriptionDocument,
   safeDescriptionLink,
   sameMarkdownMeaning,
} from '../features/issues/description-markdown';
import { descriptionExtensions } from '../features/issues/description-schema';

const markdown = new MarkdownManager({
   extensions: descriptionExtensions,
   markedOptions: { gfm: true },
});

test('CommonMark and GFM formatting remains editable without losing semantic content', () => {
   const source =
      '# Goal\n\n**bold** and *italic* with [link](https://example.com).\n\n- [x] Done\n- [ ] Open\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\n```ts\nconst value = 1;\n```\n\n![image](blob:test)';
   const doc = descriptionDocument(source, markdown);
   assert.equal(
      doc.content?.some((node) => node.type === 'markdownSource'),
      false
   );
   assert(sameMarkdownMeaning(source, markdown.serialize(doc)));
});

test('advanced syntax survives editing a neighboring paragraph as inert source', () => {
   for (const source of [
      '<script>alert(1)</script>',
      '$$\nx^2\n$$',
      'See [note][ref].\n\n[ref]: https://example.com',
      'Text[^a]\n\n[^a]: Footnote',
   ]) {
      const doc = descriptionDocument(source, markdown);
      assert(doc.content?.some((node) => node.type === 'markdownSource'));
      doc.content?.push({ type: 'paragraph', content: [{ type: 'text', text: 'New paragraph' }] });
      const serialized = markdown.serialize(doc);
      assert(sameMarkdownMeaning(source, serialized.replace(/\n+New paragraph$/, '')));
   }
});

test('safe links reject executable schemes and whitespace obfuscation', () => {
   for (const url of [
      'https://example.com',
      'http://example.com/a',
      'mailto:test@example.com',
      '/issues/1',
      '#part',
   ])
      assert(safeDescriptionLink(url));
   for (const url of [
      'javascript:alert(1)',
      'data:text/html,test',
      '//example.com',
      ' https://example.com',
      'java\nscript:alert(1)',
   ])
      assert(!safeDescriptionLink(url));
});
