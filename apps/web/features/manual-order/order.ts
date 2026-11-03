export type OrderedItem = { id: string; manualOrder?: string; parentIssueId?: string | null };

export function compareManual(a: OrderedItem, b: OrderedItem) {
   // API positions are decimal strings because PostgreSQL BIGINT exceeds safe JavaScript numbers.
   // VI: Vị trí API là chuỗi thập phân vì BIGINT PostgreSQL vượt giới hạn số an toàn của JavaScript.
   const left = BigInt(a.manualOrder ?? '0');
   const right = BigInt(b.manualOrder ?? '0');
   return left < right ? -1 : left > right ? 1 : a.id.localeCompare(b.id);
}

/** Reconciles React's item order with sortable's optimistic DOM before server refresh.
 * VI: Đồng bộ thứ tự item của React với DOM optimistic của sortable trước khi tải lại server. */
export function moveInList<T extends OrderedItem>(
   items: T[],
   sourceId: string,
   targetId: string,
   placement: 'before' | 'after'
): T[] {
   const source = items.find((item) => item.id === sourceId);
   if (!source || sourceId === targetId) return items;
   const next = items.filter((item) => item.id !== sourceId);
   const target = next.findIndex((item) => item.id === targetId);
   if (target < 0) return items;
   next.splice(target + (placement === 'after' ? 1 : 0), 0, source);
   return next;
}
