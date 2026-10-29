import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMarkdown, type MarkdownAction } from '../lib/markdown-format';

/** Applies an action and returns the new text with the selection marked as `[...]`. */
function run(value: string, start: number, end: number, action: MarkdownAction) {
   const edit = formatMarkdown(value, start, end, action);
   const next = value.slice(0, edit.from) + edit.text + value.slice(edit.to);
   return (
      next.slice(0, edit.selectionStart) +
      '[' +
      next.slice(edit.selectionStart, edit.selectionEnd) +
      ']' +
      next.slice(edit.selectionEnd)
   );
}

test('inline markers wrap the selection and a second press unwraps it', () => {
   assert.equal(run('say hi now', 4, 6, 'bold'), 'say **[hi]** now');
   assert.equal(run('say **hi** now', 6, 8, 'bold'), 'say [hi] now');
   assert.equal(run('say **hi** now', 4, 10, 'bold'), 'say [hi] now');
   assert.equal(run('a', 1, 1, 'strike'), 'a~~[]~~');
   assert.equal(run('x', 0, 1, 'code'), '`[x]`');
   assert.equal(run('x', 0, 1, 'italic'), '_[x]_');
});

test('headings replace an existing level and toggle off on the same level', () => {
   assert.equal(run('Title', 2, 2, 'h1'), '# Title[]');
   assert.equal(run('# Title', 3, 3, 'h2'), '## Title[]');
   assert.equal(run('## Title', 3, 3, 'h2'), 'Title[]');
   assert.equal(run('### Title', 3, 3, 'h2'), '## Title[]');
});

test('list prefixes apply to every selected line, skip blank lines and toggle off', () => {
   const value = 'a\n\nb\nc';
   assert.equal(run(value, 0, value.length, 'ordered'), '[1. a\n\n2. b\n3. c]');
   assert.equal(run('- a\n- b', 0, 7, 'ordered'), '[1. a\n2. b]');
   assert.equal(run('1. a\n2. b', 0, 9, 'ordered'), '[a\nb]');
   assert.equal(run('x\ny', 0, 2, 'bullet'), '- x[]\ny');
   assert.equal(run('', 0, 0, 'quote'), '> []');
   assert.equal(run('> q', 0, 0, 'quote'), 'q[]');
});

test('code blocks put fences on their own lines', () => {
   assert.equal(run('a code b', 2, 6, 'codeBlock'), 'a \n```\n[code]\n```\n b');
   assert.equal(run('', 0, 0, 'codeBlock'), '```\n[]\n```');
});

test('links select the url placeholder, or the label when it is empty', () => {
   assert.equal(run('see docs', 4, 8, 'link'), 'see [docs]([url])');
   assert.equal(run('', 0, 0, 'image'), '![[]](url)');
});
