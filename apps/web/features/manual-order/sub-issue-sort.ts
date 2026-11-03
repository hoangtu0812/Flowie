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
