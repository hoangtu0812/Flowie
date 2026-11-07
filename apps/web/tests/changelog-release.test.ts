import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { releaseFromChangelog } from '../next.config';
import { noteText } from '../lib/release';

const sample = [
   '# Changelog',
   '',
   '## Unreleased',
   '',
   '- Work that has not shipped yet and must stay invisible. (DTD-999)',
   '  VI: Việc chưa phát hành và phải chưa hiển thị.',
   '',
   '## [1.2.3] — 2026-11-07 21:10 +07',
   '',
   '### Added',
   '',
   '- An entry whose English sentence wraps across',
   '  more than one line, and ends with its references. (DTD-491, #170, b019c3f5)',
   '  VI: Một mục có câu tiếng Anh dài,',
   '  trải qua nhiều dòng. (DTD-491)',
   '- An entry written before the bilingual rule. (#19)',
   '',
   '## [1.2.2] — 2026-11-01 10:00 +07',
   '',
   '- An older release nobody should be shown. (#1)',
   '',
].join('\n');

test('release notes keep the two languages apart and drop developer references', () => {
   const release = releaseFromChangelog(sample);
   assert.equal(release.version, '1.2.3');
   assert.equal(release.releasedAt, '2026-11-07 21:10 +07');
   // Unreleased work and older releases are both out of the running release.
   assert.equal(release.notes.length, 2);
   assert.deepEqual(release.notes[0], {
      en: 'An entry whose English sentence wraps across more than one line, and ends with its references.',
      vi: 'Một mục có câu tiếng Anh dài, trải qua nhiều dòng.',
   });
   // Entries older than the bilingual rule have no Vietnamese half to show.
   assert.deepEqual(release.notes[1], {
      en: 'An entry written before the bilingual rule.',
      vi: '',
   });
   assert.equal(noteText(release.notes[0], 'en'), release.notes[0].en);
   assert.equal(noteText(release.notes[0], 'vi'), release.notes[0].vi);
   assert.equal(noteText(release.notes[1], 'vi'), release.notes[1].en);
   // The menu preview shortens each language on a word boundary.
   assert.equal(
      release.highlights[0].en,
      'An entry whose English sentence wraps across more than one line, and…'
   );
   assert.equal(release.highlights[1].vi, '');
});

test('a changelog with no released section names no version at all', () => {
   for (const markdown of ['', '# Changelog\n\n## Unreleased\n\n- Pending. (#2)\n']) {
      const release = releaseFromChangelog(markdown);
      assert.deepEqual(release, { version: '', releasedAt: '', highlights: [], notes: [] });
   }
});

test("this repository's own changelog produces notes a person can read", () => {
   const release = releaseFromChangelog(readFileSync('../../CHANGELOG.md', 'utf8'));
   assert.match(release.version, /^\d+\.\d+\.\d+$/);
   assert.ok(release.notes.length > 0);
   for (const note of release.notes) {
      assert.ok(note.en.length > 0, 'every entry has an English sentence');
      // The Vietnamese line must not end up inside the English one, and the
      // task, pull request and commit references must not reach the reader.
      for (const text of [note.en, note.vi]) {
         assert.doesNotMatch(text, /\bVI:/);
         assert.doesNotMatch(text, /\((?:DTD-\d+|#\d+)[^()]*\)\s*$/);
      }
   }
});
