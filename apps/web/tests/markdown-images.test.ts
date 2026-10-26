import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageReferences, removeImageReference } from '../lib/markdown-images';

const preview = (id: string) => `https://flowie.example/api/v1/attachments/${id}/preview`;

test('image references expose alt text, source and offsets in document order', () => {
   const value = `Intro\n![first.png](${preview('a')})\nMiddle\n![second.png](${preview('b')})\n`;
   const references = imageReferences(value);
   assert.deepEqual(
      references.map((reference) => reference.alt),
      ['first.png', 'second.png']
   );
   assert.deepEqual(
      references.map((reference) => reference.src),
      [preview('a'), preview('b')]
   );
   for (const reference of references) {
      assert.equal(
         value.slice(reference.start, reference.end),
         `![${reference.alt}](${reference.src})`
      );
   }
});

test('a link that is not an image is left alone', () => {
   assert.deepEqual(imageReferences('see [the report](https://flowie.example/report)'), []);
});

test('removing an image keeps the surrounding text on separate lines', () => {
   const value = `Intro\n![shot.png](${preview('a')})\nOutro`;
   const [reference] = imageReferences(value);
   assert.equal(removeImageReference(value, reference), 'Intro\nOutro');
});

test('removing the only image empties the draft', () => {
   const value = `![shot.png](${preview('a')})\n`;
   assert.equal(removeImageReference(value, imageReferences(value)[0]), '');
});

test('removing one of several images leaves the rest intact', () => {
   const value = `![a.png](${preview('a')})\n![b.png](${preview('b')})\n![c.png](${preview('c')})\n`;
   const next = removeImageReference(value, imageReferences(value)[1]);
   assert.deepEqual(
      imageReferences(next).map((reference) => reference.alt),
      ['a.png', 'c.png']
   );
});
