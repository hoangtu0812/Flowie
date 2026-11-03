export type ColumnSortKey =
   | 'title'
   | 'labels'
   | 'project'
   | 'startDate'
   | 'targetDate'
   | 'estimatedEffort'
   | 'actualEffort'
   | 'cycle'
   | 'created'
   | 'dueDate'
   | 'assignee';
export type ColumnSort = { key: ColumnSortKey; direction: 'asc' | 'desc' };

export function toggleColumnSort(
   sorts: ColumnSort[],
   key: ColumnSortKey,
   additive: boolean
): ColumnSort[] {
   const current = sorts.find((sort) => sort.key === key);
   const next =
      current?.direction === 'desc'
         ? undefined
         : { key, direction: current ? ('desc' as const) : ('asc' as const) };
   if (!additive) return next ? [next] : [];
   if (current) return sorts.flatMap((sort) => (sort.key === key ? (next ? [next] : []) : [sort]));
   return sorts.length < 5 && next ? [...sorts, next] : sorts;
}
