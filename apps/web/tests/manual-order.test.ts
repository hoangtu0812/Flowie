import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareManual } from '../features/manual-order/order';

test('manual positions preserve bigint precision above Number.MAX_SAFE_INTEGER', () => {
   const items = [
      { id: 'a', manualOrder: '9007199254740993' },
      { id: 'z', manualOrder: '9007199254740992' },
   ];
   assert.deepEqual(
      items.sort(compareManual).map((item) => item.id),
      ['z', 'a']
   );
});
test('new items use zero and equal positions have deterministic ID ordering', () => {
   assert.deepEqual(
      [{ id: 'z', manualOrder: '1024' }, { id: 'b' }, { id: 'a', manualOrder: '0' }]
         .sort(compareManual)
         .map((item) => item.id),
      ['a', 'b', 'z']
   );
});
