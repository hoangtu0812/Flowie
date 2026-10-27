import assert from 'node:assert/strict';
import test from 'node:test';
import { fitScale, stepZoom, wrapIndex } from '../lib/image-viewer';

test('zoom steps through fixed levels and stops at both ends', () => {
   assert.equal(stepZoom(1, 1), 1.5);
   assert.equal(stepZoom(1, -1), 0.75);
   assert.equal(stepZoom(4, 1), 4);
   assert.equal(stepZoom(0.25, -1), 0.25);
   assert.equal(stepZoom(1.2, 1), 1.5);
   assert.equal(stepZoom(1.2, -1), 1);
});

test('navigation wraps around the gallery', () => {
   assert.equal(wrapIndex(0, -1, 3), 2);
   assert.equal(wrapIndex(2, 1, 3), 0);
   assert.equal(wrapIndex(1, 1, 3), 2);
   assert.equal(wrapIndex(0, 1, 0), 0);
});

test('large images shrink to fit while small ones keep their size', () => {
   assert.equal(fitScale(4000, 2000, 1000, 1000), 0.25);
   assert.equal(fitScale(200, 100, 1000, 1000), 1);
   assert.equal(fitScale(0, 0, 1000, 1000), 1);
});
