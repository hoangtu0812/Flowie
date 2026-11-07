import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseAnnouncement } from '../lib/release';

test('a release is announced once per account and never before preferences are known', () => {
   // Built outside the repository: no version to name, so nothing is claimed.
   assert.equal(releaseAnnouncement('', null, 'saved'), 'idle');
   assert.equal(releaseAnnouncement('', '0.12.0', 'saved'), 'idle');
   // The version last seen is unreadable while preferences load or fail.
   assert.equal(releaseAnnouncement('0.13.0', null, 'loading'), 'wait');
   assert.equal(releaseAnnouncement('0.13.0', '0.12.0', 'loading'), 'wait');
   assert.equal(releaseAnnouncement('0.13.0', '0.12.0', 'error'), 'wait');
   // No recorded version: adopt this one silently instead of interrupting.
   assert.equal(releaseAnnouncement('0.13.0', null, 'saved'), 'adopt');
   assert.equal(releaseAnnouncement('0.13.0', undefined, 'saved'), 'adopt');
   assert.equal(releaseAnnouncement('0.13.0', '', 'saved'), 'adopt');
   // An older recorded version is the one case that shows the notes.
   assert.equal(releaseAnnouncement('0.13.0', '0.12.0', 'saved'), 'announce');
   assert.equal(releaseAnnouncement('0.13.0', '0.12.0', 'pending'), 'announce');
   assert.equal(releaseAnnouncement('0.13.0', '0.12.0', 'saving'), 'announce');
   // Already told about this exact release, including a downgraded deployment.
   assert.equal(releaseAnnouncement('0.13.0', '0.13.0', 'saved'), 'idle');
   assert.equal(releaseAnnouncement('0.13.0', '0.14.0', 'saved'), 'announce');
});
