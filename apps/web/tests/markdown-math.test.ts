import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import { rehypeMathPlugin, remarkMathPlugin } from '../lib/markdown-math';

const render = (content: string) =>
   renderToStaticMarkup(
      createElement(
         Markdown,
         { skipHtml: true, remarkPlugins: [remarkMathPlugin], rehypePlugins: [rehypeMathPlugin] },
         content
      )
   );

test('inline TeX such as $\\rightarrow$ renders as a MathML arrow, not literal text', () => {
   const html = render('TypeSpec $\\rightarrow$ OpenAPI 3.1');
   assert.match(html, /<math/);
   assert.match(html, /→/);
   assert.doesNotMatch(html, /\$\\rightarrow\$/);
});

test('block math renders as display MathML', () => {
   assert.match(render('$$\na^2 + b^2\n$$'), /<math[^>]*display="block"/);
});

test('math inside code spans stays literal', () => {
   const html = render('`$\\rightarrow$`');
   assert.doesNotMatch(html, /<math/);
   assert.match(html, /<code>\$\\rightarrow\$<\/code>/);
});

test('untrusted commands such as \\href do not produce links', () => {
   assert.doesNotMatch(render('$\\href{javascript:alert(1)}{x}$'), /<a /);
});
