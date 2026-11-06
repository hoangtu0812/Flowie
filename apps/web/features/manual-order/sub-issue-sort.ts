export type SubIssueSort =
   'manual' | 'identifier-asc' | 'identifier-desc' | 'status-asc' | 'status-desc';

/** Sorts siblings only; the tree retains each parent relationship and manual order is never overwritten.
 * VI: Chỉ sắp xếp anh em; cây giữ nguyên quan hệ cha và không ghi đè thứ tự thủ công. */
export function sortSubIssues<T extends { id: string; identifier: string; status: { id: string } }>(
   items: readonly T[],
   sort: SubIssueSort,
   statuses: readonly { id: string }[]
): T[] {
   if (sort === 'manual') return [...items];
   const positions = new Map(statuses.map((status, index) => [status.id, index]));
   const direction = sort.endsWith('desc') ? -1 : 1;
   const identifier = (a: T, b: T) =>
      a.identifier.localeCompare(b.identifier, 'en', { numeric: true });
   return [...items].sort((a, b) => {
      const comparison = sort.startsWith('status')
         ? (positions.get(a.status.id) ?? statuses.length) -
           (positions.get(b.status.id) ?? statuses.length)
         : identifier(a, b);
      return comparison * direction || identifier(a, b) || a.id.localeCompare(b.id);
   });
}

/**
 * Siblings in their saved manual order, the order the sub-issues API returns (`manual_order`, then
 * id). Screens that receive issues in another order, such as the project Timeline, apply it before
 * `sortSubIssues` so both show the same tree.
 * VI: Anh em theo thứ tự thủ công đã lưu, đúng thứ tự API sub-issues trả (`manual_order`, rồi id).
 * VI: Màn hình nhận issue theo thứ tự khác, như Timeline project, áp dụng hàm này trước
 * VI: `sortSubIssues` để hai nơi hiển thị cùng một cây.
 */
export function byManualOrder<T extends { id: string; manualOrder?: string }>(
   items: readonly T[]
): T[] {
   const position = (item: T) => BigInt(item.manualOrder || '0');
   return [...items].sort((a, b) => {
      const [left, right] = [position(a), position(b)];
      if (left !== right) return left < right ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
   });
}
