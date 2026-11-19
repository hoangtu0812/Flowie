import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fittingChipCount } from '../features/issues/chip-fit';

test('chips fill the column and keep room for the +N counter', () => {
   // All three fit: 40 + 4 + 40 + 4 + 40 = 128.
   // VI: Cả ba vừa: 40 + 4 + 40 + 4 + 40 = 128.
   assert.equal(fittingChipCount([40, 40, 40], 20, 128, 4), 3);
   // Two chips plus "+1" need 40 + 4 + 40 + 4 + 20 = 108.
   // VI: Hai chip cộng "+1" cần 40 + 4 + 40 + 4 + 20 = 108.
   assert.equal(fittingChipCount([40, 40, 40], 20, 127, 4), 2);
   assert.equal(fittingChipCount([40, 40, 40], 20, 107, 4), 1);
   // A column narrower than the first chip still shows it, truncated.
   // VI: Cột hẹp hơn chip đầu vẫn hiện chip đó, bị cắt ngắn.
   assert.equal(fittingChipCount([120, 40], 20, 60, 4), 1);
   assert.equal(fittingChipCount([], 20, 100, 4), 0);
});
