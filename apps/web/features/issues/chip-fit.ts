/**
 * Number of chips that fit in `available` pixels when chips of `widths` sit in a row `gap` apart.
 * While some chips stay hidden, room for the "+N" counter (`overflowWidth` plus a gap) is kept.
 * At least one chip is returned whenever there is one, so a narrow column still shows the first
 * chip (truncated) instead of a bare counter.
 * VI: Số chip vừa trong `available` pixel khi các chip rộng `widths` xếp một hàng cách nhau `gap`.
 * VI: Khi còn chip bị ẩn thì chừa chỗ cho bộ đếm "+N" (`overflowWidth` cộng một gap). Luôn trả ít
 * VI: nhất một chip nếu có, để cột hẹp vẫn hiện chip đầu (bị cắt ngắn) thay vì chỉ có bộ đếm.
 */
export function fittingChipCount(
   widths: number[],
   overflowWidth: number,
   available: number,
   gap: number
): number {
   let used = 0;
   for (let index = 0; index < widths.length; index++) {
      used += (index ? gap : 0) + widths[index];
      const hidden = widths.length - index - 1;
      if (used + (hidden ? gap + overflowWidth : 0) > available) return Math.max(1, index);
   }
   return widths.length;
}
