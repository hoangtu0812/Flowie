import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastedUrl, titledLink } from '../lib/link-paste';

test('only a single http(s) link counts as a pasted URL', () => {
   assert.equal(
      pastedUrl('https://github.com/ln-dev7/circle\n'),
      'https://github.com/ln-dev7/circle'
   );
   assert.equal(pastedUrl('see https://github.com'), undefined);
   assert.equal(pastedUrl('javascript:alert(1)'), undefined);
   assert.equal(pastedUrl('ftp://example.com'), undefined);
});

test('the pasted URL becomes a titled link only where it still sits', () => {
   const url = 'https://github.com/ln-dev7/circle';
   assert.equal(
      titledLink(`UI ${url} ok`, 3, url, 'ln-dev7/circle [UI]'),
      `UI [ln-dev7/circle \\[UI\\]](${url}) ok`
   );
   assert.equal(titledLink(`UI edited ${url}`, 3, url, 'x'), undefined);
   assert.equal(titledLink(`[label](${url})`, 8, url, 'x'), undefined);
});
