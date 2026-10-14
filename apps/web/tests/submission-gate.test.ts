import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SubmissionGate } from '../features/shared/submission-gate';

test('double submission runs one request and one completion effect', async () => {
   const gate = new SubmissionGate();
   let requests = 0,
      completions = 0;
   const operation = async () => {
      requests += 1;
      await Promise.resolve();
      completions += 1;
   };
   await Promise.all([gate.run(operation), gate.run(operation)]);
   assert.equal(requests, 1);
   assert.equal(completions, 1);
   await gate.run(operation);
   assert.equal(requests, 2);
});

test('a failed submission releases the gate for an explicit retry', async () => {
   const gate = new SubmissionGate();
   await assert.rejects(
      gate.run(async () => {
         throw new Error('Offline');
      }),
      /Offline/
   );
   let retried = false;
   await gate.run(async () => {
      retried = true;
   });
   assert.equal(retried, true);
});
