/**
 * Formats a queue lag in whole seconds as the two largest units, for example `45s`, `12m`,
 * `13h 47m` or `2d 3h`, so long backlogs stay readable instead of showing `49644s`.
 * Negative or fractional input is clamped down to whole non-negative seconds.
 * VI: Định dạng độ trễ hàng đợi (giây nguyên) thành hai đơn vị lớn nhất, ví dụ `45s`, `12m`,
 * `13h 47m` hoặc `2d 3h`, để backlog dài vẫn dễ đọc thay vì hiện `49644s`. Giá trị âm hoặc lẻ
 * được làm tròn xuống thành số giây nguyên không âm.
 */
export function formatLag(seconds: number): string {
   const total = Math.max(0, Math.floor(seconds));
   if (total < 60) return `${total}s`;
   const minutes = Math.floor(total / 60);
   if (minutes < 60) return `${minutes}m`;
   const hours = Math.floor(minutes / 60);
   if (hours < 24) return `${hours}h ${minutes % 60}m`;
   return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
