import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutosaveController } from '../features/documents/autosave-controller';

test('a save boundary flushes the current draft before returning', async () => {
   const writes: string[] = [];
   const controller = new AutosaveController('old', async (draft) => {
      writes.push(draft);
   });
   controller.update('new');
   assert.equal(await controller.flush(), true);
   assert.deepEqual(writes, ['new']);
   assert.equal(controller.getSnapshot().dirty, false);
});

test('overlapping save boundaries serialize writes and drain edits made during a save', async () => {
   let release!: () => void;
   const held = new Promise<void>((resolve) => {
      release = resolve;
   });
   const writes: string[] = [];
   const controller = new AutosaveController('initial', async (draft) => {
      writes.push(draft);
      if (writes.length === 1) await held;
   });
   controller.update('first');
   const first = controller.flush();
   controller.update('latest');
   const second = controller.flush();
   assert.equal(first, second);
   release();
   await second;
   assert.deepEqual(writes, ['first', 'latest']);
   assert.equal(controller.getSnapshot().dirty, false);
});

test('a failed save retains a dirty draft and allows an explicit retry', async () => {
   let fail = true;
   const controller = new AutosaveController('old', async () => {
      if (fail) throw new Error('Offline');
   });
   controller.update('unsaved');
   assert.equal(await controller.flush(), false);
   assert.equal(controller.getSnapshot().draft, 'unsaved');
   assert.equal(controller.getSnapshot().error, 'Offline');
   assert.equal(controller.getSnapshot().dirty, true);
   fail = false;
   assert.equal(await controller.flush(), true);
   assert.equal(controller.getSnapshot().error, undefined);
});
