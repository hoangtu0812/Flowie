import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { documentFrontMatter } from '../lib/document-front-matter';
import { markdownHeadings } from '../lib/markdown-headings';

test('document front matter strips metadata and accepts bounded Mermaid display options', () => {
   const source =
      '\uFEFF---\r\nmermaid:\r\n  theme: default\r\n  flowchart:\r\n    curve: linear\r\n    nodeSpacing: 60\r\n---\r\n# Body';
   assert.deepEqual(documentFrontMatter(source), {
      body: '# Body',
      config: { theme: 'default', flowchart: { curve: 'linear', nodeSpacing: 60 } },
   });
   assert.deepEqual(documentFrontMatter('# No metadata'), { body: '# No metadata', config: {} });
   assert.deepEqual(markdownHeadings('---\ntitle: |\n  # Hidden\n---\n# Visible'), [
      { level: 1, text: 'Visible', id: 'visible' },
   ]);
});

test('metadata cannot lower Mermaid security or import arbitrary settings/prototype properties', () => {
   const source =
      '---\nmermaid:\n  theme: forest\n  securityLevel: loose\n  secure: []\n  dompurifyConfig: {ADD_TAGS: [script]}\n  themeCSS: unsafe\n  __proto__: {polluted: true}\n  flowchart: {curve: linear, htmlLabels: true}\n---\nBody';
   assert.deepEqual(documentFrontMatter(source), {
      body: 'Body',
      config: { theme: 'forest', flowchart: { curve: 'linear' } },
   });
   assert.equal(({} as { polluted?: boolean }).polluted, undefined);
   assert.equal(documentFrontMatter('# Other').config.theme, undefined);
});

test('invalid, duplicate, aliased and oversized YAML fail safely without hiding the body', () => {
   for (const header of [
      'mermaid: [',
      'mermaid: {theme: invalid}',
      'mermaid: {flowchart: {nodeSpacing: 999999}}',
      'mermaid: {theme: default, theme: dark}',
      'ref: &ref {theme: dark}\nmermaid: *ref',
      `title: ${'a'.repeat(32769)}`,
   ]) {
      const result = documentFrontMatter(`---\n${header}\n---\nRetained body`);
      assert.equal(result.body, 'Retained body');
      assert.equal(result.error, true);
      assert.deepEqual(result.config, {});
   }
   const unfinished = '---\nmermaid:\nBody without closing delimiter';
   assert.equal(documentFrontMatter(unfinished).body, unfinished);
});

import { readMermaidPreferences, defaultMermaidPreferences } from '../lib/mermaid-preferences';
test('Mermaid preferences accept display allowlists only and recover invalid stored data', () => {
   assert.deepEqual(readMermaidPreferences('{'), defaultMermaidPreferences);
   assert.deepEqual(
      readMermaidPreferences(
         JSON.stringify({
            theme: 'dark',
            curve: 'linear',
            customBackground: true,
            background: 'transparent',
            securityLevel: 'loose',
         })
      ),
      { theme: 'dark', curve: 'linear', customBackground: true, background: 'transparent' }
   );
   assert.deepEqual(
      readMermaidPreferences(
         JSON.stringify({
            theme: '__proto__',
            curve: 'unsafe',
            customBackground: 'true',
            background: 'url(unsafe)',
         })
      ),
      defaultMermaidPreferences
   );
});
